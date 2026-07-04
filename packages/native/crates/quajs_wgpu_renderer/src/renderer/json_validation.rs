mod audio_numbers;
mod background;
mod background_numbers;
mod background_origin;
mod character_numbers;
mod dialogue;
mod layout;
mod rich_text_numbers;
mod safe_strings;
mod text_payload;
mod ui;
mod ui_geometry;
mod ui_intent;
mod ui_style_numbers;
mod view;
mod z_order;

pub(crate) use ui_intent::is_valid_native_ui_intent_metadata_payload;

use std::collections::BTreeSet;

use crate::projection::common::{FontFamilyProjection, PackageProvenance};
use crate::projection::dialogue::RichTextStyle;
use crate::projection::ui::UiSurfaceResolvedStyle;
use crate::projection::view::ViewProjection;
use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
};
use crate::stage_layout::{StageContainerInput, ViewLayoutInput};
use layout::{invalid_native_json_container_reason, invalid_native_json_layout_reason};
use rich_text_numbers::invalid_native_json_rich_text_style_number_reason;
use safe_strings::{
    invalid_native_json_asset_reference_reason, invalid_native_json_asset_type_reason,
    invalid_native_json_color_literal_reason, invalid_native_json_font_family_reason,
    invalid_native_json_package_id_reason, invalid_native_json_ui_dispatch_identifier_reason,
};
use text_payload::invalid_native_json_text_payload_reason;
use ui_geometry::{invalid_native_json_scroll_offset_reason, invalid_native_json_ui_rect_reason};
use ui_style_numbers::{
    invalid_native_json_ui_node_opacity_reason, invalid_native_json_ui_style_number_reason,
};
use z_order::{invalid_native_json_stack_priority_reason, invalid_native_json_z_index_reason};

pub(super) fn validate_json_frame_input(
    layout: Option<&ViewLayoutInput>,
    container: Option<&StageContainerInput>,
    view: &ViewProjection,
) -> Result<(), NativeRendererJsonFrameError> {
    let mut validator = JsonProjectionValidator::default();
    validator.validate_layout(layout);
    validator.validate_container(container);
    validator.validate_view(view);
    if let Some(error) = validator.errors.into_iter().next() {
        return Err(NativeRendererJsonFrameError::Validation(error));
    }
    Ok(())
}

#[derive(Default)]
struct JsonProjectionValidator {
    errors: Vec<NativeRendererJsonValidationError>,
}

impl JsonProjectionValidator {
    fn validate_layout(&mut self, layout: Option<&ViewLayoutInput>) {
        if let Some((field, value, reason)) = invalid_native_json_layout_reason(layout) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("layout.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_container(&mut self, container: Option<&StageContainerInput>) {
        if let Some((field, value, reason)) = invalid_native_json_container_reason(container) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("container.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_text_payload(&mut self, path: &str, text: &str, noun: &str) {
        if let Some((value, reason)) = invalid_native_json_text_payload_reason(text, noun) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_asset_type(&mut self, path: &str, asset_type: &str) {
        if let Some(reason) = invalid_native_json_asset_type_reason(asset_type) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: asset_type.to_string(),
                reason,
            });
        }
    }

    fn validate_asset_reference(&mut self, path: &str, asset_name: &str) {
        if let Some(reason) = invalid_native_json_asset_reference_reason(asset_name) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: asset_name.to_string(),
                reason,
            });
        }
    }

    fn validate_font_family(&mut self, path: &str, font_family: &FontFamilyProjection) {
        for (index, family) in font_family.families.iter().enumerate() {
            if let Some(reason) = invalid_native_json_font_family_reason(family) {
                self.errors.push(NativeRendererJsonValidationError {
                    path: format!("{path}[{index}]"),
                    asset_name: family.to_string(),
                    reason,
                });
            }
        }
    }

    fn validate_color_literal(&mut self, path: &str, color: &str) {
        if let Some(reason) = invalid_native_json_color_literal_reason(color) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: color.to_string(),
                reason,
            });
        }
    }

    fn validate_ui_rect(&mut self, path: &str, rect: &crate::projection::ui::UiSurfaceNodeRect) {
        if let Some((field, value, reason)) = invalid_native_json_ui_rect_reason(rect) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_scroll_offset(&mut self, path: &str, value: f64) {
        if let Some(reason) = invalid_native_json_scroll_offset_reason(value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }

    fn validate_ui_node_opacity(&mut self, path: &str, value: f32) {
        if let Some(reason) = invalid_native_json_ui_node_opacity_reason(value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }

    fn validate_ui_style_numbers(&mut self, path: &str, style: &UiSurfaceResolvedStyle) {
        if let Some((field, value, reason)) = invalid_native_json_ui_style_number_reason(style) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_rich_text_style_numbers(&mut self, path: &str, style: &RichTextStyle) {
        if let Some((field, value, reason)) =
            invalid_native_json_rich_text_style_number_reason(style)
        {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_provenance(&mut self, path: &str, provenance: &PackageProvenance) {
        if let Some(package_id) = &provenance.content_package_id {
            self.validate_package_id(&format!("{path}.contentPackageId"), package_id);
        }
        for (index, package_id) in provenance.required_runtime_packages.iter().enumerate() {
            self.validate_package_id(
                &format!("{path}.requiredRuntimePackages[{index}]"),
                package_id,
            );
        }
    }

    fn validate_package_id(&mut self, path: &str, package_id: &str) {
        if let Some(reason) = invalid_native_json_package_id_reason(package_id) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: package_id.to_string(),
                reason,
            });
        }
    }

    fn validate_ui_dispatch_identifier(&mut self, path: &str, value: &str, noun: &str) {
        if let Some(reason) = invalid_native_json_ui_dispatch_identifier_reason(value, noun) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }

    fn validate_unique_identifier(
        &mut self,
        path: &str,
        value: &str,
        seen: &mut BTreeSet<String>,
        noun: &str,
    ) {
        if !seen.insert(value.to_string()) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason: format!("{noun} must be unique within their native UI scope"),
            });
        }
    }

    fn validate_z_index(&mut self, path: &str, value: i32, noun: &str) {
        if let Some(reason) = invalid_native_json_z_index_reason(value, noun) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }

    fn validate_stack_priority(&mut self, path: &str, value: i32, noun: &str) {
        if let Some(reason) = invalid_native_json_stack_priority_reason(value, noun) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }
}
