//! Versioned C boundary. Handles are thread-affine IDs, never dereferenced pointers.
mod runtime;
mod storage;
use runtime::Session;
use std::{
    cell::RefCell,
    collections::BTreeMap,
    ffi::c_void,
    sync::atomic::{AtomicU64, Ordering},
};

thread_local! {
    static SESSIONS: RefCell<BTreeMap<u64, Session>> = const { RefCell::new(BTreeMap::new()) };
    static ERROR: RefCell<String> = const { RefCell::new(String::new()) };
}
static NEXT: AtomicU64 = AtomicU64::new(1);

fn boundary(action: impl FnOnce() -> Result<(), String>) -> i32 {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(action)) {
        Ok(Ok(())) => {
            ERROR.with(|e| e.borrow_mut().clear());
            0
        }
        Ok(Err(error)) => {
            ERROR.with(|e| *e.borrow_mut() = error);
            -1
        }
        Err(_) => {
            ERROR.with(|e| *e.borrow_mut() = "Native SDK panic; destroy the session".into());
            -2
        }
    }
}
fn with_session(handle: u64, action: impl FnOnce(&mut Session) -> Result<(), String>) -> i32 {
    boundary(|| {
        SESSIONS.with(|sessions| {
            let mut sessions = sessions
                .try_borrow_mut()
                .map_err(|_| "Reentrant Native SDK call")?;
            action(
                sessions
                    .get_mut(&handle)
                    .ok_or("Invalid handle or wrong owner thread")?,
            )
        })
    })
}
unsafe fn text<'a>(data: *const u8, len: usize, max: usize) -> Result<&'a str, String> {
    if data.is_null() || len == 0 || len > max {
        return Err("Invalid UTF-8 input length/pointer".into());
    }
    std::str::from_utf8(std::slice::from_raw_parts(data, len)).map_err(|e| e.to_string())
}
// Output includes no NUL terminator. Query size with NULL/0; never writes a partial record.
unsafe fn copy(value: &str, output: *mut u8, capacity: usize) -> usize {
    if !output.is_null() && capacity >= value.len() {
        std::ptr::copy_nonoverlapping(value.as_ptr(), output, value.len());
    }
    value.len()
}
#[no_mangle]
pub extern "C" fn qua_native_abi_version() -> u32 {
    1
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_last_error(output: *mut u8, capacity: usize) -> usize {
    ERROR.with(|error| copy(&error.borrow(), output, capacity))
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_describe(output: *mut u8, capacity: usize) -> usize {
    let info = crate::startup::create_native_startup_host_info(
        crate::startup::compile_time_native_app_config(),
        None,
    )
    .unwrap();
    copy(&serde_json::to_string(&info).unwrap(), output, capacity)
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_create(config: *const u8, len: usize, handle: *mut u64) -> i32 {
    boundary(|| {
        if handle.is_null() {
            return Err("Output handle is NULL".into());
        }
        *handle = 0;
        let session = Session::create(text(config, len, 65536)?)?;
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        SESSIONS.with(|sessions| sessions.borrow_mut().insert(id, session));
        *handle = id;
        Ok(())
    })
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_open(handle: u64, request: *const u8, len: usize) -> i32 {
    with_session(handle, |session| session.open(text(request, len, 65536)?))
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_cancel(handle: u64, request: *const u8, len: usize) -> i32 {
    with_session(handle, |session| session.cancel(text(request, len, 65536)?))
}
#[no_mangle]
pub extern "C" fn qua_native_tick(handle: u64) -> i32 {
    with_session(handle, Session::tick)
}
#[no_mangle]
pub extern "C" fn qua_native_close(handle: u64) -> i32 {
    with_session(handle, Session::close)
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_poll(handle: u64, output: *mut u8, capacity: usize) -> usize {
    let mut size = 0;
    with_session(handle, |session| {
        if let Some(event) = session.events.front() {
            size = copy(event, output, capacity);
            if !output.is_null() && capacity >= size {
                session.events.pop_front();
            }
        }
        Ok(())
    });
    size
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_attach_metal_layer(
    handle: u64,
    layer: *mut c_void,
    width: u32,
    height: u32,
    scale: f64,
) -> i32 {
    with_session(handle, |session| {
        session.attach(layer, width, height, scale)
    })
}
#[no_mangle]
pub extern "C" fn qua_native_resize(handle: u64, width: u32, height: u32, scale: f64) -> i32 {
    with_session(handle, |session| session.resize(width, height, scale))
}
#[no_mangle]
pub unsafe extern "C" fn qua_native_input(handle: u64, input: *const u8, len: usize) -> i32 {
    with_session(handle, |session| session.input(text(input, len, 65536)?))
}
#[no_mangle]
pub extern "C" fn qua_native_destroy(handle: u64) -> i32 {
    boundary(|| {
        SESSIONS.with(|sessions| {
            let mut sessions = sessions
                .try_borrow_mut()
                .map_err(|_| "Reentrant Native SDK call")?;
            let session = sessions
                .get(&handle)
                .ok_or("Invalid handle or wrong owner thread")?;
            if session.opened && !session.closed {
                return Err(
                    "Call close, then tick/poll until closed before destroy (or use abort)".into(),
                );
            }
            sessions.remove(&handle);
            Ok(())
        })
    })
}
/// Deliberate forced eviction: no successful result or persistence guarantee.
#[no_mangle]
pub extern "C" fn qua_native_abort(handle: u64) -> i32 {
    boundary(|| {
        SESSIONS.with(|sessions| {
            sessions
                .try_borrow_mut()
                .map_err(|_| "Reentrant Native SDK call")?
                .remove(&handle)
                .ok_or("Invalid handle or wrong owner thread")?;
            Ok(())
        })
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_or_wrong_thread_handles_are_errors() {
        assert_eq!(qua_native_tick(u64::MAX), -1);
        assert_eq!(qua_native_destroy(u64::MAX), -1);
        assert_eq!(qua_native_abort(u64::MAX), -1);
    }
    #[test]
    fn relative_storage_paths_are_rejected_before_loading() {
        let config=br#"{"moduleDirectory":".","moduleManifestSha256":"invalid","storageDirectory":"relative"}"#;
        let mut id = 123;
        assert_eq!(
            unsafe { qua_native_create(config.as_ptr(), config.len(), &mut id) },
            -1
        );
        assert_eq!(id, 0);
        ERROR.with(|error| assert!(error.borrow().contains("absolute paths")));
    }
    #[test]
    fn null_input_never_creates_a_session() {
        let mut id = 123;
        assert_eq!(
            unsafe { qua_native_create(std::ptr::null(), 0, &mut id) },
            -1
        );
        assert_eq!(id, 0);
    }
}
