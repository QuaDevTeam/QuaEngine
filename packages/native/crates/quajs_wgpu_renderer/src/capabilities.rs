use quajs_native_runtime::RendererCapability;

pub fn native_wgpu_capabilities() -> Vec<RendererCapability> {
    vec![
        capability("native-wgpu.stage-layout@1", &["QuaViewProjection.layout"]),
        capability("native-wgpu.image@1", &["background", "characters", "ui.image"]),
        capability("native-wgpu.text@1", &["dialogue", "ui.text"]),
        capability("native-wgpu.ui.surface@1", &["view.ui.overlays"]),
    ]
}

fn capability(id: &str, projection_keys: &[&str]) -> RendererCapability {
    RendererCapability {
        id: id.to_string(),
        target: "native".to_string(),
        version: "1.0.0".to_string(),
        owner_package: "@quajs/native-renderer".to_string(),
        projection_keys: projection_keys.iter().map(|key| key.to_string()).collect(),
        fallback: "warn-once".to_string(),
    }
}
