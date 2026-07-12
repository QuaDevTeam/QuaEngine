use std::collections::BTreeSet;

use crate::projection::audio::AudioTrackMemoryEstimate;
use crate::projection::character::{CharacterPosition, CharacterProjection};
use crate::projection::choices::{ChoiceProjection, ChoiceSetProjection};
use crate::projection::common::FontFamilyProjection;
use crate::projection::fonts::{FontFaceProjection, FontsProjection};
use crate::projection::view::ViewProjection;
use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::audio_numbers::{
    invalid_native_json_audio_memory_reason, invalid_native_json_audio_timing_reason,
    invalid_native_json_audio_volume_reason,
};
use super::character_numbers::{
    invalid_native_json_character_opacity_reason, invalid_native_json_character_position_reason,
};
use super::safe_strings::invalid_native_json_character_id_reason;
use super::JsonProjectionValidator;

impl JsonProjectionValidator {
    pub(super) fn validate_view(&mut self, view: &ViewProjection) {
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
                self.validate_audio_timing(&format!("view.audio.tracks[{index}]"), track);
                self.validate_provenance(
                    &format!("view.audio.tracks[{index}].provenance"),
                    &track.provenance,
                );
            }
        }
        if let Some(fonts) = view
            .plugins
            .as_ref()
            .and_then(|plugins| plugins.fonts.as_ref())
        {
            self.validate_fonts(fonts);
        }
    }

    fn validate_fonts(&mut self, fonts: &FontsProjection) {
        for (index, package_id) in fonts.required_runtime_packages.iter().enumerate() {
            self.validate_package_id(
                &format!("view.plugins.fonts.requiredRuntimePackages[{index}]"),
                package_id,
            );
        }

        let mut face_ids = BTreeSet::new();
        for (index, face) in fonts.faces.iter().enumerate() {
            self.validate_font_face(
                face,
                &format!("view.plugins.fonts.faces[{index}]"),
                &mut face_ids,
            );
        }
    }

    fn validate_font_face(
        &mut self,
        face: &FontFaceProjection,
        path: &str,
        face_ids: &mut BTreeSet<String>,
    ) {
        let identity = face.identity();
        if let Some(id) = &face.id {
            self.validate_ui_dispatch_identifier(&format!("{path}.id"), id, "font face ids");
        } else {
            self.validate_ui_dispatch_identifier(
                &format!("{path}.identity"),
                &identity,
                "font face ids",
            );
        }
        self.validate_unique_identifier(
            &format!("{path}.id"),
            &identity,
            face_ids,
            "font face ids",
        );
        self.validate_font_family(
            &format!("{path}.family"),
            &FontFamilyProjection::new([face.family.clone()]),
        );
        self.validate_asset_type(&format!("{path}.assetType"), &face.asset_type);
        self.validate_asset_reference(&format!("{path}.assetName"), &face.asset_name);
        self.validate_provenance(&format!("{path}.provenance"), &face.provenance);
    }

    fn validate_character(
        &mut self,
        character: &CharacterProjection,
        path: &str,
        character_ids: &mut BTreeSet<String>,
    ) {
        if let Some(reason) = invalid_native_json_character_id_reason(&character.id) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.id"),
                asset_name: character.id.clone(),
                reason,
            });
        }
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
        self.validate_z_index(
            &format!("{path}.layer"),
            character.layer,
            "character layers",
        );
        self.validate_provenance(&format!("{path}.provenance"), &character.provenance);
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
        self.validate_text_payload(&format!("{path}.text"), &choice.text, "choice text");
        self.validate_provenance(&format!("{path}.provenance"), &choice.provenance);
    }

    fn validate_character_position(&mut self, path: &str, position: &CharacterPosition) {
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

    fn validate_audio_memory(&mut self, path: &str, memory: &AudioTrackMemoryEstimate) {
        if let Some((field, value, reason)) = invalid_native_json_audio_memory_reason(memory) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }

    fn validate_audio_timing(
        &mut self,
        path: &str,
        track: &crate::projection::audio::AudioTrackProjection,
    ) {
        if let Some((field, value, reason)) = invalid_native_json_audio_timing_reason(track) {
            self.errors.push(NativeRendererJsonValidationError {
                path: format!("{path}.{field}"),
                asset_name: value,
                reason,
            });
        }
    }
}
