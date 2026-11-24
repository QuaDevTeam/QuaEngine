//! JavaScriptCore C ABI used by the mobile hosts. The desktop sys crate links
//! according to the build machine, which is incorrect when cross-compiling.
#![allow(non_snake_case)]
use std::ffi::{c_char, c_void};

#[repr(C)]
pub struct OpaqueContext {
    _private: [u8; 0],
}
#[repr(C)]
pub struct OpaqueValue {
    _private: [u8; 0],
}
pub type JSContextGroupRef = *const c_void;
pub type JSContextRef = *const OpaqueContext;
pub type JSGlobalContextRef = *mut OpaqueContext;
pub type JSClassRef = *mut c_void;
pub type JSStringRef = *mut c_void;
pub type JSValueRef = *const OpaqueValue;
pub type JSObjectRef = *mut OpaqueValue;
type JSChar = u16;
type JSPropertyAttributes = u32;
type JSObjectCallAsFunctionCallback = Option<
    unsafe extern "C" fn(
        JSContextRef,
        JSObjectRef,
        JSObjectRef,
        usize,
        *const JSValueRef,
        *mut JSValueRef,
    ) -> JSValueRef,
>;

#[cfg_attr(target_os = "ios", link(name = "JavaScriptCore", kind = "framework"))]
#[cfg_attr(target_os = "android", link(name = "jsc"))]
extern "C" {
    pub fn JSContextGetGlobalObject(ctx: JSContextRef) -> JSObjectRef;
    pub fn JSContextGetGroup(ctx: JSContextRef) -> JSContextGroupRef;
    pub fn JSContextGroupCreate() -> JSContextGroupRef;
    pub fn JSContextGroupRelease(group: JSContextGroupRef);
    pub fn JSEvaluateScript(
        ctx: JSContextRef,
        script: JSStringRef,
        thisObject: JSObjectRef,
        sourceURL: JSStringRef,
        startingLineNumber: i32,
        exception: *mut JSValueRef,
    ) -> JSValueRef;
    pub fn JSGlobalContextCreateInGroup(
        group: JSContextGroupRef,
        globalObjectClass: JSClassRef,
    ) -> JSGlobalContextRef;
    pub fn JSGlobalContextRelease(ctx: JSGlobalContextRef);
    pub fn JSObjectCallAsFunction(
        ctx: JSContextRef,
        object: JSObjectRef,
        thisObject: JSObjectRef,
        argumentCount: usize,
        arguments: *const JSValueRef,
        exception: *mut JSValueRef,
    ) -> JSValueRef;
    pub fn JSObjectGetProperty(
        ctx: JSContextRef,
        object: JSObjectRef,
        propertyName: JSStringRef,
        exception: *mut JSValueRef,
    ) -> JSValueRef;
    pub fn JSObjectIsFunction(ctx: JSContextRef, object: JSObjectRef) -> bool;
    pub fn JSObjectMake(ctx: JSContextRef, jsClass: JSClassRef, data: *mut c_void) -> JSObjectRef;
    pub fn JSObjectMakeArray(
        ctx: JSContextRef,
        argumentCount: usize,
        arguments: *const JSValueRef,
        exception: *mut JSValueRef,
    ) -> JSObjectRef;
    pub fn JSObjectMakeFunctionWithCallback(
        ctx: JSContextRef,
        name: JSStringRef,
        callAsFunction: JSObjectCallAsFunctionCallback,
    ) -> JSObjectRef;
    pub fn JSObjectSetProperty(
        ctx: JSContextRef,
        object: JSObjectRef,
        propertyName: JSStringRef,
        value: JSValueRef,
        attributes: JSPropertyAttributes,
        exception: *mut JSValueRef,
    );
    pub fn JSStringCreateWithCharacters(chars: *const JSChar, numChars: usize) -> JSStringRef;
    pub fn JSStringGetMaximumUTF8CStringSize(string: JSStringRef) -> usize;
    pub fn JSStringGetUTF8CString(
        string: JSStringRef,
        buffer: *mut c_char,
        bufferSize: usize,
    ) -> usize;
    pub fn JSStringRelease(string: JSStringRef);
    pub fn JSValueCreateJSONString(
        ctx: JSContextRef,
        value: JSValueRef,
        indent: u32,
        exception: *mut JSValueRef,
    ) -> JSStringRef;
    pub fn JSValueIsArray(ctx: JSContextRef, value: JSValueRef) -> bool;
    pub fn JSValueIsNull(ctx: JSContextRef, value: JSValueRef) -> bool;
    pub fn JSValueIsObject(ctx: JSContextRef, value: JSValueRef) -> bool;
    pub fn JSValueIsString(ctx: JSContextRef, value: JSValueRef) -> bool;
    pub fn JSValueIsUndefined(ctx: JSContextRef, value: JSValueRef) -> bool;
    pub fn JSValueMakeFromJSONString(ctx: JSContextRef, string: JSStringRef) -> JSValueRef;
    pub fn JSValueMakeString(ctx: JSContextRef, string: JSStringRef) -> JSValueRef;
    pub fn JSValueMakeUndefined(ctx: JSContextRef) -> JSValueRef;
    pub fn JSValueProtect(ctx: JSContextRef, value: JSValueRef);
    pub fn JSValueToBoolean(ctx: JSContextRef, value: JSValueRef) -> bool;
    pub fn JSValueToNumber(ctx: JSContextRef, value: JSValueRef, exception: *mut JSValueRef)
        -> f64;
    pub fn JSValueToStringCopy(
        ctx: JSContextRef,
        value: JSValueRef,
        exception: *mut JSValueRef,
    ) -> JSStringRef;
    pub fn JSValueUnprotect(ctx: JSContextRef, value: JSValueRef);
}
