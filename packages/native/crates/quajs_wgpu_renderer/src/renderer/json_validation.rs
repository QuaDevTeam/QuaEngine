use crate::projection::background::{BackgroundProjection, BackgroundVideoProjection};
use crate::projection::character::CharacterProjection;
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
        if let Some(ui) = &view.ui {
            self.validate_ui(ui);
        }
        if let Some(audio) = &view.audio {
            for (index, track) in audio.tracks.iter().enumerate() {
                self.validate_asset_reference(
                    &format!("view.audio.tracks[{index}].assetName"),
                    &track.asset_name,
                );
            }
        }
    }

    fn validate_background(&mut self, background: &BackgroundProjection) {
        if let Some(asset_name) = &background.asset_name {
            self.validate_asset_reference("view.background.assetName", asset_name);
        }
        for (index, layer) in background.layers.iter().enumerate() {
            self.validate_asset_reference(
                &format!("view.background.layers[{index}].assetName"),
                &layer.asset_name,
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
    }

    fn validate_character(&mut self, character: &CharacterProjection, path: &str) {
        if let Some(sprite) = &character.sprite {
            self.validate_asset_reference(&format!("{path}.sprite"), sprite);
        }
    }

    fn validate_dialogue(&mut self, dialogue: &DialogueProjection) {
        if let Some(avatar) = &dialogue.avatar {
            self.validate_dialogue_avatar(avatar);
        }
    }

    fn validate_dialogue_avatar(&mut self, avatar: &DialogueAvatarProjection) {
        self.validate_asset_reference("view.dialogue.avatar.assetName", &avatar.asset_name);
    }

    fn validate_ui(&mut self, ui: &UiProjection) {
        for (overlay_index, overlay) in ui.overlays.iter().enumerate() {
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
        self.validate_asset_reference(&format!("{path}.assetName"), &image.asset_name);
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
}

fn invalid_native_json_asset_reference_reason(asset_name: &str) -> Option<String> {
    let normalized = asset_name.replace('\\', "/");
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
