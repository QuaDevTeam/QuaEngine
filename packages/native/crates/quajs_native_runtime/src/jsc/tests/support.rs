use super::super::*;

pub(super) fn request_for_asset(asset_name: &str, bytes: Vec<u8>) -> JscEvaluationRequest {
    JscEvaluationRequest {
        module: JscRuntimeModuleRecord {
            asset_name: asset_name.to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: JscRuntimeModuleKind::Script,
            code: String::new(),
            bytes,
        },
        module_graph: Vec::new(),
        limits: JscSandboxLimits::default(),
    }
}
