use std::{cell::RefCell, collections::HashMap, ptr};

use super::{ffi, Context, JsString};

type RecordOperation = Box<dyn FnMut(&str, &str, Option<&str>) -> Result<String, String>>;
thread_local! {
    // Each evaluator owns an independent JSC group and runs on one thread.
    static STORAGE: RefCell<HashMap<usize, RecordOperation>> = RefCell::new(HashMap::new());
}

pub(super) fn remove(group: ffi::JSContextGroupRef) {
    let _ = STORAGE.try_with(|stores| stores.borrow_mut().remove(&(group as usize)));
}

impl Context {
    pub(crate) fn install_product_storage(
        &self,
        operation: impl FnMut(&str, &str, Option<&str>) -> Result<String, String> + 'static,
    ) -> super::Result<()> {
        let name = "__quaNativeProductStorage";
        let key = JsString::new(name);
        let function =
            unsafe { ffi::JSObjectMakeFunctionWithCallback(self.0.raw, key.0, Some(storage_call)) };
        self.globals().set(name, self.value(function))?;
        STORAGE.with(|stores| {
            stores
                .borrow_mut()
                .insert(self.0.group as usize, Box::new(operation))
        });
        Ok(())
    }
}

unsafe extern "C" fn storage_call(
    ctx: ffi::JSContextRef,
    _: ffi::JSObjectRef,
    _: ffi::JSObjectRef,
    count: usize,
    args: *const ffi::JSValueRef,
    exception: *mut ffi::JSValueRef,
) -> ffi::JSValueRef {
    let result = std::panic::catch_unwind(|| -> Result<String, String> {
        if !(2..=3).contains(&count) || args.is_null() {
            return Err("Storage expects an operation, key and optional value".into());
        }
        let args = std::slice::from_raw_parts(args, count);
        // Exclude JS objects before coercion to prevent re-entering this callback.
        let read = |value| {
            if !ffi::JSValueIsString(ctx, value) {
                return Err("Storage arguments must be strings");
            }
            let text = ffi::JSValueToStringCopy(ctx, value, ptr::null_mut());
            if text.is_null() {
                return Err("Cannot read storage argument");
            }
            Ok(JsString(text).text())
        };
        let op = read(args[0])?;
        let key = read(args[1])?;
        let value = args.get(2).map(|v| read(*v)).transpose()?;
        let group = ffi::JSContextGetGroup(ctx) as usize;
        STORAGE.with(|stores| {
            let mut stores = stores.borrow_mut();
            let operation = stores
                .get_mut(&group)
                .ok_or("No product storage attached")?;
            operation(&op, &key, value.as_deref())
        })
    })
    .unwrap_or_else(|_| Err("Product storage operation failed".into()));
    match result {
        Ok(text) => ffi::JSValueMakeString(ctx, JsString::new(&text).0),
        Err(message) => {
            if !exception.is_null() {
                *exception = ffi::JSValueMakeString(ctx, JsString::new(&message).0);
            }
            ffi::JSValueMakeUndefined(ctx)
        }
    }
}
