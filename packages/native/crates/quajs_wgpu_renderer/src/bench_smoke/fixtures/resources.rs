use crate::renderer::NativeRendererState;
use crate::resources::{NativeResourceKind, NativeResourceLedger, NativeResourceRecord};

pub(in crate::bench_smoke) fn memory_ledger(count: usize) -> NativeResourceLedger {
    let mut ledger = NativeResourceLedger::new();

    for index in 0..count {
        let kind = match index % 4 {
            0 => NativeResourceKind::Texture,
            1 => NativeResourceKind::UiAst,
            2 => NativeResourceKind::QssStyle,
            _ => NativeResourceKind::AudioBuffer,
        };
        let owner = match index % 3 {
            0 => "base",
            1 => "runtime.ui",
            _ => "runtime.audio",
        };
        ledger.insert(
            NativeResourceRecord::new(format!("resource:{index}"), kind)
                .owned_by(owner)
                .require_package("base")
                .memory(256 + index as u64, 512 + (index % 16) as u64 * 64),
        );
    }

    ledger
}

pub(in crate::bench_smoke) fn replacement_pressure_state(count: usize) -> NativeRendererState {
    let mut state = NativeRendererState::new();

    for index in 0..count {
        let kind = match index % 4 {
            0 => NativeResourceKind::Texture,
            1 => NativeResourceKind::Buffer,
            2 => NativeResourceKind::QssStyle,
            _ => NativeResourceKind::TokenTable,
        };
        let gpu_bytes = if matches!(
            kind,
            NativeResourceKind::Texture | NativeResourceKind::Buffer
        ) {
            1024 + (index as u64 % 16) * 128
        } else {
            0
        };

        state.resources_mut().insert(
            NativeResourceRecord::new(format!("surface:bench/replacement-{index}.qui"), kind)
                .owned_by("runtime.stale")
                .require_package("base")
                .memory(256 + (index as u64 % 64), gpu_bytes)
                .label(format!("stale replacement fixture {index}")),
        );
    }

    state
}

pub(in crate::bench_smoke) fn package_release_state(count: usize) -> NativeRendererState {
    let mut state = NativeRendererState::new();

    for index in 0..count {
        let kind = match index % 4 {
            0 => NativeResourceKind::Texture,
            1 => NativeResourceKind::UiAst,
            2 => NativeResourceKind::QssStyle,
            _ => NativeResourceKind::DecodedImage,
        };
        let memory_cpu = 128 + (index as u64 % 64);
        let memory_gpu = if matches!(
            kind,
            NativeResourceKind::Texture | NativeResourceKind::DecodedImage
        ) {
            512 + (index as u64 % 32) * 16
        } else {
            0
        };
        let mut record = NativeResourceRecord::new(format!("package-release:{index}"), kind)
            .memory(memory_cpu, memory_gpu);

        match index % 4 {
            0 | 1 => {
                record = record.owned_by("runtime.clean");
            }
            2 => {
                record = record
                    .owned_by("runtime.blocked")
                    .require_packages(["base", "runtime.blocked"]);
            }
            _ => {
                record = record
                    .owned_by("runtime.foreign")
                    .require_package("runtime.blocked");
            }
        }

        state.resources_mut().insert(record);
    }

    state
}
