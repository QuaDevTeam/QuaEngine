use super::*;

#[test]
fn reports_resource_memory_and_package_counts() {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new("images:bg.png", NativeResourceKind::Texture)
            .owned_by("base")
            .memory(128, 4096),
    );
    resources.insert(
        NativeResourceRecord::new("ui:surface", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .require_package("base")
            .memory(2048, 0),
    );

    let metrics = NativeRendererMetrics::from_state(2, None, &resources);

    assert_eq!(metrics.resources.ledger_resource_count, 2);
    assert_eq!(metrics.resources.declarative_resource_count, 1);
    assert_eq!(metrics.resources.package_count, 2);
    assert_eq!(metrics.resources.declarative_package_count, 2);
    assert_eq!(metrics.resources.kind_count, 2);
    assert_eq!(metrics.resources.memory.cpu_bytes, 2176);
    assert_eq!(metrics.resources.memory.gpu_bytes, 4096);
    assert_eq!(metrics.resources.declarative_memory.cpu_bytes, 2048);
    assert_eq!(metrics.resources.declarative_memory.gpu_bytes, 0);
    assert_eq!(metrics.resources.pressure.total_count, 2);
    assert_eq!(
        metrics.resources.pressure.largest_kind,
        Some(NativeResourceKind::Texture)
    );
    assert_eq!(
        metrics.resources.pressure.largest_owner_package_id,
        Some("base".to_string())
    );
    assert_eq!(
        metrics.resources.pressure.largest_dependent_package_id,
        Some("base".to_string())
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::Texture].count,
        1
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::Texture]
            .memory
            .gpu_bytes,
        4096
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::UiAst]
            .memory
            .cpu_bytes,
        2048
    );
    assert_eq!(metrics.resources.by_package["base"].owned_count, 1);
    assert_eq!(metrics.resources.by_package["base"].dependent_count, 1);
    assert_eq!(
        metrics.resources.by_package["base"].owned_memory.gpu_bytes,
        4096
    );
    assert_eq!(
        metrics.resources.by_package["base"]
            .dependent_memory
            .cpu_bytes,
        2048
    );
    assert_eq!(metrics.resources.by_package["runtime.ui"].owned_count, 1);
    assert_eq!(
        metrics.resources.by_package["runtime.ui"]
            .owned_memory
            .cpu_bytes,
        2048
    );
    assert_eq!(
        metrics.resources.declarative_by_package["runtime.ui"].owned_count,
        1
    );
    assert_eq!(
        metrics.resources.declarative_by_package["runtime.ui"]
            .owned_memory
            .cpu_bytes,
        2048
    );
    assert_eq!(
        metrics.resources.declarative_by_package["base"].dependent_count,
        1
    );
    assert_eq!(
        metrics.resources.declarative_by_package["base"]
            .dependent_memory
            .cpu_bytes,
        2048
    );
    assert_eq!(metrics.resources.audio.resource_count, 0);
    assert_eq!(metrics.resources.audio.package_count, 0);
}

#[test]
fn reports_declarative_ui_qss_and_token_package_memory() {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new("surface:ui/menu.qui", NativeResourceKind::UiAst)
            .owned_by("runtime.ui")
            .require_package("base")
            .memory(2048, 0),
    );
    resources.insert(
        NativeResourceRecord::new("qss:themes/default.qss", NativeResourceKind::QssStyle)
            .owned_by("runtime.theme")
            .require_package("runtime.ui")
            .memory(1024, 0),
    );
    resources.insert(
        NativeResourceRecord::new("tokens:themes/default.json", NativeResourceKind::TokenTable)
            .owned_by("runtime.theme")
            .require_package("base")
            .require_package("runtime.ui")
            .memory(512, 0),
    );

    let metrics = NativeRendererMetrics::from_state(9, None, &resources);

    assert_eq!(metrics.resources.ledger_resource_count, 3);
    assert_eq!(metrics.resources.declarative_resource_count, 3);
    assert_eq!(metrics.resources.declarative_package_count, 3);
    assert_eq!(metrics.resources.declarative_memory.cpu_bytes, 3584);
    assert_eq!(metrics.resources.declarative_memory.gpu_bytes, 0);
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::UiAst]
            .memory
            .cpu_bytes,
        2048
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::QssStyle]
            .memory
            .cpu_bytes,
        1024
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::TokenTable]
            .memory
            .cpu_bytes,
        512
    );

    let runtime_ui = &metrics.resources.declarative_by_package["runtime.ui"];
    assert_eq!(runtime_ui.owned_count, 1);
    assert_eq!(runtime_ui.dependent_count, 2);
    assert_eq!(runtime_ui.owned_memory.cpu_bytes, 2048);
    assert_eq!(runtime_ui.dependent_memory.cpu_bytes, 1536);

    let runtime_theme = &metrics.resources.declarative_by_package["runtime.theme"];
    assert_eq!(runtime_theme.owned_count, 2);
    assert_eq!(runtime_theme.owned_memory.cpu_bytes, 1536);
    assert_eq!(runtime_theme.dependent_count, 0);

    let base = &metrics.resources.declarative_by_package["base"];
    assert_eq!(base.owned_count, 0);
    assert_eq!(base.dependent_count, 2);
    assert_eq!(base.dependent_memory.cpu_bytes, 2560);
    assert_eq!(metrics.resources.audio.resource_count, 0);
}

#[test]
fn reports_font_face_resource_memory_and_package_counts() {
    let mut resources = NativeResourceLedger::new();
    resources.insert(
        NativeResourceRecord::new("fonts:Qua Sans", NativeResourceKind::FontFace)
            .owned_by("runtime.fonts")
            .require_package("base")
            .memory(4096, 0),
    );

    let metrics = NativeRendererMetrics::from_state(7, None, &resources);

    assert_eq!(metrics.resources.ledger_resource_count, 1);
    assert_eq!(metrics.resources.memory.cpu_bytes, 4096);
    assert_eq!(metrics.resources.memory.gpu_bytes, 0);
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::FontFace].count,
        1
    );
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::FontFace]
            .memory
            .cpu_bytes,
        4096
    );
    assert_eq!(metrics.resources.by_package["runtime.fonts"].owned_count, 1);
    assert_eq!(
        metrics.resources.by_package["runtime.fonts"]
            .owned_memory
            .cpu_bytes,
        4096
    );
    assert_eq!(metrics.resources.by_package["base"].dependent_count, 1);
    assert_eq!(
        metrics.resources.by_package["base"]
            .dependent_memory
            .cpu_bytes,
        4096
    );
    assert_eq!(metrics.resources.audio.resource_count, 0);
}
