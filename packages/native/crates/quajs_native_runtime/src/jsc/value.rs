//! Thread-confined, rooted JavaScriptCore C API values. No raw JS handle escapes
//! this module. Every value keeps its context alive and is protected from GC.
#[cfg(not(target_os = "windows"))]
use javascriptcore_sys as ffi;
#[cfg(target_os = "windows")]
#[allow(non_snake_case)]
mod ffi {
    pub use otter_jsc_sys::*;
    // Public C API entries absent from the distribution crate's minimal binding.
    extern "C" {
        pub fn JSGlobalContextCreateInGroup(
            group: JSContextGroupRef,
            class: JSClassRef,
        ) -> JSGlobalContextRef;
        pub fn JSContextGetGroup(context: JSContextRef) -> JSContextGroupRef;
        pub fn JSStringCreateWithCharacters(chars: *const u16, length: usize) -> JSStringRef;
    }
}
use std::{cell::Cell, fmt, ptr, rc::Rc, sync::OnceLock};

pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug)]
pub enum Error {
    JavaScript(String),
    WouldBlock,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::JavaScript(s) => f.write_str(s),
            Self::WouldBlock => f.write_str("Promise is pending"),
        }
    }
}
impl std::error::Error for Error {}
fn error(message: impl Into<String>) -> Error {
    Error::JavaScript(message.into())
}

struct JsString(ffi::JSStringRef);
impl JsString {
    fn new(text: &str) -> Self {
        let chars: Vec<u16> = text.encode_utf16().collect();
        // JSStringCreateWithCharacters copies the buffer, including embedded NULs.
        Self(unsafe { ffi::JSStringCreateWithCharacters(chars.as_ptr(), chars.len()) })
    }
    fn text(&self) -> String {
        unsafe {
            // Let JSC transcode in its optimized runtime. Rust's per-character
            // UTF-16 iterator is very expensive in the native dev profile.
            let mut bytes = vec![0; ffi::JSStringGetMaximumUTF8CStringSize(self.0)];
            let written =
                ffi::JSStringGetUTF8CString(self.0, bytes.as_mut_ptr().cast(), bytes.len());
            bytes.truncate(written.saturating_sub(1));
            String::from_utf8(bytes).expect("JavaScriptCore emitted UTF-8")
        }
    }
}
impl Drop for JsString {
    fn drop(&mut self) {
        unsafe { ffi::JSStringRelease(self.0) }
    }
}

extern "C" {
    // Exported by JavaScriptCore on Apple and JavaScriptCoreGTK. The callback is
    // deliberately absent: expiration terminates execution, never enters Rust.
    fn JSContextGroupSetExecutionTimeLimit(
        group: ffi::JSContextGroupRef,
        seconds: f64,
        callback: Option<unsafe extern "C" fn(ffi::JSContextRef, *mut std::ffi::c_void) -> bool>,
        data: *mut std::ffi::c_void,
    );
    fn JSContextGroupClearExecutionTimeLimit(group: ffi::JSContextGroupRef);
}

