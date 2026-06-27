use std::collections::BTreeSet;

use crate::projection::ui::{
    UiIntentProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceImageProjection,
    UiSurfaceNodeProjection, UiSurfaceResolvedStyle,
};

use super::ui_intent::validate_native_json_ui_intent_projection;
use super::JsonProjectionValidator;

impl JsonProjectionValidator {
    pub(super) fn validate_ui(&mut self, ui: &UiProjection) {
        self.validate_provenance("view.ui.provenance", &ui.provenance);
        let mut overlay_element_ids = BTreeSet::new();
        let mut scene_ids = BTreeSet::new();
        for (overlay_index, overlay) in ui.overlays.iter().enumerate() {
            let overlay_path = format!("view.ui.overlays[{overlay_index}].elementId");
            self.validate_ui_dispatch_identifier(
                &overlay_path,
                &overlay.element_id,
                "UI overlay element ids",
            );
            self.validate_unique_identifier(
                &overlay_path,
                &overlay.element_id,
                &mut overlay_element_ids,
                "UI overlay element ids",
            );
            self.validate_provenance(
                &format!("view.ui.overlays[{overlay_index}].provenance"),
                &overlay.provenance,
            );
            if let Some(overlay_stack) = &overlay.overlay_stack {
                self.validate_ui_dispatch_identifier(
                    &format!("view.ui.overlays[{overlay_index}].overlayStack"),
                    overlay_stack,
                    "UI overlay stack names",
                );
            }
            if let Some(stack_priority) = overlay.stack_priority {
                self.validate_stack_priority(
                    &format!("view.ui.overlays[{overlay_index}].stackPriority"),
                    stack_priority,
                    "UI overlay stack priorities",
                );
            }
            if let Some(z_index) = overlay.z_index {
                self.validate_z_index(
                    &format!("view.ui.overlays[{overlay_index}].zIndex"),
                    z_index,
                    "UI overlay zIndex",
                );
            }
            if let Some(surface) = &overlay.surface {
                self.validate_ui_surface(
                    surface,
                    &format!("view.ui.overlays[{overlay_index}].surface"),
                );
            }
            if let Some(scene) = &overlay.scene {
                let scene_id_path = format!("view.ui.overlays[{overlay_index}].scene.id");
                self.validate_ui_dispatch_identifier(&scene_id_path, &scene.id, "UI scene ids");
                self.validate_unique_identifier(
                    &scene_id_path,
                    &scene.id,
                    &mut scene_ids,
                    "UI scene ids",
                );
                if let Some(overlay_stack) = scene
                    .overlay
                    .as_ref()
                    .and_then(|overlay| overlay.overlay_stack.as_ref())
                {
                    self.validate_ui_dispatch_identifier(
                        &format!("view.ui.overlays[{overlay_index}].scene.overlay.overlayStack"),
                        overlay_stack,
                        "UI scene overlay stack names",
                    );
                }
                if let Some(scene_overlay) = &scene.overlay {
                    if let Some(stack_priority) = scene_overlay.stack_priority {
                        self.validate_stack_priority(
                            &format!(
                                "view.ui.overlays[{overlay_index}].scene.overlay.stackPriority"
                            ),
                            stack_priority,
                            "UI scene overlay stack priorities",
                        );
                    }
                    if let Some(z_index) = scene_overlay.z_index {
                        self.validate_z_index(
                            &format!("view.ui.overlays[{overlay_index}].scene.overlay.zIndex"),
                            z_index,
                            "UI scene overlay zIndex",
                        );
                    }
                }
            }
            if let Some(scene_surface) = overlay
                .scene
                .as_ref()
                .and_then(|scene| scene.surface.as_ref())
            {
                self.validate_ui_surface(
                    scene_surface,
                    &format!("view.ui.overlays[{overlay_index}].scene.surface"),
                );
            }
            if let Some(intent) = &overlay.intent {
                self.validate_ui_intent(
                    &format!("view.ui.overlays[{overlay_index}].intent"),
                    intent,
                );
            }
        }
    }

    fn validate_ui_surface(&mut self, surface: &UiOverlaySurfaceProjection, path: &str) {
        self.validate_asset_reference(&format!("{path}.key"), &surface.key);
        if let Some(root) = &surface.root {
            let mut surface_node_ids = BTreeSet::new();
            self.validate_ui_surface_node(root, &format!("{path}.root"), &mut surface_node_ids);
        }
    }

    fn validate_ui_surface_node(
        &mut self,
        node: &UiSurfaceNodeProjection,
        path: &str,
        surface_node_ids: &mut BTreeSet<String>,
    ) {
        self.validate_ui_dispatch_identifier(
            &format!("{path}.id"),
            &node.id,
            "UI surface node ids",
        );
        self.validate_unique_identifier(
            &format!("{path}.id"),
            &node.id,
            surface_node_ids,
            "UI surface node ids",
        );
        self.validate_ui_rect(&format!("{path}.bounds"), &node.bounds);
        self.validate_ui_node_opacity(&format!("{path}.opacity"), node.opacity);
        self.validate_scroll_offset(&format!("{path}.scrollOffsetX"), node.scroll_offset_x);
        self.validate_scroll_offset(&format!("{path}.scrollOffsetY"), node.scroll_offset_y);
        if let Some(text) = &node.text {
            self.validate_ui_text(&format!("{path}.text"), text);
        }
        self.validate_z_index(
            &format!("{path}.zIndex"),
            node.z_index,
            "UI surface node zIndex",
        );
        self.validate_provenance(&format!("{path}.provenance"), &node.provenance);
        if let Some(image) = &node.image {
            self.validate_ui_image(image, &format!("{path}.image"));
        }
        if let Some(background_image) = &node.style.background_image {
            self.validate_ui_image(background_image, &format!("{path}.style.backgroundImage"));
        }
        if let Some(intent) = &node.intent {
            self.validate_ui_intent(&format!("{path}.intent"), intent);
        }
        self.validate_ui_style(&format!("{path}.style"), &node.style);
        for (index, child) in node.children.iter().enumerate() {
            self.validate_ui_surface_node(
                child,
                &format!("{path}.children[{index}]"),
                surface_node_ids,
            );
        }
    }

    fn validate_ui_image(&mut self, image: &UiSurfaceImageProjection, path: &str) {
        self.validate_asset_type(&format!("{path}.assetType"), &image.asset_type);
        self.validate_asset_reference(&format!("{path}.assetName"), &image.asset_name);
    }

    fn validate_ui_intent(&mut self, path: &str, intent: &UiIntentProjection) {
        self.errors
            .extend(validate_native_json_ui_intent_projection(path, intent));
    }

    fn validate_ui_text(&mut self, path: &str, text: &str) {
        self.validate_text_payload(path, text, "UI surface text");
    }

    fn validate_ui_style(&mut self, path: &str, style: &UiSurfaceResolvedStyle) {
        if let Some(background_color) = &style.background_color {
            self.validate_color_literal(&format!("{path}.backgroundColor"), background_color);
        }
        if let Some(border_color) = &style.border_color {
            self.validate_color_literal(&format!("{path}.borderColor"), border_color);
        }
        if let Some(color) = &style.color {
            self.validate_color_literal(&format!("{path}.color"), color);
        }
        if let Some(font_family) = &style.font_family {
            self.validate_font_family(&format!("{path}.fontFamily"), font_family);
        }
        self.validate_ui_style_numbers(path, style);
    }
}
