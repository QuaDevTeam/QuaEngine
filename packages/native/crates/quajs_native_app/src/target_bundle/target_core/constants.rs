pub(super) const WEB_CORE_ADAPTERS: &[&str] = &["@quajs/assets-web", "@quajs/renderer-web"];
pub(super) const COCOS_CORE_ADAPTERS: &[&str] = &[
    "@quajs/cocos-host",
    "@quajs/assets-cocos",
    "@quajs/renderer-cocos",
];
pub const NATIVE_CORE_ADAPTERS: &[&str] = &[
    "@quajs/engine-native",
    "@quajs/assets-native",
    "@quajs/store-native",
    "@quajs/native-contracts",
];

const WEB_CORE_ROOTS: &[&str] = &[
    "@quajs/assets-web",
    "@quajs/store-web",
    "@quajs/renderer-web",
    "@quajs/renderer-vue",
    "@quajs/renderer-react",
    "@quajs/renderer-svelte",
];
const COCOS_CORE_ROOTS: &[&str] = &[
    "@quajs/cocos-host",
    "@quajs/assets-cocos",
    "@quajs/store-cocos",
    "@quajs/renderer-cocos",
];
const NATIVE_CORE_ROOTS: &[&str] = &[
    "@quajs/engine-native",
    "@quajs/assets-native",
    "@quajs/store-native",
    "@quajs/native-contracts",
    "quajs_native_runtime",
    "quajs_wgpu_renderer",
    "quajs_native_app",
];

pub(super) fn target_core_plugin_family(package_name: &str) -> Option<&'static str> {
    if WEB_CORE_ROOTS.contains(&package_name) {
        Some("web-core")
    } else if COCOS_CORE_ROOTS.contains(&package_name) {
        Some("cocos-core")
    } else if NATIVE_CORE_ROOTS.contains(&package_name) {
        Some("native-core")
    } else {
        None
    }
}

pub(super) fn is_target_core_adapter_root(package_name: &str) -> bool {
    target_core_plugin_family(package_name).is_some()
}
