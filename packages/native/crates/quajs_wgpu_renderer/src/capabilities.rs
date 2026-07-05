use quajs_native_runtime::RendererCapability;

pub fn native_wgpu_capabilities() -> Vec<RendererCapability> {
    vec![
        capability(
            "native-wgpu.stage-layout@1",
            &["QuaViewProjection.layout"],
            &[],
            &[],
            &["safe-area", "logical-stage"],
            &["Stage"],
            "reject-package",
        ),
        capability(
            "native-wgpu.image@1",
            &["background", "characters", "ui.image"],
            &[],
            &["images", "characters"],
            &["object-fit", "object-position", "opacity"],
            &["Image", "Layer"],
            "render-empty",
        ),
        capability(
            "native-wgpu.video@1",
            &["background.video"],
            &[],
            &["video", "images"],
            &["object-fit", "object-position", "opacity"],
            &[],
            "warn-once",
        ),
        capability(
            "native-wgpu.text@1",
            &["dialogue", "ui.text"],
            &[],
            &["fonts"],
            &[
                "font-family",
                "font-size",
                "font-style",
                "font-weight",
                "letter-spacing",
                "line-height",
                "text-align",
                "text-decoration",
                "text-overflow",
                "text-transform",
                "white-space",
                "color",
            ],
            &["Text", "RichText"],
            "warn-once",
        ),
        capability(
            "native-wgpu.ui.surface@1",
            &["view.ui.overlays"],
            &["ui/intent", "choice/select"],
            &["data", "images", "fonts", "qui", "qss", "tokens"],
            &[
                "align-items",
                "background-color",
                "background-image",
                "background-position",
                "background-size",
                "border-color",
                "border-radius",
                "border-style",
                "border-width",
                "bottom",
                "box-sizing",
                "column-gap",
                "color",
                "display",
                "font-family",
                "font-size",
                "font-style",
                "font-weight",
                "gap",
                "inset",
                "letter-spacing",
                "height",
                "left",
                "line-height",
                "justify-content",
                "margin",
                "margin-bottom",
                "margin-left",
                "margin-right",
                "margin-top",
                "max-height",
                "max-width",
                "min-height",
                "min-width",
                "text-align",
                "text-decoration",
                "text-overflow",
                "text-transform",
                "object-fit",
                "object-position",
                "opacity",
                "overflow",
                "padding",
                "padding-bottom",
                "padding-left",
                "padding-right",
                "padding-top",
                "pointer-events",
                "position",
                "right",
                "row-gap",
                "top",
                "visibility",
                "white-space",
                "width",
                "z-index",
            ],
            &[
                "Box", "Backdrop", "Button", "Column", "Divider", "Fragment", "Grid", "Layer",
                "Row", "Text", "RichText", "Image", "Panel", "SafeArea", "Scroll", "Spacer",
                "Stack",
            ],
            "reject-package",
        ),
        capability(
            "native-wgpu.input.pointer@1",
            &["view.choices", "view.ui.overlays"],
            &["choice/select", "ui/intent"],
            &[],
            &[],
            &["Backdrop", "Button", "Panel"],
            "reject-package",
        ),
    ]
}

fn capability(
    id: &str,
    projection_keys: &[&str],
    intent_events: &[&str],
    asset_kinds: &[&str],
    qss_features: &[&str],
    qui_components: &[&str],
    fallback: &str,
) -> RendererCapability {
    RendererCapability {
        id: id.to_string(),
        target: "native".to_string(),
        version: "1.0.0".to_string(),
        owner_package: "@quajs/native-renderer".to_string(),
        projection_keys: projection_keys.iter().map(|key| key.to_string()).collect(),
        intent_events: intent_events
            .iter()
            .map(|event| event.to_string())
            .collect(),
        asset_kinds: asset_kinds.iter().map(|kind| kind.to_string()).collect(),
        qss_features: qss_features
            .iter()
            .map(|feature| feature.to_string())
            .collect(),
        qui_components: qui_components
            .iter()
            .map(|component| component.to_string())
            .collect(),
        fallback: fallback.to_string(),
    }
}

#[cfg(test)]
mod tests;
