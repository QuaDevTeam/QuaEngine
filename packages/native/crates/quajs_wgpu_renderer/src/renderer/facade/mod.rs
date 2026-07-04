mod audio;
mod core;
mod types;

use super::state::NativeRendererState;

pub use types::{
    NativeRendererFrameError, NativeRendererFrameResult, NativeRendererPointerEventDispatch,
};

#[derive(Clone, Debug)]
pub struct NativeRenderer<B, A = ()> {
    state: NativeRendererState,
    backend: B,
    audio_backend: Option<A>,
}

#[cfg(test)]
mod tests;
