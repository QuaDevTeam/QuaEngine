use super::*;
use crate::input::{NativePointerButton, NativePointerEvent, NativePointerEventPhase};
use quajs_native_runtime::NativeHostInfoBuilder;

mod controls;
mod events;
mod hit;
mod host_emit;

const SHARED_QUI_QSS_SURFACE_FRAME: &str =
    include_str!("../../../../../../test-fixtures/renderer/qui-qss-surface-frame.json");
const COMPILED_CHOICE_LOOP_FRAME: &str =
    include_str!("../../../../../../test-fixtures/renderer/compiled-choice-loop-frame.json");

fn test_host_info() -> quajs_native_runtime::NativeHostInfo {
    NativeHostInfoBuilder::new("Fixture", "dev.quajs.fixture").build()
}
