use super::*;
use crate::render_graph::{DrawCommandParams, MediaFit};
use crate::renderer::NullNativeRenderBackend;
use crate::resources::{NativeResourceKind, PackageUnloadBlockerReason};

#[test]
fn prepares_shared_compiled_qui_qss_surface_fixture() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let result = renderer
        .prepare_and_render_json_str(SHARED_QUI_QSS_SURFACE_FRAME)
        .expect("shared compiled QUI/QSS fixture should render");

    assert_eq!(result.update.revision, 1);
    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.missing_resource_count, 0);
    assert_eq!(renderer.resources().len(), 5);
    let panel_resource = renderer
        .resources()
        .get("images:ui/panel.png")
        .expect("panel image resource recorded");
    assert_eq!(
        panel_resource.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(panel_resource.required_package_ids.contains("base"));
    let poster_resource = renderer
        .resources()
        .get("images:ui/poster.png")
        .expect("poster image resource recorded");
    assert_eq!(
        poster_resource.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(poster_resource
        .required_package_ids
        .contains("runtime.fonts"));
    let surface_resource = renderer
        .resources()
        .get("surface:ui/compiled-menu.qui")
        .expect("surface resource recorded");
    assert_eq!(
        surface_resource.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(surface_resource.required_package_ids.contains("base"));
    assert!(renderer.resources().get("fonts:Qua Sans").is_some());
    assert!(renderer.resources().get("fonts:Fallback Serif").is_some());

    let metrics = renderer.metrics();
    assert_eq!(metrics.resources.ledger_resource_count, 5);
    assert_eq!(metrics.resources.declarative_resource_count, 1);
    assert_eq!(metrics.resources.declarative_package_count, 2);
    assert!(metrics.resources.declarative_memory.cpu_bytes > 0);
    assert_eq!(metrics.resources.declarative_memory.gpu_bytes, 0);
    assert_eq!(
        metrics.resources.by_kind[&NativeResourceKind::UiAst].count,
        1
    );
    assert_eq!(
        metrics.resources.declarative_by_package["runtime.ui"].owned_count,
        1
    );
    assert_eq!(
        metrics.resources.declarative_by_package["base"].dependent_count,
        1
    );
    assert!(!metrics
        .resources
        .declarative_by_package
        .contains_key("runtime.fonts"));

    let frame = renderer.state().frame().expect("frame prepared");
    let command_ids = frame
        .graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();
    assert!(command_ids.contains(&"ui:compiled-menu:menu:background-image"));
    assert!(command_ids.contains(&"ui:compiled-menu:title"));
    assert!(command_ids.contains(&"ui:compiled-menu:poster"));
    assert!(command_ids.contains(&"ui:compiled-menu:open-settings"));

    let panel_background = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:menu:background-image")
        .expect("panel background image command exists");
    match &panel_background.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "ui/panel.png");
            assert_eq!(params.fit, MediaFit::Contain);
            assert_eq!(params.origin.x, 1.0);
            assert_eq!(params.origin.y, 0.0);
        }
        _ => panic!("expected panel background image params"),
    }
    assert_eq!(
        panel_background.owner_package_id.as_deref(),
        Some("runtime.ui")
    );
    assert!(panel_background.required_package_ids.contains("base"));
    assert!(panel_background
        .required_package_ids
        .contains("runtime.fonts"));

    let panel = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:menu")
        .expect("compiled panel command exists");
    match &panel.params {
        DrawCommandParams::Panel(params) => {
            assert_eq!(params.padding.top, 18.0);
            assert_eq!(params.padding.right, 22.0);
            assert_eq!(params.padding.bottom, 18.0);
            assert_eq!(params.padding.left, 22.0);
        }
        _ => panic!("expected compiled panel params"),
    }

    let title = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:title")
        .expect("compiled title command exists");
    match &title.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.padding.top, 2.0);
            assert_eq!(params.padding.right, 4.0);
            assert_eq!(params.padding.bottom, 6.0);
            assert_eq!(params.padding.left, 4.0);
        }
        _ => panic!("expected compiled title params"),
    }

    let poster = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:poster")
        .expect("poster command exists");
    match &poster.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "ui/poster.png");
            assert_eq!(params.fit, MediaFit::Cover);
        }
        _ => panic!("expected poster image params"),
    }
    assert_eq!(poster.owner_package_id.as_deref(), Some("runtime.ui"));
    assert!(poster.required_package_ids.contains("base"));
    assert!(poster.required_package_ids.contains("runtime.fonts"));

    let settings = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:compiled-menu:open-settings")
        .expect("settings button command exists");
    match &settings.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.padding.top, 8.0);
            assert_eq!(params.padding.right, 14.0);
            assert_eq!(params.padding.bottom, 10.0);
            assert_eq!(params.padding.left, 16.0);
        }
        _ => panic!("expected settings button params"),
    }

    let hit = renderer
        .hit_intent(408.0, 354.0)
        .expect("settings button hit");
    assert_eq!(hit.command_id, "ui:compiled-menu:open-settings");
    assert_eq!(hit.intent.event, "ui/intent");
    assert_eq!(hit.intent.action.as_deref(), Some("open"));
    assert_eq!(
        hit.intent.metadata.get("arg0"),
        Some(&serde_json::json!("settings"))
    );

    let plan = renderer.plan_package_unload("base");
    assert!(!plan.can_unload());
    assert!(plan.blocked.iter().any(|blocker| {
        blocker.reason == PackageUnloadBlockerReason::PackageRequiredByForeignResource
            && blocker.required_package_ids.contains("base")
            && blocker.owner_package_id.as_deref() == Some("runtime.ui")
    }));

    let release = renderer.release_package_resources("base");
    assert!(!release.plan.can_unload());
    assert!(release.released_resources.is_empty());
    assert!(release.host_cleanup.is_empty());
    assert_eq!(release.summary.declarative_released_count, 0);
    assert!(release.summary.declarative_blocked_count >= 1);
    assert!(release.summary.declarative_blocked_memory.cpu_bytes > 0);
    assert_eq!(release.summary.declarative_blocked_memory.gpu_bytes, 0);
    assert_eq!(
        release.summary.blocked_by_kind[&NativeResourceKind::UiAst],
        1
    );
    assert!(
        release.summary.blocked_by_reason
            [&PackageUnloadBlockerReason::PackageRequiredByForeignResource]
            >= 1
    );
    assert!(renderer
        .resources()
        .get("surface:ui/compiled-menu.qui")
        .is_some());
}

