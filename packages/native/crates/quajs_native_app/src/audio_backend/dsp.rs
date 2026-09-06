//! Transient DSP only: controls are engine projections, history belongs to the decoder.
use quajs_wgpu_renderer::projection::audio::{
    AudioAutomationCurveProjection, AudioEqBandProjection, AudioProcessingStageProjection,
};
use quajs_wgpu_renderer::projection::audio_processing::eq_property;
use quajs_wgpu_renderer::projection_runtime::ease_progress;
use rodio::{ChannelCount, SampleRate, Source};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub(super) struct StageControl {
    projection: AudioProcessingStageProjection,
    started: Instant,
}

#[derive(Clone, Default)]
pub(super) struct ProcessingControls(Arc<Mutex<BTreeMap<String, StageControl>>>);
impl ProcessingControls {
    pub fn update(&self, stages: &[AudioProcessingStageProjection]) {
        let mut controls = self.0.lock().unwrap_or_else(|e| e.into_inner());
        for projection in stages {
            let started = controls
                .get(&projection.id)
                .filter(|old| old.projection.automation == projection.automation)
                .map(|old| old.started)
                .unwrap_or_else(Instant::now);
            controls.insert(
                projection.id.clone(),
                StageControl {
                    projection: projection.clone(),
                    started,
                },
            );
        }
    }
    pub fn retain(&self, ids: &[String]) {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .retain(|id, _| ids.contains(id));
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
}
impl Biquad {
    pub fn new(band: &AudioEqBandProjection, sample_rate: f64) -> Self {
        let frequency = (band.frequency * 2.0_f64.powf(band.detune.unwrap_or(0.0) / 1200.0))
            .clamp(0.0001, sample_rate * 0.499999);
        let w = std::f64::consts::TAU * frequency / sample_rate;
        let (s, c) = w.sin_cos();
        let kind = band.band_type.as_deref().unwrap_or("peaking");
        // WebAudio low/highpass Q is dB; other resonant filters use linear Q.
        let q = band.q.unwrap_or(1.0);
        let alpha = s
            / (2.0
                * if matches!(kind, "lowpass" | "highpass") {
                    10.0_f64.powf(q / 20.0)
                } else {
                    q.max(0.0001)
                });
        let gain = 10.0_f64.powf(band.gain_db.unwrap_or(0.0) / 40.0);
        let shelf_alpha = s / 2.0 * 2.0_f64.sqrt();
        let t = 2.0 * gain.sqrt() * shelf_alpha;
        let (b, a) = match kind {
            "lowpass" => (
                [(1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0],
                [1.0 + alpha, -2.0 * c, 1.0 - alpha],
            ),
            "highpass" => (
                [(1.0 + c) / 2.0, -(1.0 + c), (1.0 + c) / 2.0],
                [1.0 + alpha, -2.0 * c, 1.0 - alpha],
            ),
            "bandpass" => ([alpha, 0.0, -alpha], [1.0 + alpha, -2.0 * c, 1.0 - alpha]),
            "notch" => ([1.0, -2.0 * c, 1.0], [1.0 + alpha, -2.0 * c, 1.0 - alpha]),
            "allpass" => (
                [1.0 - alpha, -2.0 * c, 1.0 + alpha],
                [1.0 + alpha, -2.0 * c, 1.0 - alpha],
            ),
            "lowshelf" => (
                [
                    gain * ((gain + 1.0) - (gain - 1.0) * c + t),
                    2.0 * gain * ((gain - 1.0) - (gain + 1.0) * c),
                    gain * ((gain + 1.0) - (gain - 1.0) * c - t),
                ],
                [
                    (gain + 1.0) + (gain - 1.0) * c + t,
                    -2.0 * ((gain - 1.0) + (gain + 1.0) * c),
                    (gain + 1.0) + (gain - 1.0) * c - t,
                ],
            ),
            "highshelf" => (
                [
                    gain * ((gain + 1.0) + (gain - 1.0) * c + t),
                    -2.0 * gain * ((gain - 1.0) + (gain + 1.0) * c),
                    gain * ((gain + 1.0) + (gain - 1.0) * c - t),
                ],
                [
                    (gain + 1.0) - (gain - 1.0) * c + t,
                    2.0 * ((gain - 1.0) - (gain + 1.0) * c),
                    (gain + 1.0) - (gain - 1.0) * c - t,
                ],
            ),
            _ => (
                [1.0 + alpha * gain, -2.0 * c, 1.0 - alpha * gain],
                [1.0 + alpha / gain, -2.0 * c, 1.0 - alpha / gain],
            ),
        };
        Self {
            b: b.map(|v| v / a[0]),
            a: [a[1] / a[0], a[2] / a[0]],
        }
    }
    pub fn sample(&self, x: f64, history: &mut [f64; 2]) -> f64 {
        let y = self.b[0] * x + history[0];
        history[0] = self.b[1] * x - self.a[0] * y + history[1];
        history[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}

pub(super) fn curve_value(
    curve: &AudioAutomationCurveProjection,
    elapsed: f64,
    gain: bool,
) -> Option<f64> {
    let points = &curve.points;
    let first = points.first()?;
    let duration = curve.duration.unwrap_or(points.last()?.at);
    let time = if curve.looped && duration > 0.0 {
        elapsed.rem_euclid(duration)
    } else {
        elapsed
    };
    let convert = |v: f64| if gain { 10.0_f64.powf(v / 20.0) } else { v };
    if time < first.at {
        return None;
    }
    for pair in points.windows(2) {
        if time < pair[1].at {
            let p = ease_progress(
                (time - pair[0].at) / (pair[1].at - pair[0].at),
                pair[1].easing.as_deref(),
            );
            let a = convert(pair[0].value);
            return Some(a + (convert(pair[1].value) - a) * p);
        }
    }
    Some(convert(points.last()?.value))
}

struct StageDsp {
    id: String,
    gain: f64,
    filters: Vec<Biquad>,
    history: Vec<Vec<[f64; 2]>>,
}

pub(super) struct ProcessedSource<S> {
    source: S,
    controls: ProcessingControls,
    stages: Vec<StageDsp>,
    channel: usize,
    frames: usize,
    channels: usize,
    sample_rate: f64,
}
impl<S: Source> ProcessedSource<S> {
    pub fn new(
        source: S,
        stages: &[AudioProcessingStageProjection],
        controls: ProcessingControls,
    ) -> Self {
        let channels = source.channels().get() as usize;
        let sample_rate = source.sample_rate().get() as f64;
        Self {
            source,
            controls,
            stages: stages
                .iter()
                .map(|s| StageDsp {
                    id: s.id.clone(),
                    gain: 1.0,
                    filters: Vec::new(),
                    history: Vec::new(),
                })
                .collect(),
            channels,
            sample_rate,
            channel: 0,
            frames: 0,
        }
    }
    fn refresh(&mut self) {
        let Ok(controls) = self.controls.0.try_lock() else {
            return;
        };
        for stage in &mut self.stages {
            let Some(control) = controls.get(&stage.id) else {
                continue;
            };
            let projection = &control.projection;
            let time = control.started.elapsed().as_secs_f64() * 1000.0;
            stage.gain = 10.0_f64.powf(projection.gain_db / 20.0);
            let mut bands = projection.eq.clone();
            for automation in &projection.automation {
                if let Some(value) = curve_value(
                    &automation.curve,
                    time,
                    automation.property_path == "gainDb",
                ) {
                    if automation.property_path == "gainDb" {
                        stage.gain = value;
                    } else if let Some((i, property)) = eq_property(&automation.property_path) {
                        if let Some(band) = bands.get_mut(i) {
                            match property {
                                "gainDb" => band.gain_db = Some(value),
                                "frequency" => band.frequency = value,
                                "q" => band.q = Some(value),
                                "detune" => band.detune = Some(value),
                                _ => {}
                            }
                        }
                    }
                }
            }
            stage.filters = bands
                .iter()
                .map(|band| Biquad::new(band, self.sample_rate))
                .collect();
            stage
                .history
                .resize_with(stage.filters.len(), || vec![[0.0; 2]; self.channels]);
        }
    }
}
impl<S: Source> Iterator for ProcessedSource<S> {
    type Item = rodio::Sample;
    fn next(&mut self) -> Option<Self::Item> {
        if self.channel == 0 && self.frames % 64 == 0 {
            self.refresh();
        }
        let mut sample = self.source.next()? as f64;
        for stage in &mut self.stages {
            sample *= stage.gain;
            for (filter, history) in stage.filters.iter().zip(&mut stage.history) {
                sample = filter.sample(sample, &mut history[self.channel]);
            }
        }
        self.channel += 1;
        if self.channel == self.channels {
            self.channel = 0;
            self.frames += 1;
        }
        Some(if sample.is_finite() {
            sample as rodio::Sample
        } else {
            0.0
        })
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.source.size_hint()
    }
}
impl<S: Source> Source for ProcessedSource<S> {
    fn current_span_len(&self) -> Option<usize> {
        self.source.current_span_len()
    }
    fn channels(&self) -> ChannelCount {
        self.source.channels()
    }
    fn sample_rate(&self) -> SampleRate {
        self.source.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.source.total_duration()
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), rodio::source::SeekError> {
        self.source.try_seek(pos)?;
        for stage in &mut self.stages {
            for channel in stage.history.iter_mut().flatten() {
                *channel = [0.0; 2];
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
