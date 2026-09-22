//! Process-local editor output gate, independent of authored audio projection.
use rodio::{ChannelCount, SampleRate, Source};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

static MUTED: LazyLock<Arc<AtomicBool>> = LazyLock::new(|| {
    Arc::new(AtomicBool::new(
        std::env::var("QUA_NATIVE_EDITOR_PREVIEW").as_deref() == Ok("1")
            && std::env::var("QUA_NATIVE_EDITOR_MUTED").as_deref() == Ok("1"),
    ))
});

pub(crate) fn set_muted(muted: bool) {
    MUTED.store(muted, Ordering::Relaxed);
}

pub(super) struct OutputSource<S> {
    source: S,
    muted: Arc<AtomicBool>,
}

impl<S> OutputSource<S> {
    pub fn new(source: S) -> Self {
        Self {
            source,
            muted: Arc::clone(&MUTED),
        }
    }
}

impl<S: Source> Iterator for OutputSource<S> {
    type Item = rodio::Sample;
    fn next(&mut self) -> Option<Self::Item> {
        // Consume even when muted: time, natural completion and DSP still advance.
        let sample = self.source.next()?;
        Some(if self.muted.load(Ordering::Relaxed) {
            0.0
        } else {
            sample
        })
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.source.size_hint()
    }
}

impl<S: Source> Source for OutputSource<S> {
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
        self.source.try_seek(pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_mute_silences_existing_and_new_sources_without_pausing_or_changing_gain() {
        let muted = Arc::new(AtomicBool::new(false));
        let samples = || {
            rodio::buffer::SamplesBuffer::new(
                ChannelCount::new(1).unwrap(),
                SampleRate::new(48000).unwrap(),
                vec![0.25, 0.5, 0.75, 1.0],
            )
        };
        let mut playing = OutputSource {
            source: samples(),
            muted: muted.clone(),
        };
        assert_eq!(playing.next(), Some(0.25));
        muted.store(true, Ordering::Relaxed);
        assert_eq!(playing.next(), Some(0.0));
        let mut new_track = OutputSource {
            source: samples(),
            muted: muted.clone(),
        };
        assert_eq!(new_track.next(), Some(0.0));
        muted.store(false, Ordering::Relaxed);
        assert_eq!(playing.next(), Some(0.75));
        assert_eq!(new_track.next(), Some(0.5));
        muted.store(true, Ordering::Relaxed);
        assert_eq!(playing.next(), Some(0.0));
        assert_eq!(playing.next(), None);
    }
}
