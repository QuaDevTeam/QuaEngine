use crate::host::{NativeHostInfoBuilder, NativePlatform, NativeProfile};
use crate::quickjs::{
    QuickJsEvaluationRequest, QuickJsRuntimeModuleKind, QuickJsRuntimeModuleRecord,
    QuickJsSandboxLimits,
};

use super::NativeHostInfo;

pub(super) fn host_info() -> NativeHostInfo {
    NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture")
        .app_version("1.0.0")
        .build_number("100")
        .profile(NativeProfile::Debug)
        .platform(NativePlatform::MacOs)
        .arch("arm64")
        .build()
}

pub(super) fn quickjs_request_for_asset(asset_name: &str) -> QuickJsEvaluationRequest {
    QuickJsEvaluationRequest {
        module: QuickJsRuntimeModuleRecord {
            asset_name: asset_name.to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: QuickJsRuntimeModuleKind::Script,
            code: "export default function opening() {}".to_string(),
            bytes: vec![1, 2, 3],
        },
        module_graph: Vec::new(),
        limits: QuickJsSandboxLimits::default(),
    }
}