struct ContextInner {
    raw: ffi::JSGlobalContextRef,
    timeout_ms: Cell<u64>,
    depth: Cell<u32>,
}
impl Drop for ContextInner {
    fn drop(&mut self) {
        unsafe { ffi::JSGlobalContextRelease(self.raw) }
    }
}
#[derive(Clone)]
pub struct Context(Rc<ContextInner>);
impl Context {
    pub fn new() -> Result<Self> {
        // A separate context group gives each engine an independent heap/VM.
        let raw = unsafe { ffi::JSGlobalContextCreateInGroup(ptr::null_mut(), ptr::null_mut()) };
        if raw.is_null() {
            return Err(error("JavaScriptCore context allocation failed"));
        }
        let ctx = Self(Rc::new(ContextInner {
            raw,
            timeout_ms: Cell::new(1000),
            depth: Cell::new(0),
        }));
        ctx.eval::<(), _>(
            r#"
            Object.defineProperty(globalThis, '__quaJscObservePromise', { value(value) {
                if (!(value instanceof Promise)) return null;
                const result = { state: 0, value: undefined };
                value.then(value => { result.state = 1; result.value = value; },
                           reason => { result.state = 2; result.value = reason; });
                return result;
            }});
        "#,
        )?;
        Ok(ctx)
    }
    pub fn with<T>(&self, f: impl FnOnce(Context) -> T) -> T {
        struct Scope<'a>(&'a Context);
        impl Drop for Scope<'_> {
            fn drop(&mut self) {
                self.0.leave();
            }
        }
        self.enter();
        let _scope = Scope(self);
        f(self.clone())
    }
    pub fn set_execution_time_limit(&self, millis: u64) {
        self.0.timeout_ms.set(millis);
    }
    pub fn clear_execution_time_limit(&self) {
        unsafe {
            JSContextGroupClearExecutionTimeLimit(ffi::JSContextGetGroup(self.0.raw));
        }
    }
    fn enter(&self) {
        let depth = self.0.depth.get();
        self.0.depth.set(depth + 1);
        if depth != 0 {
            return;
        }
        unsafe {
            JSContextGroupSetExecutionTimeLimit(
                ffi::JSContextGetGroup(self.0.raw),
                self.0.timeout_ms.get().max(1) as f64 / 1000.0,
                None,
                ptr::null_mut(),
            );
        }
    }
    fn leave(&self) {
        let depth = self.0.depth.get() - 1;
        self.0.depth.set(depth);
        if depth == 0 {
            self.clear_execution_time_limit();
        }
    }
    fn checked(&self, raw: ffi::JSValueRef, exception: ffi::JSValueRef) -> Result<Value> {
        if !exception.is_null() {
            // Root the exception before any more JS allocations. Reading stack
            // can itself throw, so exception formatting is deliberately bounded.
            let value = self.value(exception);
            let text = value
                .string()
                .unwrap_or_else(|_| "JavaScriptCore exception".into());
            return Err(error(text));
        }
        if raw.is_null() {
            return Err(error("JavaScriptCore execution terminated"));
        }
        Ok(self.value(raw))
    }
    fn value(&self, raw: ffi::JSValueRef) -> Value {
        assert!(!raw.is_null());
        unsafe {
            ffi::JSValueProtect(self.0.raw, raw);
        }
        Value(Rc::new(ValueInner {
            ctx: self.clone(),
            raw,
        }))
    }
    pub fn eval<T: FromJs, S: AsRef<str>>(&self, source: S) -> Result<T> {
        self.eval_source(source.as_ref(), "qua-native:bridge")
    }
    pub fn eval_source<T: FromJs>(&self, source: &str, name: &str) -> Result<T> {
        let source = JsString::new(source);
        let name = JsString::new(name);
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        self.enter();
        let raw = unsafe {
            ffi::JSEvaluateScript(
                self.0.raw,
                source.0,
                ptr::null_mut(),
                name.0,
                1,
                &mut exception,
            )
        };
        self.leave();
        T::from_js(self, self.checked(raw, exception)?)
    }
    pub fn globals(&self) -> Object {
        Object(self.value(unsafe { ffi::JSContextGetGlobalObject(self.0.raw) }))
    }
    pub fn json_parse(&self, source: impl AsRef<str>) -> Result<Value> {
        let source = JsString::new(source.as_ref());
        let raw = unsafe { ffi::JSValueMakeFromJSONString(self.0.raw, source.0) };
        if raw.is_null() {
            Err(error("Invalid JSON"))
        } else {
            Ok(self.value(raw))
        }
    }
    pub fn json_stringify(&self, value: Value) -> Result<Option<JsText>> {
        self.check_context(&value)?;
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        self.enter();
        let raw =
            unsafe { ffi::JSValueCreateJSONString(self.0.raw, value.0.raw, 0, &mut exception) };
        self.leave();
        if !exception.is_null() {
            return self.checked(ptr::null_mut(), exception).map(|_| None);
        }
        Ok(if raw.is_null() {
            None
        } else {
            Some(JsText(JsString(raw).text()))
        })
    }
    fn check_context(&self, value: &Value) -> Result<()> {
        if Rc::ptr_eq(&self.0, &value.0.ctx.0) {
            Ok(())
        } else {
            Err(error("Cross-context JavaScriptCore value"))
        }
    }
    // JSC drains microtasks before returning from the outermost C API call.
    // Unlike QuickJS it has no separately pumped Promise job queue.
    pub fn install_console_writer(&self, name: &str) -> Result<()> {
        let name_ref = JsString::new(name);
        let raw = unsafe {
            ffi::JSObjectMakeFunctionWithCallback(self.0.raw, name_ref.0, Some(console_write))
        };
        self.globals().set(name, self.value(raw))
    }
}

