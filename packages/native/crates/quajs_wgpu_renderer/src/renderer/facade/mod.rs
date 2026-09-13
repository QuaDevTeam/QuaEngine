mod audio;
mod core;
mod font;
mod types;
mod video;

use super::state::NativeRendererState;

pub use types::{
    NativeRendererFrameError, NativeRendererFrameResult, NativeRendererMediaBackendError,
    NativeRendererPointerEventDispatch,
};

#[derive(Clone, Debug)]
pub struct NativeRenderer<B, A = (), V = (), F = ()> {
    state: NativeRendererState,
    backend: B,
    audio_backend: Option<A>,
    video_backend: Option<V>,
    font_backend: Option<F>,
}

#[cfg(test)]
mod tests;
