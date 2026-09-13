use super::*;
use quajs_wgpu_renderer::projection::audio::{
    AudioAutomationPointProjection, AudioAutomationProjection,
};
use rodio::buffer::SamplesBuffer;

fn band(kind: &str, frequency: f64, gain: f64) -> AudioEqBandProjection {
    AudioEqBandProjection {
        band_type: Some(kind.into()),
        frequency,
        gain_db: Some(gain),
        q: Some(1.0),
        detune: None,
    }
}
fn response(kind: &str, frequency: f64, gain: f64) -> f64 {
    let filter = Biquad::new(&band(kind, 1000.0, gain), 48000.0);
    let mut history = [0.0; 2];
    let mut power = 0.0;
    for i in 0..48000 {
        let x = (std::f64::consts::TAU * frequency * i as f64 / 48000.0).sin();
        let y = filter.sample(x, &mut history);
        if i >= 24000 {
            power += y * y;
        }
    }
    (power / 12000.0).sqrt()
}
#[test]
fn filters_change_spectrum_and_preserve_allpass_energy() {
    assert!(response("lowpass", 100.0, 0.0) > 0.99);
    assert!(response("lowpass", 10000.0, 0.0) < 0.01);
    assert!(response("highpass", 100.0, 0.0) < 0.02);
    assert!(response("highpass", 10000.0, 0.0) > 0.99);
    assert!(response("bandpass", 1000.0, 0.0) > 0.99);
    assert!(response("notch", 1000.0, 0.0) < 0.001);
    assert!((response("peaking", 1000.0, 6.0) - 10.0_f64.powf(6.0 / 20.0)).abs() < 0.001);
    assert!(response("lowshelf", 50.0, 6.0) > 1.98);
    assert!(response("highshelf", 15000.0, 6.0) > 1.98);
    for hz in [100.0, 1000.0, 10000.0] {
        assert!((response("allpass", hz, 0.0) - 1.0).abs() < 0.001);
    }
}
fn curve() -> AudioAutomationCurveProjection {
    AudioAutomationCurveProjection {
        points: vec![
            AudioAutomationPointProjection {
                at: 100.0,
                value: -20.0,
                easing: None,
            },
            AudioAutomationPointProjection {
                at: 1100.0,
                value: 0.0,
                easing: None,
            },
        ],
        duration: Some(1200.0),
        looped: false,
    }
}
#[test]
fn automation_uses_relative_time_linear_gain_and_loop_duration() {
    let mut c = curve();
    assert_eq!(curve_value(&c, 0.0, true), None);
    assert!((curve_value(&c, 600.0, true).unwrap() - 0.55).abs() < 1e-9);
    assert_eq!(curve_value(&c, 600.0, false), Some(-10.0));
    c.looped = true;
    assert_eq!(curve_value(&c, 1800.0, true), curve_value(&c, 600.0, true));
    c.points[1].easing = Some("ease-in".into());
    assert!(curve_value(&c, 600.0, true).unwrap() < 0.55);
}
#[test]
fn stereo_filters_keep_channel_histories_separate_and_update_without_restart() {
    let controls = ProcessingControls::default();
    let stage = AudioProcessingStageProjection {
        id: "track:t".into(),
        eq: vec![band("lowpass", 500.0, 0.0)],
        ..Default::default()
    };
    controls.update(&[stage.clone()]);
    let samples: Vec<f32> = (0..4800)
        .flat_map(|i| [if i == 0 { 1.0 } else { 0.0 }, 0.0])
        .collect();
    let source = SamplesBuffer::new(
        ChannelCount::new(2).unwrap(),
        SampleRate::new(48000).unwrap(),
        samples,
    );
    let mut processed = ProcessedSource::new(source, &[stage.clone()], controls.clone());
    let first: Vec<_> = processed.by_ref().take(256).collect();
    assert!(first.iter().step_by(2).any(|s| s.abs() > 0.0001));
    assert!(first.iter().skip(1).step_by(2).all(|s| *s == 0.0));
    let mut next = stage;
    next.gain_db = -120.0;
    next.eq.clear();
    controls.update(&[next]);
    assert!(processed.take(256).all(|s| s == 0.0));
}
#[test]
fn unrelated_gain_or_eq_updates_preserve_automation_epoch() {
    let controls = ProcessingControls::default();
    let mut stage = AudioProcessingStageProjection {
        id: "bus:master".into(),
        automation: vec![AudioAutomationProjection {
            target: "master".into(),
            property_path: "gainDb".into(),
            curve: curve(),
        }],
        ..Default::default()
    };
    controls.update(&[stage.clone()]);
    let before = controls.0.lock().unwrap()[&stage.id].started;
    stage.gain_db = -3.0;
    controls.update(&[stage.clone()]);
    assert_eq!(before, controls.0.lock().unwrap()[&stage.id].started);
    controls.retain(&[]);
    assert!(controls.0.lock().unwrap().is_empty());
}

#[test]
fn exports_measured_spectra_for_web_audio_comparison() {
    let Ok(path) = std::env::var("QUA_NATIVE_AUDIO_AUDIT_OUTPUT") else {
        return;
    };
    let mut rows = Vec::new();
    for kind in [
        "lowpass",
        "highpass",
        "bandpass",
        "notch",
        "allpass",
        "peaking",
        "lowshelf",
        "highshelf",
    ] {
        for frequency in [100.0, 500.0, 1000.0, 5000.0, 15000.0] {
            rows.push(serde_json::json!({ "kind": kind, "frequency": frequency, "amplitude": response(kind, frequency, 6.0) }));
        }
    }
    std::fs::write(path, serde_json::to_vec_pretty(&rows).unwrap()).unwrap();
}
