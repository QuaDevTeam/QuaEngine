use crate::frame::PreparedNativeFrame;
use crate::input::NativePointerInteractionState;
use crate::render_graph::{
    plan_render_passes, BorderDrawParams, DrawCommand, DrawCommandParams, PanelDrawParams,
};
use crate::renderer::control_feedback::apply_control_feedback;

pub(super) fn frame_with_interaction_feedback(
    frame: &PreparedNativeFrame,
    interaction: &NativePointerInteractionState,
) -> Option<PreparedNativeFrame> {
    if !interaction.has_visual_feedback() {
        return None;
    }

    let feedback_commands = frame
        .graph
        .commands()
        .iter()
        .filter_map(|command| {
            interaction_feedback_command(
                command,
                interaction,
                frame.graph.layout.logical_width,
                frame.graph.layout.logical_height,
            )
        })
        .collect::<Vec<_>>();
    let mut feedback_frame = frame.clone();
    let control_changed = apply_control_feedback(&mut feedback_frame, &interaction.controls);
    if feedback_commands.is_empty() && !control_changed {
        return None;
    }
    feedback_frame.graph.extend(feedback_commands);
    feedback_frame.summary = feedback_frame.graph.summary();
    feedback_frame.passes = plan_render_passes(&feedback_frame.graph);
    Some(feedback_frame)
}

fn interaction_feedback_command(
    command: &DrawCommand,
    interaction: &NativePointerInteractionState,
    logical_width: f64,
    logical_height: f64,
) -> Option<DrawCommand> {
    if !command.interactive || covers_stage_background(command, logical_width, logical_height) {
        return None;
    }

    let hovered = interaction.hovered_command_id() == Some(command.id.as_str());
    let focused = interaction.focused_command_id() == Some(command.id.as_str());
    let pressed = hovered && interaction.is_pressed(&command.id);
    if !hovered && !focused && !pressed {
        return None;
    }

    let corner_radius = match &command.params {
        DrawCommandParams::UiButton(params) => params.corner_radius,
        DrawCommandParams::Panel(params) => params.corner_radius,
        _ => return None,
    };
    let fill_color = if pressed {
        "rgba(255,255,255,0.14)"
    } else if hovered {
        "rgba(255,255,255,0.07)"
    } else {
        "transparent"
    };
    let border = if focused {
        BorderDrawParams {
            color: Some("rgba(245,226,190,0.78)".to_string()),
            width: 2.0,
        }
    } else {
        BorderDrawParams::default()
    };

    Some(
        DrawCommand::new(
            format!("{}::interaction", command.id),
            command.plane,
            command.kind,
            command.bounds,
        )
        .z_index(command.z_index)
        .opacity(command.opacity)
        .clip_bounds(command.clip_bounds.iter().copied())
        .params(DrawCommandParams::Panel(PanelDrawParams {
            role: if pressed {
                "interaction-pressed"
            } else if hovered && focused {
                "interaction-hover-focus"
            } else if hovered {
                "interaction-hover"
            } else {
                "interaction-focus"
            }
            .to_string(),
            corner_radius,
            fill_color: fill_color.to_string(),
            border,
            padding: Default::default(),
            intent: None,
        })),
    )
}

