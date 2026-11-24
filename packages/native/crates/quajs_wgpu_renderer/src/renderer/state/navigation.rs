use super::NativeRendererState;
use crate::input::{renderer_intent_from_command, RendererIntentHit};
use crate::render_graph::{DrawCommand, DrawCommandParams, RenderGraph, UiControlPartsDrawParam};

#[derive(Clone, Copy, Debug)]
pub enum FocusAction {
    Previous,
    Next,
    Left,
    Right,
    Activate,
}

pub enum FocusResult {
    Unhandled,
    Focused,
    Intent(RendererIntentHit),
}

// Use the clipped, transformed graph that was actually presented. A covered
// button must never be reachable through a controller behind the pointer target.
fn focus_center(graph: &RenderGraph, command: &DrawCommand) -> Option<(f64, f64)> {
    if !command.interactive || command.opacity <= 0.0 {
        return None;
    }
    let bounds = command.bounds;
    if bounds.width >= graph.layout.logical_width && bounds.height >= graph.layout.logical_height {
        return None;
    }
    let (mut x, mut y) = (
        bounds.x + bounds.width * 0.5,
        bounds.y + bounds.height * 0.5,
    );
    for group in command.composite_groups.iter().rev() {
        let [a, b, c, d, tx, ty] = group.transform;
        (x, y) = (a * x + c * y + tx, b * x + d * y + ty);
    }
    if !(0.0..graph.layout.logical_width).contains(&x)
        || !(0.0..graph.layout.logical_height).contains(&y)
    {
        return None;
    }
    graph
        .hit_test(x, y)
        .filter(|hit| hit.id == command.id)
        .map(|_| (x, y))
}

impl NativeRendererState {
    pub fn navigate_focus(&mut self, action: FocusAction) -> FocusResult {
        let Some(frame) = self.frame.as_ref() else {
            return FocusResult::Unhandled;
        };
        let graph = &frame.graph;
        let surface = graph
            .commands()
            .iter()
            .rev()
            .find_map(|cmd| match &cmd.params {
                DrawCommandParams::UiSurface(surface)
                    if surface.surface_key.is_some() || surface.interactive =>
                {
                    Some((cmd, surface))
                }
                _ => None,
            });
        let modal = surface.is_some_and(|(_, s)| s.interactive || graph.hide_hud_chrome);
        let mut targets = graph
            .commands()
            .iter()
            .filter_map(|command| {
                let (x, y) = focus_center(graph, command)?;
                Some((command, x, y, renderer_intent_from_command(command)?))
            })
            .collect::<Vec<_>>();
        if let Some((root, _)) = surface {
            let node_prefix = format!("{}:", root.id);
            targets.retain(|(cmd, _, _, i)| {
                cmd.id.starts_with(&node_prefix) || (!modal && i.event == "choice/select")
            });
        }
        // Narrative choices have the same initial navigation priority as on Web.
        if targets
            .iter()
            .any(|(_, _, _, i)| i.event == "choice/select")
        {
            targets.retain(|(_, _, _, i)| i.event == "choice/select");
        }
        targets.sort_by(|a, b| a.2.total_cmp(&b.2).then(a.1.total_cmp(&b.1)));
        let len = targets.len();
        if len == 0 {
            return if modal {
                FocusResult::Focused
            } else {
                FocusResult::Unhandled
            };
        }
        let focused = self
            .pointer_interaction
            .focused_command_id()
            .and_then(|id| targets.iter().position(|(cmd, _, _, _)| cmd.id == id));
        if let Some((command, _, _, _)) = focused.map(|index| &targets[index]) {
            if let Some(control) = command.control.as_ref() {
                if !matches!(control.parts, UiControlPartsDrawParam::Switch { .. })
                    && matches!(action, FocusAction::Left | FocusAction::Right)
                {
                    return self
                        .pointer_interaction
                        .controls
                        .step_option(&command.id, control, matches!(action, FocusAction::Left))
                        .map_or(FocusResult::Focused, FocusResult::Intent);
                }
            }
        }
        let index = match action {
            FocusAction::Activate => match focused {
                Some(index) => index,
                None if modal || targets[0].3.event == "choice/select" => 0,
                None => return FocusResult::Unhandled,
            },
            FocusAction::Previous | FocusAction::Left => {
                focused.map_or(len - 1, |i| (i + len - 1) % len)
            }
            FocusAction::Next | FocusAction::Right => focused.map_or(0, |i| (i + 1) % len),
        };
        let (command, _, _, intent) = &targets[index];
        self.pointer_interaction.focus_command(&command.id);
        if matches!(action, FocusAction::Activate) {
            if let Some(control) = command.control.as_ref() {
                if matches!(control.parts, UiControlPartsDrawParam::Switch { .. }) {
                    return self
                        .pointer_interaction
                        .controls
                        .step_option(&command.id, control, false)
                        .map_or(FocusResult::Focused, FocusResult::Intent);
                }
                return FocusResult::Focused;
            }
            FocusResult::Intent(RendererIntentHit {
                command_id: command.id.clone(),
                intent: intent.clone(),
            })
        } else {
            FocusResult::Focused
        }
    }
}
