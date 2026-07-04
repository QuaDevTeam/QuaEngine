use crate::projection::audio::AudioTrackMemoryEstimate;
use crate::projection::safety::{
    is_safe_native_audio_memory, is_safe_native_opacity, MAX_NATIVE_AUDIO_TRACK_CPU_BYTES,
};

pub(super) fn invalid_native_json_audio_volume_reason(value: f32) -> Option<String> {
    if !is_safe_native_opacity(value) {
        return Some("audio track volume must be finite and between 0 and 1".to_string());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_accepts_only_finite_normalized_values() {
        assert_eq!(invalid_native_json_audio_volume_reason(0.0), None);
        assert_eq!(invalid_native_json_audio_volume_reason(1.0), None);

        assert!(invalid_native_json_audio_volume_reason(f32::NAN)
            .unwrap()
            .contains("finite"));
        assert!(invalid_native_json_audio_volume_reason(-0.01)
            .unwrap()
            .contains("between 0 and 1"));
        assert!(invalid_native_json_audio_volume_reason(1.01)
            .unwrap()
            .contains("between 0 and 1"));
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
}
