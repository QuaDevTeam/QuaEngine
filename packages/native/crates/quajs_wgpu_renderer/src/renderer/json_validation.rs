mod audio_numbers;
mod background_numbers;
mod character_numbers;
mod rich_text_numbers;
mod ui_geometry;
mod ui_style_numbers;

use std::collections::BTreeSet;

use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::character::CharacterProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::{FontFamilyProjection, PackageProvenance};
use crate::projection::dialogue::{
    DialogueAvatarProjection, DialogueProjection, RichTextContent, RichTextStyle,
};
use crate::projection::ui::{
    UiIntentProjection, UiOverlaySurfaceProjection, UiProjection, UiSurfaceImageProjection,
    UiSurfaceNodeProjection, UiSurfaceResolvedStyle,
};
use crate::projection::view::ViewProjection;
use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
};
use audio_numbers::{
    invalid_native_json_audio_memory_reason, invalid_native_json_audio_volume_reason,
};
use background_numbers::{
    invalid_native_json_background_geometry_reason, invalid_native_json_background_opacity_reason,
    invalid_native_json_background_rotation_reason,
};
use character_numbers::{
    invalid_native_json_character_opacity_reason, invalid_native_json_character_position_reason,
};
use rich_text_numbers::invalid_native_json_rich_text_style_number_reason;
use ui_geometry::{invalid_native_json_scroll_offset_reason, invalid_native_json_ui_rect_reason};
use ui_style_numbers::{
    invalid_native_json_ui_node_opacity_reason, invalid_native_json_ui_style_number_reason,
};

