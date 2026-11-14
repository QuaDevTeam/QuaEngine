//! Main-thread C ABI for Unity. Each handle owns an independent JS realm.
//! Callbacks borrow their output only until the next callback; it is copied here.
use rquickjs::{Context, Ctx, Function, IntoJs, Runtime, TypedArray, Value};
use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

const MAX_BYTES: usize = 512 * 1024 * 1024;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
thread_local! {
    static VMS: RefCell<HashMap<u64, Vm>> = RefCell::new(HashMap::new());
    static LAST_ERROR: RefCell<String> = const { RefCell::new(String::new()) };
}

#[repr(C)]
#[derive(Default)]
pub struct BridgeReply {
    pub data: *const u8,
    pub length: usize,
}

pub type BridgeCallback = unsafe extern "C" fn(
    user: *mut c_void,
    method: *const u8,
    method_length: usize,
    payload: *const u8,
    payload_length: usize,
    bytes: *const u8,
    bytes_length: usize,
    reply: *mut BridgeReply,
) -> i32;

#[derive(Clone, Copy)]
struct Bridge {
    callback: BridgeCallback,
    user: *mut c_void,
}

impl Bridge {
    fn call(self, method: &str, payload: &str, bytes: &[u8]) -> rquickjs::Result<Vec<u8>> {
        let mut reply = BridgeReply::default();
        let status = unsafe {
            (self.callback)(
                self.user,
                method.as_ptr(),
                method.len(),
                payload.as_ptr(),
                payload.len(),
                bytes.as_ptr(),
                bytes.len(),
                &mut reply,
            )
        };
        if reply.length > MAX_BYTES || (reply.data.is_null() && reply.length != 0) {
            return Err(rquickjs::Error::new_from_js_message(
                "host",
                "bytes",
                "Invalid host reply",
            ));
        }
        let data = if reply.length == 0 {
            Vec::new()
        } else {
            unsafe { std::slice::from_raw_parts(reply.data, reply.length) }.to_vec()
        };
        if status != 0 {
            return Err(rquickjs::Error::new_from_js_message(
                "host",
                "bytes",
                String::from_utf8_lossy(&data),
            ));
        }
        Ok(data)
    }
    fn text(self, method: &str, payload: &str, bytes: &[u8]) -> rquickjs::Result<String> {
        String::from_utf8(self.call(method, payload, bytes)?).map_err(|error| {
            rquickjs::Error::new_from_js_message("host", "string", error.to_string())
        })
    }
}

struct Bytes(Vec<u8>);
impl<'js> IntoJs<'js> for Bytes {
    fn into_js(self, ctx: &Ctx<'js>) -> rquickjs::Result<Value<'js>> {
        TypedArray::<u8>::new(ctx.clone(), self.0)?.into_js(ctx)
    }
}

// Drop order matters: context before runtime. Never share a VM across threads.
struct Vm {
    context: Context,
    runtime: Runtime,
    error: String,
}

fn exception(ctx: &Ctx<'_>, error: rquickjs::Error) -> String {
    if error.is_exception() {
        let value = ctx.catch();
        if let Some(object) = value.as_object() {
            let message = object.get::<_, String>("message").unwrap_or_default();
            let stack = object.get::<_, String>("stack").unwrap_or_default();
            return format!("{message}\n{stack}");
        }
        return format!("JavaScript exception: {value:?}");
    }
    error.to_string()
}

impl Vm {
    fn new(source: &[u8], bridge: Bridge) -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        runtime.set_memory_limit(1024 * 1024 * 1024);
        runtime.set_max_stack_size(4 * 1024 * 1024);
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        context.with(|ctx| {
            let result = (|| -> rquickjs::Result<()> {
                let globals = ctx.globals();
                globals.set(
                    "__quaCall",
                    Function::new(ctx.clone(), move |method: String, payload: String| {
                        bridge.text(&method, &payload, &[])
                    })?,
                )?;
                globals.set(
                    "__quaRead",
                    Function::new(ctx.clone(), move |path: String| {
                        bridge.call("read_bytes", &path, &[]).map(Bytes)
                    })?,
                )?;
                globals.set(
                    "__quaWrite",
                    Function::new(
                        ctx.clone(),
                        move |path: String, bytes: TypedArray<'_, u8>| {
                            bridge
                                .text("write_bytes", &path, bytes.as_bytes().unwrap_or_default())
                                .map(|value| value == "true")
                        },
                    )?,
                )?;
                globals.set(
                    "__quaResource",
                    Function::new(
                        ctx.clone(),
                        move |metadata: String, bytes: TypedArray<'_, u8>| {
                            bridge.text(
                                "resource_create",
                                &metadata,
                                bytes.as_bytes().unwrap_or_default(),
                            )
                        },
                    )?,
                )?;
                globals.set(
                    "__quaDecodeUtf8",
                    Function::new(ctx.clone(), |bytes: TypedArray<'_, u8>| {
                        String::from_utf8_lossy(bytes.as_bytes().unwrap_or_default()).into_owned()
                    })?,
                )?;
                globals.set(
                    "__quaEncodeUtf8",
                    Function::new(ctx.clone(), |text: String| Bytes(text.into_bytes()))?,
                )?;
                ctx.eval::<(), _>(source)?;
                Ok(())
            })();
            result.map_err(|error| exception(&ctx, error))
        })?;
        Ok(Self {
            context,
            runtime,
            error: String::new(),
        })
    }
    fn tick(&mut self, now: f64, events: &str) -> Result<(), String> {
        if !self.error.is_empty() {
            return Err(self.error.clone());
        }
        self.context.with(|ctx| {
            let result = (|| -> rquickjs::Result<()> {
                let tick: Function = ctx.globals().get("__quaTick")?;
                tick.call::<_, ()>((now, events))
            })();
            result.map_err(|error| exception(&ctx, error))
        })?;
        // Yield between jobs, without interrupting a synchronous store transaction.
        let deadline = Instant::now() + Duration::from_millis(4);
        for _ in 0..4096 {
            match self.runtime.execute_pending_job() {
                Ok(true) => {}
                Ok(false) => break,
                Err(error) => {
                    return Err(error
                        .0
                        .with(|ctx| exception(&ctx, rquickjs::Error::Exception)))
                }
            }
            if Instant::now() >= deadline {
                break;
            }
        }
        Ok(())
    }
}