// No panic or owned Context is created inside a C callback.
unsafe extern "C" fn console_write(
    ctx: ffi::JSContextRef,
    _: ffi::JSObjectRef,
    _: ffi::JSObjectRef,
    count: usize,
    args: *const ffi::JSValueRef,
    _: *mut ffi::JSValueRef,
) -> ffi::JSValueRef {
    let _ = std::panic::catch_unwind(|| {
        if count < 2 {
            return;
        }
        let args = std::slice::from_raw_parts(args, count);
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        let level = ffi::JSValueToStringCopy(ctx, args[0], &mut exception);
        if level.is_null() {
            return;
        }
        let level = JsString(level).text();
        let message = ffi::JSValueToStringCopy(ctx, args[1], &mut exception);
        if message.is_null() {
            return;
        }
        let message = JsString(message).text();
        let level = match level.as_str() {
            "error" => log::Level::Error,
            "warn" => log::Level::Warn,
            "debug" => log::Level::Debug,
            "trace" => log::Level::Trace,
            _ => log::Level::Info,
        };
        log::log!(target: "quajs_jsc::console", level, "{message}");
    });
    ffi::JSValueMakeUndefined(ctx)
}

struct ValueInner {
    ctx: Context,
    raw: ffi::JSValueRef,
}
impl Drop for ValueInner {
    fn drop(&mut self) {
        unsafe { ffi::JSValueUnprotect(self.ctx.0.raw, self.raw) }
    }
}
#[derive(Clone)]
pub struct Value(Rc<ValueInner>);
impl Value {
    pub fn new_undefined(ctx: Context) -> Self {
        ctx.value(unsafe { ffi::JSValueMakeUndefined(ctx.0.raw) })
    }
    pub fn from_object(object: Object) -> Self {
        object.0
    }
    pub fn is_undefined(&self) -> bool {
        unsafe { ffi::JSValueIsUndefined(self.0.ctx.0.raw, self.0.raw) }
    }
    pub fn is_null(&self) -> bool {
        unsafe { ffi::JSValueIsNull(self.0.ctx.0.raw, self.0.raw) }
    }
    pub fn is_object(&self) -> bool {
        unsafe { ffi::JSValueIsObject(self.0.ctx.0.raw, self.0.raw) }
    }
    pub fn is_array(&self) -> bool {
        unsafe { ffi::JSValueIsArray(self.0.ctx.0.raw, self.0.raw) }
    }
    pub fn is_function(&self) -> bool {
        self.is_object() && unsafe { ffi::JSObjectIsFunction(self.0.ctx.0.raw, self.0.raw as _) }
    }
    pub fn into_object(self) -> Option<Object> {
        self.is_object().then_some(Object(self))
    }
    pub fn into_array(self) -> Option<Array> {
        self.is_array().then_some(Array(Object(self)))
    }
    pub fn into_function(self) -> Option<Function> {
        self.is_function().then_some(Function(Object(self)))
    }
    pub fn as_promise(&self) -> Option<Promise> {
        let ctx = &self.0.ctx;
        let observe: Function = ctx.globals().get("__quaJscObservePromise").ok()?;
        let state: Value = observe.call((self.clone(),)).ok()?;
        state.into_object().map(Promise)
    }
    fn string(&self) -> Result<String> {
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        self.0.ctx.enter();
        let raw = unsafe { ffi::JSValueToStringCopy(self.0.ctx.0.raw, self.0.raw, &mut exception) };
        self.0.ctx.leave();
        if raw.is_null() {
            Err(error("Could not convert JavaScript value to string"))
        } else {
            Ok(JsString(raw).text())
        }
    }
}

