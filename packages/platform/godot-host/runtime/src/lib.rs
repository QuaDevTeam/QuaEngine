use godot::prelude::*;
use rquickjs::{Context, Ctx, Function, IntoJs, Runtime, TypedArray, Value};
use std::time::{Duration, Instant};

struct Bytes(Vec<u8>);
impl<'js> IntoJs<'js> for Bytes {
    fn into_js(self, ctx: &Ctx<'js>) -> rquickjs::Result<Value<'js>> {
        TypedArray::<u8>::new(ctx.clone(), self.0)?.into_js(ctx)
    }
}

struct QuaGodotExtension;

#[gdextension]
unsafe impl ExtensionLibrary for QuaGodotExtension {}

/// Owns only the JS VM. Game state remains in the ordinary QuaEngine JS runtime.
#[derive(GodotClass)]
#[class(base=RefCounted, init)]
struct QuaJsRuntime {
    context: Option<Context>,
    runtime: Option<Runtime>,
    error: String,
    base: Base<RefCounted>,
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

#[godot_api]
impl QuaJsRuntime {
    #[func]
    fn start(&mut self, source: GString, bridge: Callable) -> bool {
        self.stop();
        self.error.clear();
        match self.initialize(source.to_string(), bridge) {
            Ok(()) => true,
            Err(error) => {
                self.error = error;
                godot_error!("QuaEngine: {}", self.error);
                self.stop();
                false
            }
        }
    }

    fn initialize(&mut self, source: String, bridge: Callable) -> Result<(), String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        runtime.set_memory_limit(1024 * 1024 * 1024);
        runtime.set_max_stack_size(4 * 1024 * 1024);
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        context.with(|ctx| -> Result<(), String> {
            let json_bridge = bridge.clone();
            let read_bridge = bridge.clone();
            let write_bridge = bridge.clone();
            let globals = ctx.globals();
            let result = (|| -> rquickjs::Result<()> {
                globals.set("__quaCall", Function::new(ctx.clone(), move |method: String, payload: String| {
                    json_bridge.call(&[method.to_variant(), payload.to_variant()]).to::<GString>().to_string()
                })?)?;
                globals.set("__quaRead", Function::new(ctx.clone(), move |path: String| {
                    let value = read_bridge.call(&["read_bytes".to_variant(), path.to_variant()]);
                    let bytes = value.try_to::<PackedByteArray>().map_err(|_| rquickjs::Error::new_from_js("Variant", "PackedByteArray"))?;
                    Ok::<_, rquickjs::Error>(Bytes(bytes.to_vec()))
                })?)?;
                globals.set("__quaWrite", Function::new(ctx.clone(), move |path: String, bytes: TypedArray<'_, u8>| {
                    let bytes = PackedByteArray::from(bytes.as_bytes().unwrap_or_default());
                    write_bridge.call(&["write_bytes".to_variant(), path.to_variant(), bytes.to_variant()]).to::<bool>()
                })?)?;
                globals.set("__quaResource", Function::new(ctx.clone(), move |metadata: String, bytes: TypedArray<'_, u8>| {
                    let bytes = PackedByteArray::from(bytes.as_bytes().unwrap_or_default());
                    bridge.call(&["resource_create".to_variant(), metadata.to_variant(), bytes.to_variant()]).to::<GString>().to_string()
                })?)?;
                globals.set("__quaDecodeUtf8", Function::new(ctx.clone(), |bytes: TypedArray<'_, u8>| {
                    String::from_utf8_lossy(bytes.as_bytes().unwrap_or_default()).into_owned()
                })?)?;
                globals.set("__quaEncodeUtf8", Function::new(ctx.clone(), |text: String| {
                    Bytes(text.into_bytes())
                })?)?;
                ctx.eval::<(), _>(source.as_bytes())?;
                Ok(())
            })();
            result.map_err(|e| exception(&ctx, e))
        })?;
        self.runtime = Some(runtime);
        self.context = Some(context);
        Ok(())
    }

    #[func]
    fn tick(&mut self, now: f64, events: GString) -> bool {
        if !self.error.is_empty() { return false; }
        let Some(context) = &self.context else { return false; };
        let result = context.with(|ctx| {
            let result = (|| -> rquickjs::Result<()> {
                let tick: Function = ctx.globals().get("__quaTick")?;
                tick.call::<_, ()>((now, events.to_string()))
            })();
            result.map_err(|e| exception(&ctx, e))
        });
        if let Err(error) = result {
            self.error = error;
        } else if let Some(runtime) = &self.runtime {
            // Yield between jobs so skip/bootstrap chains cannot monopolize a frame.
            // Individual synchronous jobs still run to completion; never interrupt JS
            // halfway through a store transaction or a native resource operation.
            let deadline = Instant::now() + Duration::from_millis(4);
            for _ in 0..4096 {
                match runtime.execute_pending_job() {
                    Ok(true) => {},
                    Ok(false) => break,
                    Err(error) => {
                        self.error = error.0.with(|ctx| exception(&ctx, rquickjs::Error::Exception));
                        break;
                    }
                }
                if Instant::now() >= deadline { break; }
            }
        }
        if !self.error.is_empty() { godot_error!("QuaEngine: {}", self.error); }
        self.error.is_empty()
    }

    #[func]
    fn last_error(&self) -> GString { self.error.as_str().into() }

    #[func]
    fn inspect(&self) -> GString {
        let Some(context) = &self.context else { return "{}".into(); };
        let value = context.with(|ctx| {
            ctx.eval::<String, _>("JSON.stringify(globalThis.__quaInspect?.() || {})")
                .unwrap_or_else(|_| "{}".to_string())
        });
        value.as_str().into()
    }

    #[func]
    fn stop(&mut self) {
        // Context must be dropped before its runtime, including editor reload/quit.
        self.context.take();
        self.runtime.take();
    }
}
