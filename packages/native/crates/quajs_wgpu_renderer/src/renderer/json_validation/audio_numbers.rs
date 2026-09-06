use crate::projection::audio::{AudioTrackMemoryEstimate, AudioTrackProjection};
use crate::projection::safety::{
    is_safe_native_audio_memory, is_safe_optional_audio_duration_ms,
    is_safe_optional_audio_timestamp_ms, MAX_NATIVE_AUDIO_DURATION_MS,
    MAX_NATIVE_AUDIO_TIMESTAMP_MS, MAX_NATIVE_AUDIO_TRACK_CPU_BYTES, MAX_NATIVE_AUDIO_VOLUME,
};

pub(super) fn invalid_native_json_audio_volume_reason(value: f32) -> Option<String> {
    if !value.is_finite() || !(0.0..=MAX_NATIVE_AUDIO_VOLUME).contains(&value) {
        return Some("audio track volume must be finite and between 0 and 16".to_string());
    }
    None
}

pub(super) fn invalid_native_json_audio_memory_reason(
    memory: &AudioTrackMemoryEstimate,
) -> Option<(&'static str, String, String)> {
    if is_safe_native_audio_memory(memory) {
        return None;
    }

    validate_memory_estimate("bufferCpuBytes", memory.buffer_cpu_bytes)
        .or_else(|| validate_memory_estimate("streamCpuBytes", memory.stream_cpu_bytes))
        .or_else(|| validate_memory_estimate("handleCpuBytes", memory.handle_cpu_bytes))
}

pub(super) fn invalid_native_json_audio_timing_reason(
    track: &AudioTrackProjection,
) -> Option<(&'static str, String, String)> {
    if !crate::projection::audio_processing::valid_audio_processing(&track.processing) {
        return Some((
            "processing",
            "invalid".into(),
            "audio EQ/automation exceeds supported property or numeric limits".into(),
        ));
    }
    validate_duration_ms("durationMs", track.duration_ms)
        .or_else(|| validate_duration_ms("fadeInMs", track.fade_in_ms))
        .or_else(|| validate_duration_ms("fadeOutMs", track.fade_out_ms))
        .or_else(|| validate_duration_ms("crossfadeMs", track.crossfade_ms))
        .or_else(|| validate_timestamp_ms("playAt", track.play_at))
        .or_else(|| validate_duration_ms("delayMs", track.delay_ms))
        .or_else(|| validate_duration_ms("seekMs", track.seek_ms))
        .or_else(|| validate_duration_ms("offsetMs", track.offset_ms))
}

fn validate_memory_estimate(
    field: &'static str,
    value: u64,
) -> Option<(&'static str, String, String)> {
    if value > MAX_NATIVE_AUDIO_TRACK_CPU_BYTES {
        return Some((
            field,
            value.to_string(),
            "audio track memory estimates exceed native renderer limits".to_string(),
        ));
    }
    None
}

fn validate_duration_ms(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    if is_safe_optional_audio_duration_ms(value) {
        return None;
    }
    Some((
        field,
        number_value(value),
        format!(
            "audio track {field} must be finite, non-negative, and no greater than {MAX_NATIVE_AUDIO_DURATION_MS}ms"
        ),
    ))
}

fn validate_timestamp_ms(
    field: &'static str,
    value: Option<f64>,
) -> Option<(&'static str, String, String)> {
    if is_safe_optional_audio_timestamp_ms(value) {
        return None;
    }
    Some((
        field,
        number_value(value),
        format!(
            "audio track {field} must be a finite, non-negative timestamp in milliseconds no greater than {MAX_NATIVE_AUDIO_TIMESTAMP_MS}"
        ),
    ))
}

fn number_value(value: Option<f64>) -> String {
    match value {
        Some(value) => value.to_string(),
        None => "null".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_accepts_native_linear_gain_values() {
        assert_eq!(invalid_native_json_audio_volume_reason(0.0), None);
        assert_eq!(invalid_native_json_audio_volume_reason(1.0), None);

        assert!(invalid_native_json_audio_volume_reason(f32::NAN)
            .unwrap()
            .contains("finite"));
        assert!(invalid_native_json_audio_volume_reason(-0.01)
            .unwrap()
            .contains("between 0 and 16"));
        assert_eq!(invalid_native_json_audio_volume_reason(8.0), None);
        assert!(invalid_native_json_audio_volume_reason(16.01)
            .unwrap()
            .contains("between 0 and 16"));
    }

    #[test]
    fn memory_estimates_accept_zero_and_limit_values() {
        assert_eq!(
            invalid_native_json_audio_memory_reason(&AudioTrackMemoryEstimate {
                buffer_cpu_bytes: MAX_NATIVE_AUDIO_TRACK_CPU_BYTES,
                stream_cpu_bytes: 0,
                handle_cpu_bytes: 0,
            }),
            None
        );
    }

    #[test]
    fn memory_estimates_reject_oversized_values() {
        let oversized = invalid_native_json_audio_memory_reason(&AudioTrackMemoryEstimate {
            buffer_cpu_bytes: 0,
            stream_cpu_bytes: MAX_NATIVE_AUDIO_TRACK_CPU_BYTES + 1,
            handle_cpu_bytes: 0,
        })
        .unwrap();

        assert_eq!(oversized.0, "streamCpuBytes");
        assert_eq!(oversized.1, "2147483649");
        assert!(oversized.2.contains("memory estimates"));
    }

    #[test]
    fn timing_fields_accept_safe_duration_and_timestamp_values() {
        let mut track = AudioTrackProjection::new(
            "bgm-main",
            crate::projection::audio::AudioTrackKind::Bgm,
            "music/opening.ogg",
        );
        track.duration_ms = Some(MAX_NATIVE_AUDIO_DURATION_MS);
        track.fade_in_ms = Some(0.0);
        track.fade_out_ms = Some(250.0);
        track.crossfade_ms = Some(300.0);
        track.play_at = Some(MAX_NATIVE_AUDIO_TIMESTAMP_MS);
        track.delay_ms = Some(100.0);
        track.seek_ms = Some(1_500.0);
        track.offset_ms = Some(25.0);

        assert_eq!(invalid_native_json_audio_timing_reason(&track), None);
    }

    #[test]
    fn timing_fields_reject_unsafe_duration_and_timestamp_values() {
        let mut duration = AudioTrackProjection::new(
            "bgm-main",
            crate::projection::audio::AudioTrackKind::Bgm,
            "music/opening.ogg",
        );
        duration.seek_ms = Some(-1.0);
        let duration_error = invalid_native_json_audio_timing_reason(&duration).unwrap();
        assert_eq!(duration_error.0, "seekMs");
        assert_eq!(duration_error.1, "-1");
        assert!(duration_error.2.contains("non-negative"));

        let mut timestamp = AudioTrackProjection::new(
            "bgm-main",
            crate::projection::audio::AudioTrackKind::Bgm,
            "music/opening.ogg",
        );
        timestamp.play_at = Some(MAX_NATIVE_AUDIO_TIMESTAMP_MS + 1.0);
        let timestamp_error = invalid_native_json_audio_timing_reason(&timestamp).unwrap();
        assert_eq!(timestamp_error.0, "playAt");
        assert!(timestamp_error.2.contains("timestamp"));
    }
}