#[derive(Clone)]
pub struct Object(Value);
impl Object {
    pub fn new(ctx: Context) -> Result<Self> {
        Ok(Self(ctx.value(unsafe {
            ffi::JSObjectMake(ctx.0.raw, ptr::null_mut(), ptr::null_mut())
        })))
    }
    pub fn get<K: AsRef<str>, T: FromJs>(&self, key: K) -> Result<T> {
        let key = JsString::new(key.as_ref());
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        let ctx = &self.0 .0.ctx;
        ctx.enter();
        let raw = unsafe {
            ffi::JSObjectGetProperty(ctx.0.raw, self.0 .0.raw as _, key.0, &mut exception)
        };
        ctx.leave();
        T::from_js(ctx, ctx.checked(raw, exception)?)
    }
    pub fn set<T: IntoJs>(&self, key: &str, value: T) -> Result<()> {
        let ctx = &self.0 .0.ctx;
        let value = value.into_js(ctx)?;
        let key = JsString::new(key);
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        ctx.enter();
        unsafe {
            ffi::JSObjectSetProperty(
                ctx.0.raw,
                self.0 .0.raw as _,
                key.0,
                value.0.raw,
                0,
                &mut exception,
            );
        }
        ctx.leave();
        if exception.is_null() {
            Ok(())
        } else {
            ctx.checked(ptr::null_mut(), exception).map(|_| ())
        }
    }
}
#[derive(Clone)]
pub struct Array(Object);
impl Array {
    pub fn new(ctx: Context) -> Result<Self> {
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        let raw = unsafe { ffi::JSObjectMakeArray(ctx.0.raw, 0, ptr::null_mut(), &mut exception) };
        Ok(Self(Object(ctx.checked(raw, exception)?)))
    }
    pub fn len(&self) -> usize {
        self.0.get::<_, f64>("length").unwrap_or(0.0) as usize
    }
    pub fn get<T: FromJs>(&self, index: usize) -> Result<T> {
        self.0.get(index.to_string())
    }
    pub fn set<T: IntoJs>(&self, index: usize, value: T) -> Result<()> {
        self.0.set(&index.to_string(), value)
    }
    pub fn iter<T: FromJs>(&self) -> impl Iterator<Item = Result<T>> + '_ {
        (0..self.len()).map(|i| self.get(i))
    }
}
#[derive(Clone)]
pub struct Function(Object);
impl Function {
    pub fn call<A: IntoArgs, R: FromJs>(&self, args: A) -> Result<R> {
        self.call_arg(args.args(&self.0 .0 .0.ctx)?)
    }
    pub fn call_arg<R: FromJs>(&self, args: Args) -> Result<R> {
        let ctx = &self.0 .0 .0.ctx;
        let mut raw_args = Vec::with_capacity(args.values.len());
        for value in &args.values {
            ctx.check_context(value)?;
            raw_args.push(value.0.raw);
        }
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        ctx.enter();
        let raw = unsafe {
            ffi::JSObjectCallAsFunction(
                ctx.0.raw,
                self.0 .0 .0.raw as _,
                ptr::null_mut(),
                raw_args.len(),
                raw_args.as_ptr(),
                &mut exception,
            )
        };
        ctx.leave();
        R::from_js(ctx, ctx.checked(raw, exception)?)
    }
}
#[derive(Clone)]
pub struct Promise(Object);
impl Promise {
    pub fn finish<T: FromJs>(&self) -> Result<T> {
        match self.0.get::<_, f64>("state")? as u8 {
            1 => T::from_js(&self.0 .0 .0.ctx, self.0.get("value")?),
            2 => Err(error(self.0.get::<_, Value>("value")?.string()?)),
            _ => Err(Error::WouldBlock),
        }
    }
}
pub struct JsText(String);
impl JsText {
    pub fn to_string(&self) -> Result<String> {
        Ok(self.0.clone())
    }
}
pub trait FromJs: Sized {
    fn from_js(ctx: &Context, value: Value) -> Result<Self>;
}
impl FromJs for Value {
    fn from_js(_: &Context, value: Value) -> Result<Self> {
        Ok(value)
    }
}
impl FromJs for () {
    fn from_js(_: &Context, _: Value) -> Result<Self> {
        Ok(())
    }
}
impl FromJs for String {
    fn from_js(ctx: &Context, value: Value) -> Result<Self> {
        if unsafe { ffi::JSValueIsString(ctx.0.raw, value.0.raw) } {
            value.string()
        } else {
            Err(error("Expected a string"))
        }
    }
}
impl FromJs for bool {
    fn from_js(ctx: &Context, value: Value) -> Result<Self> {
        Ok(unsafe { ffi::JSValueToBoolean(ctx.0.raw, value.0.raw) })
    }
}
impl FromJs for f64 {
    fn from_js(ctx: &Context, value: Value) -> Result<Self> {
        let mut exception: ffi::JSValueRef = ptr::null_mut();
        ctx.enter();
        let n = unsafe { ffi::JSValueToNumber(ctx.0.raw, value.0.raw, &mut exception) };
        ctx.leave();
        if exception.is_null() {
            Ok(n)
        } else {
            Err(error("Expected a number"))
        }
    }
}
impl<T: FromJs> FromJs for Vec<T> {
    fn from_js(ctx: &Context, value: Value) -> Result<Self> {
        Array::from_js(ctx, value)?.iter().collect()
    }
}
macro_rules! from_object {
    ($type:ident, $method:ident) => {
        impl FromJs for $type {
            fn from_js(_: &Context, value: Value) -> Result<Self> {
                value
                    .$method()
                    .ok_or_else(|| error(concat!("Expected ", stringify!($type))))
            }
        }
    };
}
from_object!(Object, into_object);
from_object!(Array, into_array);
from_object!(Function, into_function);
pub trait IntoJs {
    fn into_js(self, ctx: &Context) -> Result<Value>;
}
impl IntoJs for Value {
    fn into_js(self, ctx: &Context) -> Result<Value> {
        ctx.check_context(&self)?;
        Ok(self)
    }
}
impl IntoJs for Object {
    fn into_js(self, ctx: &Context) -> Result<Value> {
        self.0.into_js(ctx)
    }
}
impl IntoJs for Array {
    fn into_js(self, ctx: &Context) -> Result<Value> {
        self.0.into_js(ctx)
    }
}
impl IntoJs for &str {
    fn into_js(self, ctx: &Context) -> Result<Value> {
        let s = JsString::new(self);
        Ok(ctx.value(unsafe { ffi::JSValueMakeString(ctx.0.raw, s.0) }))
    }
}
impl IntoJs for String {
    fn into_js(self, ctx: &Context) -> Result<Value> {
        self.as_str().into_js(ctx)
    }
}
pub struct Args {
    ctx: Context,
    values: Vec<Value>,
}
impl Args {
    pub fn new(ctx: Context, count: usize) -> Self {
        Self {
            ctx,
            values: Vec::with_capacity(count),
        }
    }
    pub fn push_arg(&mut self, value: impl IntoJs) -> Result<()> {
        self.values.push(value.into_js(&self.ctx)?);
        Ok(())
    }
}
pub trait IntoArgs {
    fn args(self, ctx: &Context) -> Result<Args>;
}
impl IntoArgs for () {
    fn args(self, ctx: &Context) -> Result<Args> {
        Ok(Args::new(ctx.clone(), 0))
    }
}
impl<T: IntoJs> IntoArgs for (T,) {
    fn args(self, ctx: &Context) -> Result<Args> {
        let mut args = Args::new(ctx.clone(), 1);
        args.push_arg(self.0)?;
        Ok(args)
    }
}