fn error(message: impl Into<String>) {
    LAST_ERROR.with(|value| *value.borrow_mut() = message.into());
}
fn guarded<T: Default>(body: impl FnOnce() -> T) -> T {
    catch_unwind(AssertUnwindSafe(body)).unwrap_or_else(|_| {
        error("Unity VM panic contained at C ABI boundary");
        T::default()
    })
}
unsafe fn input<'a>(data: *const u8, length: usize) -> Result<&'a [u8], String> {
    if length > MAX_BYTES || (data.is_null() && length != 0) {
        return Err("Invalid input buffer".into());
    }
    Ok(if length == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(data, length) }
    })
}

/// # Safety
/// Buffers must be readable for their lengths. Callback/user must outlive the handle,
/// run on the creating thread and never throw or call back into this VM reentrantly.
#[no_mangle]
pub unsafe extern "C" fn qua_unity_create(
    source: *const u8,
    length: usize,
    callback: Option<BridgeCallback>,
    user: *mut c_void,
) -> u64 {
    guarded(|| {
        let result = (|| {
            let source = unsafe { input(source, length)? };
            let callback = callback.ok_or("Missing Unity host callback")?;
            let vm = Vm::new(source, Bridge { callback, user })?;
            let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
            VMS.with(|vms| {
                vms.try_borrow_mut()
                    .map_err(|_| "Reentrant VM creation".to_string())
                    .map(|mut map| {
                        map.insert(id, vm);
                        id
                    })
            })
        })();
        match result {
            Ok(id) => id,
            Err(message) => {
                error(message);
                0
            }
        }
    })
}

/// # Safety
/// Events must be a readable UTF-8 buffer. Use the creating thread.
#[no_mangle]
pub unsafe extern "C" fn qua_unity_tick(
    id: u64,
    now: f64,
    events: *const u8,
    length: usize,
) -> i32 {
    guarded(|| {
        VMS.with(|vms| {
            let Ok(mut map) = vms.try_borrow_mut() else {
                error("Reentrant Unity VM call");
                return 0;
            };
            let Some(vm) = map.get_mut(&id) else {
                error("Unknown Unity VM handle or wrong thread");
                return 0;
            };
            let result = unsafe { input(events, length) }
                .and_then(|bytes| std::str::from_utf8(bytes).map_err(|e| e.to_string()))
                .and_then(|events| vm.tick(now, events));
            match result {
                Ok(()) => 1,
                Err(message) => {
                    vm.error = message.clone();
                    error(message);
                    0
                }
            }
        })
    })
}

#[no_mangle]
pub extern "C" fn qua_unity_shutdown(id: u64) -> i32 {
    guarded(|| {
        VMS.with(|vms| {
            let Ok(mut map) = vms.try_borrow_mut() else {
                return 0;
            };
            let Some(vm) = map.get_mut(&id) else {
                return 0;
            };
            vm.context.with(|ctx| {
                match ctx
                    .eval::<(), _>("if (typeof __quaShutdown === 'function') { __quaShutdown(); }")
                {
                    Ok(()) => 1,
                    Err(e) => {
                        vm.error = exception(&ctx, e);
                        error(vm.error.clone());
                        0
                    }
                }
            })
        })
    })
}