#[test]
fn accepts_compiled_choice_loop_surface_json() {
    let mut renderer = NativeRenderer::new(NullNativeRenderBackend::new());

    let result = renderer
        .prepare_and_render_json_str(json_frame_with_compiled_choice_loop_input())
        .expect("compiled choice loop JSON should render");

    assert_eq!(result.update.revision, 1);
    assert_eq!(result.submission.revision, 1);
    assert_eq!(result.submission.missing_resource_count, 0);

    let frame = renderer.state().frame().expect("frame prepared");
    let command_ids = frame
        .graph
        .commands()
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();
    assert!(command_ids.contains(&"ui:choice-menu:choice-button:stay"));
    assert!(command_ids.contains(&"ui:choice-menu:choice-button:leave"));

    let stay = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:choice-menu:choice-button:stay")
        .expect("stay choice button exists");
    match &stay.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Stay");
            assert_eq!(
                params
                    .intent
                    .as_ref()
                    .and_then(|intent| intent.choice_id.as_deref()),
                Some("stay")
            );
        }
        _ => panic!("expected stay choice button params"),
    }

    let leave = frame
        .graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:choice-menu:choice-button:leave")
        .expect("leave choice button exists");
    match &leave.params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Leave");
            assert_eq!(
                params
                    .intent
                    .as_ref()
                    .and_then(|intent| intent.choice_id.as_deref()),
                Some("leave")
            );
        }
        _ => panic!("expected leave choice button params"),
    }

    let hit = renderer
        .hit_intent(600.0, 612.0)
        .expect("stay choice button hit");
    assert_eq!(hit.command_id, "ui:choice-menu:choice-button:stay");
    assert_eq!(hit.intent.event, "choice/select");
    assert_eq!(hit.intent.choice_id.as_deref(), Some("stay"));
    assert_eq!(hit.intent.action.as_deref(), Some("select"));
    assert_eq!(
        hit.intent.element_id.as_deref(),
        Some("choice-menu:choice-button:stay")
    );
    assert_eq!(
        hit.intent.metadata.get("arg0"),
        Some(&serde_json::json!("stay"))
    );
    assert_eq!(
        hit.intent.metadata.get("choiceId"),
        Some(&serde_json::json!("forged-choice"))
    );
    assert_eq!(
        hit.intent.metadata.get("action"),
        Some(&serde_json::json!("forged-action"))
    );
    assert_eq!(
        hit.intent.metadata.get("elementId"),
        Some(&serde_json::json!("forged-element"))
    );
}