pub fn runtime_version() -> &'static str {
    static VERSION: OnceLock<String> = OnceLock::new();
    VERSION.get_or_init(|| {
        #[cfg(target_os = "macos")]
        {
            // Framework version is host-owned, never supplied by a QPK/env override.
            let version = std::process::Command::new("/usr/libexec/PlistBuddy")
                .args([
                    "-c",
                    "Print :CFBundleVersion",
                    "/System/Library/Frameworks/JavaScriptCore.framework/Resources/Info.plist",
                ])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
                .unwrap_or_else(|| "system".into());
            format!("javascriptcore-{version};javascriptcore-c-api-1")
        }
        #[cfg(target_os = "linux")]
        {
            extern "C" {
                fn jsc_get_major_version() -> u32;
                fn jsc_get_minor_version() -> u32;
                fn jsc_get_micro_version() -> u32;
            }
            unsafe {
                format!(
                    "javascriptcore-gtk-{}.{}.{};javascriptcore-c-api-1",
                    jsc_get_major_version(),
                    jsc_get_minor_version(),
                    jsc_get_micro_version()
                )
            }
        }
        #[cfg(target_os = "windows")]
        {
            format!(
                "javascriptcore-bun-webkit-{};javascriptcore-c-api-1",
                env!("QUA_JSC_WINDOWS_BUILD")
            )
        }
    })
}