#[no_mangle]
pub extern "C" fn qua_unity_is_closed(id: u64) -> i32 {
    guarded(|| {
        VMS.with(|vms| {
            let Ok(map) = vms.try_borrow() else {
                return 0;
            };
            map.get(&id).map_or(1, |vm| {
                vm.context.with(|ctx| {
                    i32::from(ctx.globals().get::<_, bool>("__quaClosed").unwrap_or(false))
                })
            })
        })
    })
}

#[no_mangle]
pub extern "C" fn qua_unity_drop(id: u64) -> i32 {
    guarded(|| {
        VMS.with(|vms| match vms.try_borrow_mut() {
            Ok(mut map) => i32::from(map.remove(&id).is_some()),
            Err(_) => 0,
        })
    })
}

/// Returns the required UTF-8 length; writes at most capacity bytes, without NUL.
/// # Safety
/// Output must be writable for capacity bytes unless null with zero capacity.
#[no_mangle]
pub unsafe extern "C" fn qua_unity_last_error(output: *mut u8, capacity: usize) -> usize {
    guarded(|| {
        LAST_ERROR.with(|message| {
            let message = message.borrow();
            if !output.is_null() {
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        message.as_ptr(),
                        output,
                        capacity.min(message.len()),
                    )
                };
            }
            message.len()
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    unsafe extern "C" fn bridge(
        _: *mut c_void,
        method: *const u8,
        n: usize,
        _: *const u8,
        _: usize,
        _: *const u8,
        _: usize,
        reply: *mut BridgeReply,
    ) -> i32 {
        let method = unsafe { std::str::from_utf8(std::slice::from_raw_parts(method, n)).unwrap() };
        let bytes: &'static [u8] = if method == "read_bytes" {
            &[0, 128, 255]
        } else {
            b"{\"value\":true}"
        };
        unsafe {
            *reply = BridgeReply {
                data: bytes.as_ptr(),
                length: bytes.len(),
            };
        };
        0
    }
    fn create(source: &str) -> u64 {
        unsafe {
            qua_unity_create(
                source.as_ptr(),
                source.len(),
                Some(bridge),
                std::ptr::null_mut(),
            )
        }
    }
    fn tick(id: u64) -> i32 {
        unsafe { qua_unity_tick(id, 1.0, b"[]".as_ptr(), 2) }
    }

    #[test]
    fn isolated_realms_bytes_promises_and_shutdown() {
        let source = "globalThis.steps=0; globalThis.__quaTick=()=>{if(__quaRead('x')[2]!==255)throw Error('bytes');Promise.resolve().then(()=>steps++);}; globalThis.__quaShutdown=()=>{globalThis.__quaClosed=true};";
        let a = create(source);
        let b = create(source);
        assert_ne!(a, 0);
        assert_ne!(a, b);
        assert_eq!(tick(a), 1);
        VMS.with(|vms| {
            let map = vms.borrow();
            assert_eq!(
                map[&a]
                    .context
                    .with(|ctx| ctx.eval::<i32, _>("steps").unwrap()),
                1
            );
            assert_eq!(
                map[&b]
                    .context
                    .with(|ctx| ctx.eval::<i32, _>("steps").unwrap()),
                0
            );
        });
        assert_eq!(qua_unity_shutdown(a), 1);
        assert_eq!(qua_unity_is_closed(a), 1);
        assert_eq!(qua_unity_drop(a), 1);
        assert_eq!(qua_unity_drop(a), 0);
        assert_eq!(tick(a), 0);
        assert_eq!(tick(b), 1);
        assert_eq!(qua_unity_drop(b), 1);
    }
    #[test]
    fn errors_invalid_buffers_and_wrong_thread_are_rejected() {
        assert_eq!(
            unsafe { qua_unity_create(std::ptr::null(), 1, Some(bridge), std::ptr::null_mut()) },
            0
        );
        assert_eq!(create("throw Error('fixture')"), 0);
        let id = create("globalThis.__quaTick=()=>{throw Error('tick fixture')}");
        assert_eq!(std::thread::spawn(move || tick(id)).join().unwrap(), 0);
        assert_eq!(tick(id), 0);
        let length = unsafe { qua_unity_last_error(std::ptr::null_mut(), 0) };
        let mut bytes = vec![0; length];
        unsafe {
            qua_unity_last_error(bytes.as_mut_ptr(), bytes.len());
        }
        assert!(String::from_utf8(bytes).unwrap().contains("tick fixture"));
        assert_eq!(qua_unity_drop(id), 1);
    }
}
