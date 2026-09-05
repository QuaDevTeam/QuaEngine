use std::collections::BTreeSet;

use crate::projection::background::{
    BackgroundCompositionProjection, BackgroundProjection, BackgroundVideoProjection,
};
use crate::renderer::json_input::NativeRendererJsonValidationError;

use super::background_numbers::{
    invalid_native_json_background_geometry_reason, invalid_native_json_background_opacity_reason,
    invalid_native_json_background_rotation_reason, invalid_native_json_video_playback_rate_reason,
    invalid_native_json_video_position_reason, invalid_native_json_video_volume_reason,
};
use super::background_origin::invalid_native_json_background_origin_reason;
use super::JsonProjectionValidator;

impl JsonProjectionValidator {
    pub(super) fn validate_background(&mut self, background: &BackgroundProjection) {
        self.validate_provenance("view.background.provenance", &background.provenance);
        if let Some(asset_type) = &background.asset_type {
            self.validate_asset_type("view.background.assetType", asset_type);
        }
        if let Some(asset_name) = &background.asset_name {
            self.validate_asset_reference("view.background.assetName", asset_name);
        }
        if let Some(origin) = &background.origin {
            self.validate_background_origin("view.background.origin", origin);
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
        self.validate_background_composition(
            "view.background.composition",
            background.composition.as_ref(),
        );
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
            if let Some(origin) = &layer.origin {
                self.validate_background_origin(&format!("{layer_path}.origin"), origin);
            }
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
            self.validate_background_composition(
                &format!("{layer_path}.composition"),
                layer.composition.as_ref(),
            );
            self.validate_z_index(
                &format!("{layer_path}.zIndex"),
                layer.z_index,
                "background layer zIndex",
            );
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
        if let Some(origin) = &video.origin {
            self.validate_background_origin("view.background.video.origin", origin);
        }
        self.validate_background_opacity("view.background.video.opacity", video.opacity);
        self.validate_video_volume("view.background.video.volume", video.volume);
        self.validate_video_playback_rate(
            "view.background.video.playbackRate",
            video.playback_rate,
        );
        self.validate_video_position("view.background.video.seekMs", "seekMs", video.seek_ms);
        self.validate_video_position(
            "view.background.video.offsetMs",
            "offsetMs",
            video.offset_ms,
        );
        self.validate_provenance("view.background.video.provenance", &video.provenance);
    }

    fn validate_background_composition(
        &mut self,
        path: &str,
        composition: Option<&BackgroundCompositionProjection>,
    ) {
        let Some(composition) = composition else {
            return;
        };
        if let Some(filter) = &composition.filter {
            for (field, value, range) in [
                ("brightness", filter.brightness, 0.0..=8.0),
                ("saturate", filter.saturate, 0.0..=8.0),
                ("contrast", filter.contrast, 0.0..=8.0),
                ("grayscale", filter.grayscale, 0.0..=1.0),
                ("sepia", filter.sepia, 0.0..=1.0),
                ("invert", filter.invert, 0.0..=1.0),
            ] {
                if !value.is_finite() || !range.contains(&value) {
                    self.errors.push(NativeRendererJsonValidationError {
                        path: format!("{path}.filter.{field}"),
                        asset_name: value.to_string(),
                        reason: "background filter value is outside native renderer limits"
                            .to_string(),
                    });
                }
            }
            if !filter.blur.is_finite() || !(0.0..=4096.0).contains(&filter.blur) {
                self.errors.push(NativeRendererJsonValidationError {
                    path: format!("{path}.filter.blur"),
                    asset_name: filter.blur.to_string(),
                    reason: "background blur must be finite and between 0 and 4096".to_string(),
                });
            }
            if !filter.hue_rotate.is_finite() || filter.hue_rotate.abs() > 360_000.0 {
                self.errors.push(NativeRendererJsonValidationError {
                    path: format!("{path}.filter.hueRotate"),
                    asset_name: filter.hue_rotate.to_string(),
                    reason: "background hue rotation must be finite and bounded".to_string(),
                });
            }
        }
        if let Some(mask) = &composition.mask {
            if let Some(asset_name) = &mask.asset_name {
                self.validate_asset_reference(&format!("{path}.mask.assetName"), asset_name);
            }
            if let Some(asset_type) = &mask.asset_type {
                self.validate_asset_type(&format!("{path}.mask.assetType"), asset_type);
            }
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

    fn validate_video_volume(&mut self, path: &str, value: Option<f32>) {
        if let Some(reason) = invalid_native_json_video_volume_reason(value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.unwrap_or_default().to_string(),
                reason,
            });
        }
    }

    fn validate_video_playback_rate(&mut self, path: &str, value: Option<f32>) {
        if let Some(reason) = invalid_native_json_video_playback_rate_reason(value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.unwrap_or_default().to_string(),
                reason,
            });
        }
    }

    fn validate_video_position(&mut self, path: &str, field: &'static str, value: Option<f64>) {
        if let Some((_, reason)) = invalid_native_json_video_position_reason(field, value) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: value.unwrap_or_default().to_string(),
                reason,
            });
        }
    }

    fn validate_background_origin(&mut self, path: &str, origin: &str) {
        if let Some(reason) = invalid_native_json_background_origin_reason(origin) {
            self.errors.push(NativeRendererJsonValidationError {
                path: path.to_string(),
                asset_name: origin.to_string(),
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
}
