use super::*;
use winit::event::TouchPhase;

// Keep the touchscreen independent of the mouse cursor on hybrid machines.
const TOUCH_POINTER_ID: u64 = u64::MAX;
const TAP_SLOP_POINTS: f64 = 8.0;

#[derive(Clone, Copy, Debug)]
pub(super) struct TouchContact {
    id: u64,
    start: StageClientPoint,
    last: StageClientPoint,
    stage_tap: bool,
    scrolling: bool,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct TouchScroll {
    pub(crate) anchor: StageClientPoint,
    pub(crate) dx: f64,
    pub(crate) dy: f64,
}

impl NativeProductInputController {
    pub(crate) fn cancel_touch<B: NativeRenderBackend, A, V, F>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
    ) -> bool {
        self.touch.take().is_some() && renderer.cancel_pointer_interaction(TOUCH_POINTER_ID)
    }

    pub(crate) fn dispatch_touch<B: NativeRenderBackend, A, V, F, H: NativeHostApi>(
        &mut self,
        renderer: &mut NativeRenderer<B, A, V, F>,
        host: &mut H,
        id: u64,
        phase: TouchPhase,
        point: StageClientPoint,
    ) -> Result<Option<TouchScroll>, NativeProductInputError> {
        let event = |phase| {
            NativePointerEvent::new(phase, point, Default::default())
                .with_pointer_id(TOUCH_POINTER_ID)
                .with_button(NativePointerButton::Primary)
        };
        if phase == TouchPhase::Started {
            if self.touch.is_none() {
                let press = renderer.pointer_event(event(NativePointerEventPhase::Press));
                let stage_tap = press.is_some_and(|r| {
                    r.pointer.point.inside_stage
                        && r.pointer.point.inside_viewport
                        && r.pointer.intent.is_none()
                });
                self.touch = Some(TouchContact {
                    id,
                    start: point,
                    last: point,
                    stage_tap,
                    scrolling: false,
                });
            }
            return Ok(None);
        }
        let Some(contact) = self.touch.as_mut().filter(|c| c.id == id) else {
            return Ok(None);
        };
        if phase == TouchPhase::Cancelled {
            self.cancel_touch(renderer);
            return Ok(None);
        }

        let distance = (point.client_x - contact.start.client_x)
            .hypot(point.client_y - contact.start.client_y);
        if !contact.scrolling
            && distance > TAP_SLOP_POINTS
            && !renderer
                .state()
                .pointer_interaction()
                .is_dragging_range(TOUCH_POINTER_ID)
        {
            contact.scrolling = true;
            renderer.cancel_pointer_interaction(TOUCH_POINTER_ID);
        }
        if contact.scrolling {
            let delta = TouchScroll {
                anchor: contact.start,
                dx: contact.last.client_x - point.client_x,
                dy: contact.last.client_y - point.client_y,
            };
            contact.last = point;
            if phase == TouchPhase::Ended {
                self.touch = None;
            }
            return Ok(Some(delta));
        }
        if phase == TouchPhase::Moved {
            renderer.pointer_event(event(NativePointerEventPhase::Move));
            return Ok(None);
        }
        let stage_tap = contact.stage_tap;
        self.touch = None;
        let release = renderer
            .pointer_event_and_emit_intent(event(NativePointerEventPhase::Release), host)
            .map_err(NativeProductInputError::from_host_error)?;
        if stage_tap
            && release.is_some_and(|r| {
                let p = r.resolution.pointer;
                p.point.inside_viewport && p.point.inside_stage && p.intent.is_none()
            })
        {
            let mut payload = build_pointer_advance_payload();
            payload["source"] = json!("touch:primary");
            emit_native_renderer_intent(host, "user/input_command", Some(payload))?;
        }
        renderer.cancel_pointer_interaction(TOUCH_POINTER_ID);
        Ok(None)
    }
}
