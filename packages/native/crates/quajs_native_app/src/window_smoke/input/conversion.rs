use quajs_wgpu_renderer::input::{NativePointerButton, NativePointerEventPhase};
use quajs_wgpu_renderer::stage_layout::StageClientPoint;
use winit::dpi::PhysicalPosition;
use winit::event::{ElementState, MouseButton};

use super::super::frame::normalized_scale_factor;

pub(in crate::window_smoke) fn pointer_phase_from_element_state(
    state: ElementState,
) -> NativePointerEventPhase {
    match state {
        ElementState::Pressed => NativePointerEventPhase::Press,
        ElementState::Released => NativePointerEventPhase::Release,
    }
}

pub(in crate::window_smoke) fn pointer_button_from_winit(
    button: MouseButton,
) -> NativePointerButton {
    match button {
        MouseButton::Left => NativePointerButton::Primary,
        MouseButton::Right => NativePointerButton::Secondary,
        MouseButton::Middle => NativePointerButton::Auxiliary,
        MouseButton::Back => NativePointerButton::Other(4),
        MouseButton::Forward => NativePointerButton::Other(5),
        MouseButton::Other(value) => NativePointerButton::Other(value),
    }
}

pub(super) fn logical_client_point_from_physical(
    position: PhysicalPosition<f64>,
    scale_factor: f64,
) -> StageClientPoint {
    let scale_factor = normalized_scale_factor(scale_factor);
    StageClientPoint {
        client_x: position.x / scale_factor,
        client_y: position.y / scale_factor,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_winit_physical_cursor_position_to_logical_client_point() {
        let point = logical_client_point_from_physical(PhysicalPosition::new(300.0, 180.0), 2.0);

        assert_eq!(point.client_x, 150.0);
        assert_eq!(point.client_y, 90.0);
    }

    #[test]
    fn maps_winit_pointer_phase_and_buttons() {
        assert_eq!(
            pointer_phase_from_element_state(ElementState::Pressed),
            NativePointerEventPhase::Press
        );
        assert_eq!(
            pointer_phase_from_element_state(ElementState::Released),
            NativePointerEventPhase::Release
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Left),
            NativePointerButton::Primary
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Right),
            NativePointerButton::Secondary
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Middle),
            NativePointerButton::Auxiliary
        );
        assert_eq!(
            pointer_button_from_winit(MouseButton::Other(9)),
            NativePointerButton::Other(9)
        );
    }
}
