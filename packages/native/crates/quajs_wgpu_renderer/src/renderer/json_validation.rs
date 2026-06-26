use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::character::CharacterProjection;
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::PackageProvenance;
use crate::projection::dialogue::{DialogueAvatarProjection, DialogueProjection};
use crate::projection::ui::{UiProjection, UiSurfaceImageProjection, UiSurfaceNodeProjection};
use crate::projection::view::ViewProjection;
use crate::renderer::json_input::{
    NativeRendererJsonFrameError, NativeRendererJsonValidationError,
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
        for (index, character) in view.characters.iter().enumerate() {
            self.validate_character(character, &format!("view.characters[{index}]"));
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
            for (index, track) in audio.tracks.iter().enumerate() {
                self.validate_asset_type(
                    &format!("view.audio.tracks[{index}].assetType"),
                    &track.asset_type,
                );
                self.validate_asset_reference(
                    &format!("view.audio.tracks[{index}].assetName"),
                    &track.asset_name,
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
        for (index, layer) in background.layers.iter().enumerate() {
            if let Some(asset_type) = &layer.asset_type {
                self.validate_asset_type(
                    &format!("view.background.layers[{index}].assetType"),
                    asset_type,
                );
            }
            self.validate_asset_reference(
                &format!("view.background.layers[{index}].assetName"),
                &layer.asset_name,
            );
            self.validate_provenance(
                &format!("view.background.layers[{index}].provenance"),
                &layer.provenance,
            );
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
        self.validate_provenance("view.background.video.provenance", &video.provenance);
    }

    fn validate_character(&mut self, character: &CharacterProjection, path: &str) {
        if let Some(sprite) = &character.sprite {
            self.validate_asset_reference(&format!("{path}.sprite"), sprite);
        }
        self.validate_provenance(&format!("{path}.provenance"), &character.provenance);
    }

    fn validate_dialogue(&mut self, dialogue: &DialogueProjection) {
        if let Some(avatar) = &dialogue.avatar {
            self.validate_dialogue_avatar(avatar);
        }
        self.validate_provenance("view.dialogue.provenance", &dialogue.provenance);
    }

    fn validate_dialogue_avatar(&mut self, avatar: &DialogueAvatarProjection) {
        self.validate_asset_type("view.dialogue.avatar.assetType", &avatar.asset_type);
        self.validate_asset_reference("view.dialogue.avatar.assetName", &avatar.asset_name);
        self.validate_provenance("view.dialogue.avatar.provenance", &avatar.provenance);
    }

    fn validate_choices(&mut self, choices: &ChoiceSetProjection) {
        self.validate_provenance("view.choices.provenance", &choices.provenance);
        for (index, choice) in choices.choices.iter().enumerate() {
            self.validate_choice(choice, &format!("view.choices.choices[{index}]"));
        }
    }

    fn validate_choice(&mut self, choice: &ChoiceProjection, path: &str) {
        self.validate_provenance(&format!("{path}.provenance"), &choice.provenance);
    }

    fn validate_ui(&mut self, ui: &UiProjection) {
        self.validate_provenance("view.ui.provenance", &ui.provenance);
        for (overlay_index, overlay) in ui.overlays.iter().enumerate() {
            self.validate_provenance(
                &format!("view.ui.overlays[{overlay_index}].provenance"),
                &overlay.provenance,
            );
            if let Some(surface) = &overlay.surface {
                if let Some(root) = &surface.root {
                    self.validate_ui_surface_node(
                        root,
                        &format!("view.ui.overlays[{overlay_index}].surface.root"),
                    );
                }
            }
        }
    }

    fn validate_ui_surface_node(&mut self, node: &UiSurfaceNodeProjection, path: &str) {
        self.validate_provenance(&format!("{path}.provenance"), &node.provenance);
        if let Some(image) = &node.image {
            self.validate_ui_image(image, &format!("{path}.image"));
        }
        if let Some(background_image) = &node.style.background_image {
            self.validate_ui_image(background_image, &format!("{path}.style.backgroundImage"));
        }
        for (index, child) in node.children.iter().enumerate() {
            self.validate_ui_surface_node(child, &format!("{path}.children[{index}]"));
        }
    }

    fn validate_ui_image(&mut self, image: &UiSurfaceImageProjection, path: &str) {
        self.validate_asset_type(&format!("{path}.assetType"), &image.asset_type);
        self.validate_asset_reference(&format!("{path}.assetName"), &image.asset_name);
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