pub(super) fn validate_json_frame_projection(
    view: &ViewProjection,
) -> Result<(), NativeRendererJsonFrameError> {
    let mut validator = JsonProjectionValidator::default();
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
    fn validate_view(&mut self, view: &ViewProjection) {
        if let Some(background) = &view.background {
            self.validate_background(background);
        }
        let mut character_ids = BTreeSet::new();
        for (index, character) in view.characters.iter().enumerate() {
            self.validate_character(
                character,
                &format!("view.characters[{index}]"),
                &mut character_ids,
            );
        }
        if let Some(dialogue) = &view.dialogue {
            self.validate_dialogue(dialogue);
        }
        if let Some(choices) = &view.choices {
            self.validate_choices(choices);
        }
        if let Some(ui) = &view.ui {
            self.validate_ui(ui);
        }
        if let Some(audio) = &view.audio {
            let mut audio_track_ids = BTreeSet::new();
            for (index, track) in audio.tracks.iter().enumerate() {
                let track_id_path = format!("view.audio.tracks[{index}].id");
                self.validate_ui_dispatch_identifier(&track_id_path, &track.id, "audio track ids");
                self.validate_unique_identifier(
                    &track_id_path,
                    &track.id,
                    &mut audio_track_ids,
                    "audio track ids",
                );
                self.validate_asset_type(
                    &format!("view.audio.tracks[{index}].assetType"),
                    &track.asset_type,
                );
                self.validate_asset_reference(
                    &format!("view.audio.tracks[{index}].assetName"),
                    &track.asset_name,
                );
                self.validate_audio_volume(
                    &format!("view.audio.tracks[{index}].volume"),
                    track.volume,
                );
                self.validate_audio_memory(
                    &format!("view.audio.tracks[{index}].memory"),
                    &track.memory,
                );
                self.validate_provenance(
                    &format!("view.audio.tracks[{index}].provenance"),
                    &track.provenance,
                );
            }
        }
    }

    fn validate_background(&mut self, background: &BackgroundProjection) {
        self.validate_provenance("view.background.provenance", &background.provenance);
        if let Some(asset_type) = &background.asset_type {
            self.validate_asset_type("view.background.assetType", asset_type);
        }
        if let Some(asset_name) = &background.asset_name {
            self.validate_asset_reference("view.background.assetName", asset_name);
        }
        self.validate_background_geometry(
            "view.background",
            background.x,
            background.y,
            background.width,
            background.height,
            background.scale,
        );
        self.validate_background_rotation("view.background", background.rotation);
        self.validate_background_opacity("view.background.opacity", background.opacity);
        let mut layer_ids = BTreeSet::new();
        for (index, layer) in background.layers.iter().enumerate() {
            let layer_path = format!("view.background.layers[{index}]");
            if let Some(asset_type) = &layer.asset_type {
                self.validate_asset_type(&format!("{layer_path}.assetType"), asset_type);
            }
            let layer_id_path = format!("{layer_path}.id");
            self.validate_ui_dispatch_identifier(&layer_id_path, &layer.id, "background layer ids");
            self.validate_unique_identifier(
                &layer_id_path,
                &layer.id,
                &mut layer_ids,
                "background layer ids",
            );
            self.validate_asset_reference(&format!("{layer_path}.assetName"), &layer.asset_name);
            self.validate_background_geometry(
                &layer_path,
                layer.x,
                layer.y,
                layer.width,
                layer.height,
                layer.scale,
            );
            self.validate_background_rotation(&layer_path, layer.rotation);
            self.validate_background_opacity(&format!("{layer_path}.opacity"), layer.opacity);
            self.validate_provenance(&format!("{layer_path}.provenance"), &layer.provenance);
        }
        if let Some(video) = &background.video {
            self.validate_background_video(video);
        }
    }

    fn validate_background_video(&mut self, video: &BackgroundVideoProjection) {
        self.validate_asset_reference("view.background.video.assetName", &video.asset_name);
        if let Some(poster) = &video.poster {
            self.validate_asset_reference("view.background.video.poster", poster);
        }
        self.validate_background_opacity("view.background.video.opacity", video.opacity);
        self.validate_provenance("view.background.video.provenance", &video.provenance);
    }

    fn validate_character(
        &mut self,
        character: &CharacterProjection,
        path: &str,
        character_ids: &mut BTreeSet<String>,
    ) {
        self.validate_ui_dispatch_identifier(&format!("{path}.id"), &character.id, "character ids");
        self.validate_unique_identifier(
            &format!("{path}.id"),
            &character.id,
            character_ids,
            "character ids",
        );
        if let Some(sprite) = &character.sprite {
            self.validate_asset_reference(&format!("{path}.sprite"), sprite);
        }
        self.validate_character_position(&format!("{path}.position"), &character.position);
        self.validate_character_opacity(&format!("{path}.opacity"), character.opacity);
        self.validate_provenance(&format!("{path}.provenance"), &character.provenance);
    }

    fn validate_dialogue(&mut self, dialogue: &DialogueProjection) {
        if let Some(avatar) = &dialogue.avatar {
            self.validate_dialogue_avatar(avatar);
        }
        self.validate_rich_text_style("view.dialogue.speakerStyle", &dialogue.speaker_style);
        if let Some(speaker) = &dialogue.speaker {
            self.validate_rich_text_content("view.dialogue.speaker", speaker);
        }
        self.validate_rich_text_content("view.dialogue.text", &dialogue.text);
        self.validate_provenance("view.dialogue.provenance", &dialogue.provenance);
    }

    fn validate_dialogue_avatar(&mut self, avatar: &DialogueAvatarProjection) {
        self.validate_asset_type("view.dialogue.avatar.assetType", &avatar.asset_type);
        self.validate_asset_reference("view.dialogue.avatar.assetName", &avatar.asset_name);
        self.validate_provenance("view.dialogue.avatar.provenance", &avatar.provenance);
    }

    fn validate_rich_text_content(&mut self, path: &str, content: &RichTextContent) {
        let RichTextContent::Document(document) = content else {
            return;
        };

        self.validate_rich_text_style(&format!("{path}.style"), &document.style);
        for (block_index, block) in document.blocks.iter().enumerate() {
            for (span_index, span) in block.spans.iter().enumerate() {
                self.validate_rich_text_style(
                    &format!("{path}.blocks[{block_index}].spans[{span_index}].style"),
                    &span.style,
                );
            }
        }
    }

    fn validate_rich_text_style(&mut self, path: &str, style: &RichTextStyle) {
        if let Some(color) = &style.color {
            self.validate_color_literal(&format!("{path}.color"), color);
        }
        if let Some(font_family) = &style.font_family {
            self.validate_font_family(&format!("{path}.fontFamily"), font_family);
        }
        self.validate_rich_text_style_numbers(path, style);
    }

    fn validate_choices(&mut self, choices: &ChoiceSetProjection) {
        self.validate_provenance("view.choices.provenance", &choices.provenance);
        let mut choice_ids = BTreeSet::new();
        for (index, choice) in choices.choices.iter().enumerate() {
            self.validate_choice(
                choice,
                &format!("view.choices.choices[{index}]"),
                &mut choice_ids,
            );
        }
    }

    fn validate_choice(
        &mut self,
        choice: &ChoiceProjection,
        path: &str,
        choice_ids: &mut BTreeSet<String>,
    ) {
        self.validate_ui_dispatch_identifier(&format!("{path}.id"), &choice.id, "choice ids");
        self.validate_unique_identifier(
            &format!("{path}.id"),
            &choice.id,
            choice_ids,
            "choice ids",
        );
        self.validate_provenance(&format!("{path}.provenance"), &choice.provenance);
    }

    fn validate_ui(&mut self, ui: &UiProjection) {
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
        if let Some(reason) = invalid_native_json_ui_intent_event_reason(&intent.event) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.event"),
                asset_name: intent.event.clone(),
                reason,
            });
            return;
        }

        if let Some(action) = &intent.action {
            self.validate_ui_dispatch_identifier(
                &format!("{path}.action"),
                action,
                "UI intent actions",
            );
        }

        if intent.event != "choice/select" {
            if let Some(choice_id) = &intent.choice_id {
                self.validate_ui_dispatch_identifier(
                    &format!("{path}.choiceId"),
                    choice_id,
                    "choice ids",
                );
            }
            return;
        }

        if intent.event == "choice/select" {
            match intent.choice_id.as_deref() {
                Some(choice_id) if !choice_id.trim().is_empty() => self
                    .validate_ui_dispatch_identifier(
                        &format!("{path}.choiceId"),
                        choice_id,
                        "choice ids",
                    ),
                _ => self.errors.push(NativeRendererJsonValidationError {
                    path: format!("{path}.choiceId"),
                    asset_name: intent.choice_id.clone().unwrap_or_default(),
                    reason: "choice/select intents must declare canonical choiceId".to_string(),
                }),
            }
        }
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

    fn validate_background_geometry(
        &mut self,
        path: &str,
        x: f64,
        y: f64,
        width: Option<f64>,
        height: Option<f64>,
        scale: f64,
    ) {
        if let Some((field, value, reason)) =
            invalid_native_json_background_geometry_reason(x, y, width, height, scale)
        {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_background_opacity(&mut self, path: &str, value: f32) {
        if let Some(reason) = invalid_native_json_background_opacity_reason(value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }

    fn validate_background_rotation(&mut self, path: &str, value: f64) {
        if let Some((field, value, reason)) = invalid_native_json_background_rotation_reason(value)
        {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_character_position(
        &mut self,
        path: &str,
        position: &crate::projection::character::CharacterPosition,
    ) {
        if let Some((field, value, reason)) =
            invalid_native_json_character_position_reason(position)
        {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_character_opacity(&mut self, path: &str, value: f32) {
        if let Some(reason) = invalid_native_json_character_opacity_reason(value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }

    fn validate_audio_volume(&mut self, path: &str, value: f32) {
        if let Some(reason) = invalid_native_json_audio_volume_reason(value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.to_string(),
                reason,
            });
        }
    }

    fn validate_audio_memory(
        &mut self,
        path: &str,
        memory: &crate::projection::audio::AudioTrackMemoryEstimate,
    ) {
        if let Some((field, value, reason)) = invalid_native_json_audio_memory_reason(memory) {
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
}

fn invalid_native_json_ui_intent_event_reason(event: &str) -> Option<String> {
    match event {
        "ui/intent" | "choice/select" => None,
        _ => Some("UI surface intent events must be ui/intent or choice/select".to_string()),
    }
}

fn invalid_native_json_ui_dispatch_identifier_reason(value: &str, noun: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some(format!("{noun} must not be empty"));
    }
    if trimmed != value {
        return Some(format!("{noun} must not contain surrounding whitespace"));
    }
    if value.chars().any(char::is_control) {
        return Some(format!("{noun} must not contain control characters"));
    }
    if has_forbidden_ui_dispatch_uri_scheme(value) {
        return Some(format!("{noun} must not be URLs or dangerous URI schemes"));
    }
    if value.contains(['?', '#']) {
        return Some(format!("{noun} must not contain query or hash suffixes"));
    }
    if value.starts_with('/') {
        return Some(format!(
            "{noun} must be dispatch identifiers, not absolute paths"
        ));
    }
    let normalized = value.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || value.contains("..") {
        return Some(format!("{noun} must not contain traversal markers"));
    }
    if value.contains(['/', '\\']) {
        return Some(format!("{noun} must be dispatch identifiers, not paths"));
    }
    if is_forbidden_native_payload_reference(value) {
        return Some(format!("{noun} must not point to native payloads"));
    }
    if !value.chars().any(|char| char.is_ascii_alphanumeric()) {
        return Some(format!(
            "{noun} must contain at least one ASCII letter or digit"
        ));
    }
    if !value
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_' | ':'))
    {
        return Some(format!("{noun} must be safe native dispatch identifiers"));
    }
    None
}

fn invalid_native_json_asset_type_reason(asset_type: &str) -> Option<String> {
    let trimmed = asset_type.trim();
    if trimmed.is_empty() {
        return Some("asset types must not be empty".to_string());
    }
    if trimmed != asset_type
        || !asset_type
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'))
    {
        return Some("asset types must be safe native asset kind identifiers".to_string());
    }
    None
}

fn invalid_native_json_package_id_reason(package_id: &str) -> Option<String> {
    let trimmed = package_id.trim();
    if trimmed.is_empty() {
        return Some("package provenance ids must not be empty".to_string());
    }
    if trimmed != package_id {
        return Some("package provenance ids must not contain surrounding whitespace".to_string());
    }
    if package_id.chars().any(char::is_control) {
        return Some("package provenance ids must not contain control characters".to_string());
    }
    if has_uri_scheme(package_id) {
        return Some("package provenance ids must not be URLs or URI schemes".to_string());
    }
    if package_id.contains(['?', '#']) {
        return Some("package provenance ids must not contain query or hash suffixes".to_string());
    }
    if package_id.starts_with('/') {
        return Some("package provenance ids must be package ids, not absolute paths".to_string());
    }
    let normalized = package_id.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || package_id.contains("..") {
        return Some("package provenance ids must not contain traversal markers".to_string());
    }
    if package_id.contains(['/', '\\']) {
        return Some("package provenance ids must be identifiers, not paths".to_string());
    }
    if !package_id
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_'))
    {
        return Some("package provenance ids must be safe native package identifiers".to_string());
    }
    None
}

fn invalid_native_json_font_family_reason(font_family: &str) -> Option<String> {
    let trimmed = font_family.trim();
    if trimmed.is_empty() {
        return Some("font family names must not be empty".to_string());
    }
    if trimmed != font_family {
        return Some("font family names must not contain surrounding whitespace".to_string());
    }
    if font_family.chars().any(char::is_control) {
        return Some("font family names must not contain control characters".to_string());
    }
    if has_uri_scheme(font_family) {
        return Some("font family names must not be URLs or URI schemes".to_string());
    }
    if font_family.contains(':') {
        return Some(
            "font family names must not contain resource namespace separators".to_string(),
        );
    }
    if font_family.contains(['?', '#']) {
        return Some("font family names must not contain query or hash suffixes".to_string());
    }
    if font_family.starts_with('/') {
        return Some("font family names must not be absolute paths".to_string());
    }
    let normalized = font_family.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..") || font_family.contains("..") {
        return Some("font family names must not contain traversal markers".to_string());
    }
    if font_family.contains(['/', '\\']) {
        return Some("font family names must be names, not paths".to_string());
    }
    if is_forbidden_native_payload_reference(font_family) {
        return Some("font family names must not point to native payloads".to_string());
    }
    None
}

fn invalid_native_json_color_literal_reason(color: &str) -> Option<String> {
    let trimmed = color.trim();
    if trimmed.is_empty() {
        return Some("color literals must not be empty".to_string());
    }
    if trimmed != color {
        return Some("color literals must not contain surrounding whitespace".to_string());
    }
    if color.len() > 128 {
        return Some("color literals must stay within native renderer limits".to_string());
    }
    if color.chars().any(char::is_control) {
        return Some("color literals must not contain control characters".to_string());
    }
    if is_safe_native_color_literal(color) {
        return None;
    }
    if has_uri_scheme(color) {
        return Some("color literals must not be URLs or URI schemes".to_string());
    }
    if color.contains(['/', '\\']) || color.contains("..") {
        return Some("color literals must not be paths or traversal markers".to_string());
    }
    if is_forbidden_native_payload_reference(color) {
        return Some("color literals must not point to native payloads".to_string());
    }
    Some(
        "color literals must be hex, rgb(...), rgba(...), transparent, currentColor, or a basic named color"
            .to_string(),
    )
}

fn is_safe_native_color_literal(color: &str) -> bool {
    is_hex_color_literal(color)
        || is_basic_color_keyword(color)
        || is_rgb_color_function(color, "rgb", 3)
        || is_rgb_color_function(color, "rgba", 4)
}

fn is_hex_color_literal(color: &str) -> bool {
    let Some(hex) = color.strip_prefix('#') else {
        return false;
    };
    matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|char| char.is_ascii_hexdigit())
}

fn is_basic_color_keyword(color: &str) -> bool {
    matches!(
        color.to_ascii_lowercase().as_str(),
        "aqua"
            | "black"
            | "blue"
            | "currentcolor"
            | "fuchsia"
            | "gray"
            | "green"
            | "lime"
            | "maroon"
            | "navy"
            | "olive"
            | "orange"
            | "purple"
            | "red"
            | "silver"
            | "teal"
            | "transparent"
            | "white"
            | "yellow"
    )
}

fn is_rgb_color_function(color: &str, function_name: &str, expected_parts: usize) -> bool {
    let prefix = format!("{function_name}(");
    let lower = color.to_ascii_lowercase();
    if !lower.starts_with(&prefix) || !color.ends_with(')') {
        return false;
    }
    let body = &color[prefix.len()..color.len() - 1];
    let parts = body.split(',').map(str::trim).collect::<Vec<_>>();
    if parts.len() != expected_parts {
        return false;
    }
    parts.iter().take(3).copied().all(is_rgb_color_channel)
        && match parts.get(3).copied() {
            Some(alpha) => is_rgb_alpha_channel(alpha),
            None => true,
        }
}

fn is_rgb_color_channel(value: &str) -> bool {
    has_unsigned_decimal_syntax(value)
        && matches!(
            value.parse::<f64>(),
            Ok(number) if number.is_finite() && (0.0..=255.0).contains(&number)
        )
}

fn is_rgb_alpha_channel(value: &str) -> bool {
    has_rgb_alpha_channel_syntax(value)
        && matches!(
            value.parse::<f64>(),
            Ok(number) if number.is_finite() && (0.0..=1.0).contains(&number)
        )
}

fn has_rgb_alpha_channel_syntax(value: &str) -> bool {
    if matches!(value, "0" | "1") {
        return true;
    }
    if let Some(rest) = value.strip_prefix("0.") {
        return !rest.is_empty() && rest.chars().all(|char| char.is_ascii_digit());
    }
    if let Some(rest) = value.strip_prefix('.') {
        return !rest.is_empty() && rest.chars().all(|char| char.is_ascii_digit());
    }
    false
}

fn has_unsigned_decimal_syntax(value: &str) -> bool {
    let Some((first, rest)) = value.split_once('.') else {
        return !value.is_empty() && value.chars().all(|char| char.is_ascii_digit());
    };
    !first.is_empty()
        && !rest.is_empty()
        && first.chars().all(|char| char.is_ascii_digit())
        && rest.chars().all(|char| char.is_ascii_digit())
}

fn invalid_native_json_asset_reference_reason(asset_name: &str) -> Option<String> {
    let normalized = asset_name.replace('\\', "/");
    if asset_name.trim().is_empty() || strip_asset_reference_suffix(asset_name).trim().is_empty() {
        return Some("asset references must not be empty".to_string());
    }
    if asset_name.contains('\\') {
        return Some("asset references must use forward-slash package paths".to_string());
    }
    if normalized.starts_with('/') {
        return Some("asset references must be package-relative".to_string());
    }
    if has_uri_scheme(&normalized) {
        return Some("asset references must not be URLs or URI schemes".to_string());
    }
    if normalized.split('/').any(|segment| segment == "..") {
        return Some("asset references must not traverse outside the package".to_string());
    }
    if is_forbidden_native_payload_reference(&normalized) {
        return Some("asset references must not point to native payloads".to_string());
    }
    None
}

fn is_forbidden_native_payload_reference(asset_name: &str) -> bool {
    let normalized = strip_asset_reference_suffix(asset_name).to_ascii_lowercase();
    FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS.iter().any(|extension| {
        normalized.ends_with(extension) || normalized.contains(&format!("{extension}/"))
    })
}

fn strip_asset_reference_suffix(asset_name: &str) -> &str {
    asset_name
        .split_once(['?', '#'])
        .map(|(base, _)| base)
        .unwrap_or(asset_name)
}

fn has_uri_scheme(value: &str) -> bool {
    let Some(index) = value.find(':') else {
        return false;
    };
    let scheme = &value[..index];
    !scheme.is_empty()
        && scheme.chars().enumerate().all(|(index, char)| {
            if index == 0 {
                char.is_ascii_alphabetic()
            } else {
                char.is_ascii_alphanumeric() || matches!(char, '+' | '-' | '.')
            }
        })
}

fn has_forbidden_ui_dispatch_uri_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    matches!(
        scheme.to_ascii_lowercase().as_str(),
        "http"
            | "https"
            | "file"
            | "data"
            | "blob"
            | "javascript"
            | "native"
            | "shell"
            | "ffi"
            | "node"
            | "wasm"
    )
}

const FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS: [&str; 16] = [
    ".dylib",
    ".so",
    ".dll",
    ".framework",
    ".bundle",
    ".node",
    ".wasm",
    ".wasi",
    ".exe",
    ".msi",
    ".app",
    ".pkg",
    ".deb",
    ".rpm",
    ".appimage",
    ".jar",
];
