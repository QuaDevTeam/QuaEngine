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
            &["object-fit", "opacity"],
            &["Image", "Layer"],
            "render-empty",
        ),
        capability(
            "native-wgpu.video@1",
            &["background.video"],
            &[],
            &["video", "images"],
            &["object-fit", "opacity"],
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
                "font-weight",
                "line-height",
                "text-align",
                "color",
            ],
            &["Text", "RichText"],
            "warn-once",
        ),
        capability(
            "native-wgpu.ui.surface@1",
            &["view.ui.overlays"],
            &[
                "ui/intent",
                "choice/select",
                "save/select",
                "settings/change",
            ],
            &["data", "images", "fonts"],
            &[
                "display",
                "flex-direction",
                "gap",
                "padding",
                "margin",
                "background-color",
                "border-color",
                "border-radius",
                "border-width",
                "color",
                "font-family",
                "font-size",
                "font-weight",
                "line-height",
                "text-align",
                "object-fit",
            ],
            &[
                "Box", "Backdrop", "Button", "Column", "Divider", "Fragment", "Grid", "Layer",
                "Row", "Text", "Image", "Panel", "SafeArea", "Scroll", "Spacer", "Stack",
            ],
            "reject-package",
        ),
        capability(
            "native-wgpu.input.pointer@1",
            &["view.choices", "view.ui.overlays"],
            &["choice/select", "ui/intent"],
            &[],
            &[],
            &["Backdrop", "Button", "Choice", "Panel"],
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
mod tests {
    use super::*;

    #[test]
    fn exposes_foundational_native_wgpu_capabilities() {
        let capabilities = native_wgpu_capabilities();
        let ids: Vec<_> = capabilities
            .iter()
            .map(|capability| capability.id.as_str())
            .collect();

        assert!(ids.contains(&"native-wgpu.stage-layout@1"));
        assert!(ids.contains(&"native-wgpu.image@1"));
        assert!(ids.contains(&"native-wgpu.video@1"));
        assert!(ids.contains(&"native-wgpu.text@1"));
        assert!(ids.contains(&"native-wgpu.ui.surface@1"));
        assert!(ids.contains(&"native-wgpu.input.pointer@1"));
        assert!(capabilities
            .iter()
            .all(|capability| capability.owner_package == "@quajs/native-renderer"));

        let video = capabilities
            .iter()
            .find(|capability| capability.id == "native-wgpu.video@1")
            .unwrap();
        assert_eq!(video.fallback, "warn-once");
        assert!(video
            .projection_keys
            .contains(&"background.video".to_string()));
        assert!(video.asset_kinds.contains(&"video".to_string()));
        assert!(video.asset_kinds.contains(&"images".to_string()));
        assert!(video.qui_components.is_empty());

        let text = capabilities
            .iter()
            .find(|capability| capability.id == "native-wgpu.text@1")
            .unwrap();
        assert!(text.qss_features.contains(&"font-family".to_string()));
        assert!(text.qss_features.contains(&"font-size".to_string()));
        assert!(text.qss_features.contains(&"font-weight".to_string()));
        assert!(text.qss_features.contains(&"line-height".to_string()));
        assert!(text.qss_features.contains(&"text-align".to_string()));
        assert!(text.qss_features.contains(&"color".to_string()));

        let ui = capabilities
            .iter()
            .find(|capability| capability.id == "native-wgpu.ui.surface@1")
            .unwrap();
        assert_eq!(ui.fallback, "reject-package");
        assert!(ui.intent_events.contains(&"ui/intent".to_string()));
        assert!(ui.qss_features.contains(&"flex-direction".to_string()));
        assert!(ui.qss_features.contains(&"border-color".to_string()));
        assert!(ui.qss_features.contains(&"border-radius".to_string()));
        assert!(ui.qss_features.contains(&"border-width".to_string()));
        assert!(ui.qss_features.contains(&"font-family".to_string()));
        assert!(ui.qss_features.contains(&"font-weight".to_string()));
        assert!(ui.qss_features.contains(&"object-fit".to_string()));
        assert!(ui.qui_components.contains(&"Backdrop".to_string()));
        assert!(ui.qui_components.contains(&"Button".to_string()));
        assert!(ui.qui_components.contains(&"Column".to_string()));
        assert!(ui.qui_components.contains(&"Divider".to_string()));
        assert!(ui.qui_components.contains(&"Fragment".to_string()));
        assert!(ui.qui_components.contains(&"Grid".to_string()));
        assert!(ui.qui_components.contains(&"Layer".to_string()));
        assert!(ui.qui_components.contains(&"Row".to_string()));
        assert!(ui.qui_components.contains(&"Text".to_string()));
        assert!(ui.qui_components.contains(&"Image".to_string()));
        assert!(ui.qui_components.contains(&"Panel".to_string()));
        assert!(ui.qui_components.contains(&"SafeArea".to_string()));
        assert!(ui.qui_components.contains(&"Scroll".to_string()));
        assert!(ui.qui_components.contains(&"Spacer".to_string()));
        assert!(ui.qui_components.contains(&"Stack".to_string()));
        assert!(!ui.qui_components.contains(&"VirtualList".to_string()));
        assert!(!ui.qui_components.contains(&"FocusScope".to_string()));

        let pointer = capabilities
            .iter()
            .find(|capability| capability.id == "native-wgpu.input.pointer@1")
            .unwrap();
        assert_eq!(pointer.fallback, "reject-package");
        assert!(pointer.asset_kinds.is_empty());
        assert!(pointer.qss_features.is_empty());
        assert!(pointer.qui_components.contains(&"Backdrop".to_string()));
        assert!(pointer.qui_components.contains(&"Panel".to_string()));
        assert!(!pointer.qui_components.contains(&"Column".to_string()));
        assert!(!pointer.qui_components.contains(&"Divider".to_string()));
        assert!(!pointer.qui_components.contains(&"Fragment".to_string()));
        assert!(!pointer.qui_components.contains(&"Grid".to_string()));
        assert!(!pointer.qui_components.contains(&"Layer".to_string()));
        assert!(!pointer.qui_components.contains(&"Row".to_string()));
        assert!(!pointer.qui_components.contains(&"SafeArea".to_string()));
        assert!(!pointer.qui_components.contains(&"Spacer".to_string()));
        assert!(!pointer.qui_components.contains(&"Stack".to_string()));
        assert!(pointer.intent_events.contains(&"choice/select".to_string()));
        assert!(pointer.intent_events.contains(&"ui/intent".to_string()));
        assert!(pointer
            .projection_keys
            .contains(&"view.choices".to_string()));
    }
}