fn covers_stage_background(command: &DrawCommand, logical_width: f64, logical_height: f64) -> bool {
    command.bounds.width >= logical_width * 0.9 && command.bounds.height >= logical_height * 0.9
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{
        resolve_pointer_event_with_interaction, NativePointerEvent, NativePointerEventPhase,
        PointerIntentResolution, RendererIntentHit,
    };
    use crate::render_graph::{
        DrawCommandKind, FontStyleDrawParam, LogicalRect, RenderGraph, RenderPlane, RendererIntent,
        TextAlign, TextDecorationDrawParam, TextOverflowDrawParam, TextTransformDrawParam,
        UiButtonDrawParams, WhiteSpaceDrawParam,
    };
    use crate::stage_layout::{
        resolve_stage_layout, StageClientPoint, StageClientRectOrigin, StageContainerInput,
        StageHitTestPoint,
    };

    #[test]
    fn appends_hover_and_focus_paint_without_mutating_the_projected_frame() {
        let frame = fixture_frame();
        let mut interaction = NativePointerInteractionState::new();
        resolve_pointer_event_with_interaction(
            &mut interaction,
            NativePointerEvent::new(
                NativePointerEventPhase::Press,
                StageClientPoint::default(),
                StageClientRectOrigin::default(),
            ),
            fixture_pointer(),
        );

        let feedback = frame_with_interaction_feedback(&frame, &interaction).unwrap();

        assert_eq!(frame.graph.commands().len(), 1);
        assert_eq!(feedback.graph.commands().len(), 2);
        let command = feedback
            .graph
            .commands()
            .iter()
            .find(|command| command.id == "button::interaction")
            .unwrap();
        match &command.params {
            DrawCommandParams::Panel(params) => {
                assert_eq!(params.role, "interaction-pressed");
                assert_eq!(params.fill_color, "rgba(255,255,255,0.14)");
                assert_eq!(params.border.width, 2.0);
            }
            params => panic!("unexpected feedback params: {params:?}"),
        }
    }

    #[test]
    fn skips_full_stage_interactive_backdrops() {
        let layout = resolve_stage_layout(None, StageContainerInput::default());
        let mut graph = RenderGraph::new(layout);
        graph.push(
            DrawCommand::new(
                "backdrop",
                RenderPlane::Screen,
                DrawCommandKind::UiSurface,
                LogicalRect {
                    x: 0.0,
                    y: 0.0,
                    width: layout.logical_width,
                    height: layout.logical_height,
                },
            )
            .interactive(true)
            .params(DrawCommandParams::Panel(PanelDrawParams {
                role: "backdrop".to_string(),
                corner_radius: 0.0,
                fill_color: "#000000".to_string(),
                border: Default::default(),
                padding: Default::default(),
                intent: Some(RendererIntent {
                    event: "ui/intent".to_string(),
                    choice_id: None,
                    element_id: Some("backdrop".to_string()),
                    action: Some("close".to_string()),
                    metadata: Default::default(),
                }),
            })),
        );
        let frame = PreparedNativeFrame {
            summary: graph.summary(),
            resources: Default::default(),
            assets: Default::default(),
            passes: plan_render_passes(&graph),
            graph,
        };
        let mut interaction = NativePointerInteractionState::new();
        resolve_pointer_event_with_interaction(
            &mut interaction,
            NativePointerEvent::new(
                NativePointerEventPhase::Press,
                StageClientPoint::default(),
                StageClientRectOrigin::default(),
            ),
            PointerIntentResolution {
                point: StageHitTestPoint {
                    x: 20.0,
                    y: 20.0,
                    inside_viewport: true,
                    inside_stage: true,
                },
                intent: Some(RendererIntentHit {
                    command_id: "backdrop".to_string(),
                    intent: RendererIntent {
                        event: "ui/intent".to_string(),
                        choice_id: None,
                        element_id: Some("backdrop".to_string()),
                        action: Some("close".to_string()),
                        metadata: Default::default(),
                    },
                }),
            },
        );

        assert!(frame_with_interaction_feedback(&frame, &interaction).is_none());
    }

    fn fixture_frame() -> PreparedNativeFrame {
        let layout = resolve_stage_layout(None, StageContainerInput::default());
        let mut graph = RenderGraph::new(layout);
        graph.push(
            DrawCommand::new(
                "button",
                RenderPlane::Screen,
                DrawCommandKind::UiSurface,
                LogicalRect {
                    x: 20.0,
                    y: 20.0,
                    width: 180.0,
                    height: 56.0,
                },
            )
            .interactive(true)
            .params(DrawCommandParams::UiButton(UiButtonDrawParams {
                label: "Continue".to_string(),
                enabled: true,
                role: "button".to_string(),
                background_color: "#202020".to_string(),
                text_color: "#ffffff".to_string(),
                corner_radius: 4.0,
                border: Default::default(),
                font_family: Vec::new(),
                font_size: 20.0,
                font_style: FontStyleDrawParam::Normal,
                font_weight: None,
                letter_spacing: 0.0,
                line_height: 24.0,
                align: TextAlign::Center,
                text_decoration: TextDecorationDrawParam::None,
                text_overflow: TextOverflowDrawParam::Clip,
                text_transform: TextTransformDrawParam::None,
                white_space: WhiteSpaceDrawParam::Normal,
                padding: Default::default(),
                intent: Some(RendererIntent {
                    event: "ui/intent".to_string(),
                    choice_id: None,
                    element_id: Some("button".to_string()),
                    action: Some("continue".to_string()),
                    metadata: Default::default(),
                }),
            })),
        );
        PreparedNativeFrame {
            summary: graph.summary(),
            resources: Default::default(),
            assets: Default::default(),
            passes: plan_render_passes(&graph),
            graph,
        }
    }

    fn fixture_pointer() -> PointerIntentResolution {
        PointerIntentResolution {
            point: StageHitTestPoint {
                x: 40.0,
                y: 40.0,
                inside_viewport: true,
                inside_stage: true,
            },
            intent: Some(RendererIntentHit {
                command_id: "button".to_string(),
                intent: RendererIntent {
                    event: "ui/intent".to_string(),
                    choice_id: None,
                    element_id: Some("button".to_string()),
                    action: Some("continue".to_string()),
                    metadata: Default::default(),
                },
            }),
        }
    }
}
