use super::*;
use crate::resources::NativeResourceKind;

#[test]
fn prepares_frame_and_populates_resource_ledger() {
    let mut state = NativeRendererState::new();
    let update = state.prepare_frame(test_layout(), &view_with_background_and_choice());

    assert_eq!(update.revision, 1);
    assert_eq!(update.resource_sync.upsert.len(), 1);
    assert!(update.resource_sync.retain.is_empty());
    assert!(update.released_resources.is_empty());
    assert_eq!(update.resource_sync_summary.upsert_count, 1);
    assert_eq!(
        update.resource_sync_summary.upsert_by_kind[&NativeResourceKind::Texture],
        1
    );
    assert_eq!(update.resource_sync_summary.release_count, 0);
    assert_eq!(update.resource_sync_summary.released_count, 0);
    assert_eq!(update.resource_sync_summary.replacement_release_count, 0);
    assert_eq!(state.frame().unwrap().summary.command_count, 3);
    assert_eq!(state.resources().len(), 1);
    assert!(state.resources().get("images:bg/school.png").is_some());
}

#[test]
fn unfocused_confirm_targets_the_modal_or_consumes_the_input_when_empty() {
    use crate::renderer::state::{FocusAction, FocusResult};
    let mut renderer = NativeRendererState::new();
    let mut view = view_with_background_and_choice();
    let mut overlay = UiOverlayProjection::new("sheet");
    overlay.interactive = Some(false);
    overlay.surface = Some(
        UiOverlaySurfaceProjection::new("sheet.qui").with_root(
            UiSurfaceNodeProjection::new(
                "accept",
                UiSurfaceNodeKind::Button,
                UiSurfaceNodeRect {
                    x: 5.0,
                    y: 5.0,
                    width: 200.0,
                    height: 65.0,
                },
            )
            .with_text("Accept")
            .with_intent(crate::projection::ui::UiIntentProjection::new("accept")),
        ),
    );
    view.ui = Some(UiProjection {
        hide_hud_chrome: true,
        ..UiProjection::new(vec![overlay])
    });
    renderer.prepare_frame(test_layout(), &view);
    let FocusResult::Intent(hit) = renderer.navigate_focus(FocusAction::Activate) else {
        panic!("expected first modal action");
    };
    assert_eq!(hit.intent.action.as_deref(), Some("accept"));
    view.ui.as_mut().unwrap().overlays[0]
        .surface
        .as_mut()
        .unwrap()
        .root = None;
    renderer.prepare_frame(test_layout(), &view);
    assert!(matches!(
        renderer.navigate_focus(FocusAction::Activate),
        FocusResult::Focused
    ));
    view.ui.as_mut().unwrap().hide_hud_chrome = false;
    renderer.prepare_frame(test_layout(), &view);
    let FocusResult::Intent(hit) = renderer.navigate_focus(FocusAction::Activate) else {
        panic!("expected story choice when only the HUD is present");
    };
    assert_eq!(hit.intent.event, "choice/select");
}
