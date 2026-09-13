use super::super::*;

pub(super) fn request_for_asset(asset_name: &str, bytes: Vec<u8>) -> QuickJsEvaluationRequest {
    QuickJsEvaluationRequest {
        module: QuickJsRuntimeModuleRecord {
            asset_name: asset_name.to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: QuickJsRuntimeModuleKind::Script,
            code: String::new(),
            bytes,
        },
        module_graph: Vec::new(),
        limits: QuickJsSandboxLimits::default(),
    }
}
