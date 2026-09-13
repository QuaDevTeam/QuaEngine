use super::audio::AudioProcessingStageProjection;

/// Bounds both DSP cost and coefficient inputs before resource loading/playback.
pub fn valid_audio_processing(stages: &[AudioProcessingStageProjection]) -> bool {
    stages.len() <= 3
        && stages.iter().all(|stage| {
            !stage.id.is_empty()
                && stage.id.len() <= 256
                && range(stage.gain_db, -120.0, 120.0)
                && stage.eq.len() <= 16
                && stage.eq.iter().all(|band| {
                    matches!(
                        band.band_type.as_deref().unwrap_or("peaking"),
                        "lowpass"
                            | "highpass"
                            | "bandpass"
                            | "lowshelf"
                            | "highshelf"
                            | "peaking"
                            | "notch"
                            | "allpass"
                    ) && range(band.frequency, 0.0, 192_000.0)
                        && band.gain_db.is_none_or(|v| range(v, -120.0, 120.0))
                        && band.q.is_none_or(|v| range(v, 0.0, 1000.0))
                        && band.detune.is_none_or(|v| range(v, -4800.0, 4800.0))
                })
                && stage.automation.len() <= 64
                && stage.automation.iter().all(|item| {
                    let limits = if item.property_path == "gainDb" {
                        Some((-120.0, 120.0))
                    } else {
                        eq_property(&item.property_path)
                            .filter(|(i, _)| *i < stage.eq.len())
                            .map(|(_, prop)| match prop {
                                "frequency" => (0.0, 192_000.0),
                                "q" => (0.0, 1000.0),
                                "detune" => (-4800.0, 4800.0),
                                _ => (-120.0, 120.0),
                            })
                    };
                    let Some((min, max)) = limits else {
                        return false;
                    };
                    let points = &item.curve.points;
                    !points.is_empty()
                        && points.len() <= 1024
                        && points.iter().all(|p| {
                            range(p.at, 0.0, 86_400_000.0)
                                && range(p.value, min, max)
                                && p.easing.as_ref().is_none_or(|s| s.len() <= 128)
                        })
                        && points.windows(2).all(|p| p[0].at < p[1].at)
                        && item
                            .curve
                            .duration
                            .is_none_or(|v| range(v, points.last().unwrap().at, 86_400_000.0))
                })
        })
}

pub fn eq_property(path: &str) -> Option<(usize, &str)> {
    let (index, property) = path.strip_prefix("eq[")?.split_once("].")?;
    if !matches!(property, "frequency" | "gainDb" | "q" | "detune") {
        return None;
    }
    Some((index.parse().ok()?, property))
}

fn range(value: f64, min: f64, max: f64) -> bool {
    value.is_finite() && (min..=max).contains(&value)
}
