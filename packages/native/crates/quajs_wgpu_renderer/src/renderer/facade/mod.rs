mod audio;
mod core;
mod types;
mod video;

use super::state::NativeRendererState;

pub use types::{
    NativeRendererFrameError, NativeRendererFrameResult, NativeRendererMediaBackendError,
    NativeRendererPointerEventDispatch,
};

#[derive(Clone, Debug)]
pub struct NativeRenderer<B, A = (), V = ()> {
    state: NativeRendererState,
    backend: B,
    audio_backend: Option<A>,
    video_backend: Option<V>,
}

#[cfg(test)]
mod tests;
