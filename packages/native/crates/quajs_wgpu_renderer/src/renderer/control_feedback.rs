use crate::frame::PreparedNativeFrame;
use crate::input::control::{select_option_rects, NativeUiControlInteractionState};
use crate::render_graph::{
    DrawCommand, DrawCommandParams, PanelDrawParams, UiControlPartsDrawParam,
};

pub(super) fn apply_control_feedback(
    frame: &mut PreparedNativeFrame,
    controls: &NativeUiControlInteractionState,
) -> bool {
    let control_commands = frame
        .graph
        .commands()
        .iter()
        .filter_map(|command| {
            command
                .control
                .as_ref()
                .map(|control| (command.clone(), control.clone()))
        })
        .collect::<Vec<_>>();
    let mut changed = false;
    let mut appended = Vec::new();

    for (command, control) in control_commands {
        let selected_index = controls.selected_index(&command.id, &control);
        let Some(selected) = control.options.get(selected_index) else {
            continue;
        };
        match &control.parts {
            UiControlPartsDrawParam::Range {
                progress_command_id,
                thumb_command_id,
                thumb_halo_command_id,
                value_command_id,
            } => {
                let denominator = control.options.len().saturating_sub(1).max(1) as f64;
                let progress = selected_index as f64 / denominator;
                if let Some(progress_command) = find_command_mut(frame, progress_command_id) {
                    progress_command.bounds.width = (command.bounds.width * progress).max(2.0);
                    changed = true;
                }
                let center_x = command.bounds.x + command.bounds.width * progress;
                if let Some(thumb) = find_command_mut(frame, thumb_command_id) {
                    thumb.bounds.x = center_x - thumb.bounds.width / 2.0;
                    changed = true;
                }
                if let Some(thumb_halo_command_id) = thumb_halo_command_id {
                    if let Some(thumb_halo) = find_command_mut(frame, thumb_halo_command_id) {
                        thumb_halo.bounds.x = center_x - thumb_halo.bounds.width / 2.0;
                        changed = true;
                    }
                }
                changed |= replace_text(frame, value_command_id, &selected.label);
            }
            UiControlPartsDrawParam::Select {
                chevron_command_id,
                value_command_id,
            } => {
                changed |= replace_text(frame, value_command_id, &selected.label);
                let is_open = controls.open_select_command_id() == Some(command.id.as_str());
                changed |= replace_select_chevron(frame, chevron_command_id, is_open);
                if is_open {
                    append_select_menu(frame, &command, &control, selected_index, &mut appended);
                    changed = true;
                }
            }
            UiControlPartsDrawParam::Switch {
                track_command_id,
                thumb_command_id,
                value_command_id,
            } => {
                let active = selected_index > 0;
                if let Some(track) = find_command_mut(frame, track_command_id) {
                    if let DrawCommandParams::Panel(params) = &mut track.params {
                        params.fill_color = if active {
                            "rgba(129,229,255,0.16)"
                        } else {
                            "rgba(255,255,255,0.06)"
                        }
                        .to_string();
                        params.border.color = Some(
                            if active {
                                "rgba(129,229,255,0.48)"
                            } else {
                                "rgba(245,226,190,0.24)"
                            }
                            .to_string(),
                        );
                    }
                    changed = true;
                }
                if let Some(thumb) = find_command_mut(frame, thumb_command_id) {
                    thumb.bounds.x = if active {
                        command.bounds.x + command.bounds.width - thumb.bounds.width - 4.0
                    } else {
                        command.bounds.x + 4.0
                    };
                    if let DrawCommandParams::Panel(params) = &mut thumb.params {
                        params.fill_color = if active {
                            "#81e5ff"
                        } else {
                            "rgba(247,242,234,0.78)"
                        }
                        .to_string();
                    }
                    changed = true;
                }
                changed |= replace_text(frame, value_command_id, &selected.label);
            }
        }
    }

    if !appended.is_empty() {
        frame.graph.extend(appended);
    }
    changed
}

fn append_select_menu(
    frame: &PreparedNativeFrame,
    command: &DrawCommand,
    control: &crate::render_graph::UiControlDrawParam,
    selected_index: usize,
    output: &mut Vec<DrawCommand>,
) {
    let Some(value_command_id) = (match &control.parts {
        UiControlPartsDrawParam::Select {
            value_command_id, ..
        } => Some(value_command_id),
        _ => None,
    }) else {
        return;
    };
    let value_command = frame
        .graph
        .commands()
        .iter()
        .find(|candidate| candidate.id == *value_command_id);

    for (index, bounds) in select_option_rects(&frame.graph, command, control) {
        let Some(option) = control.options.get(index) else {
            continue;
        };
        let mut panel = command.clone();
        panel.id = format!("{}::option:{}::panel", command.id, index);
        panel.bounds = bounds;
        panel.z_index = command.z_index.saturating_add(100 + index as i32 * 2);
        panel.interactive = false;
        panel.control = None;
        panel.params = DrawCommandParams::Panel(PanelDrawParams {
            role: "ui-select-option".to_string(),
            corner_radius: 0.0,
            shadow_blur_radius: 0.0,
            fill_color: if index == selected_index {
                "rgba(129,229,255,0.18)"
            } else {
                "rgba(5,7,11,0.96)"
            }
            .to_string(),
            border: crate::render_graph::BorderDrawParams {
                color: Some("rgba(245,226,190,0.22)".to_string()),
                width: 1.0,
            },
            padding: Default::default(),
            intent: None,
        });
        output.push(panel);

        if let Some(template) = value_command {
            let mut text = template.clone();
            text.id = format!("{}::option:{}::text", command.id, index);
            text.bounds = bounds;
            text.z_index = command.z_index.saturating_add(101 + index as i32 * 2);
            text.interactive = false;
            text.control = None;
            if let DrawCommandParams::Text(params) = &mut text.params {
                params.text = option.label.clone();
            }
            output.push(text);
        }
    }
}

fn find_command_mut<'a>(
    frame: &'a mut PreparedNativeFrame,
    command_id: &str,
) -> Option<&'a mut DrawCommand> {
    frame
        .graph
        .commands_mut()
        .iter_mut()
        .find(|command| command.id == command_id)
}

fn replace_text(frame: &mut PreparedNativeFrame, command_id: &str, text: &str) -> bool {
    let Some(command) = find_command_mut(frame, command_id) else {
        return false;
    };
    let DrawCommandParams::Text(params) = &mut command.params else {
        return false;
    };
    params.text = text.to_string();
    true
}

fn replace_select_chevron(
    frame: &mut PreparedNativeFrame,
    command_id: &str,
    open: bool,
) -> bool {
    let Some(command) = find_command_mut(frame, command_id) else {
        return false;
    };
    match &mut command.params {
        DrawCommandParams::Panel(params) => {
            params.role = if open {
                "ui-select-chevron-up"
            } else {
                "ui-select-chevron-down"
            }
            .to_string();
            true
        }
        DrawCommandParams::Text(params) => {
            params.text = if open { "^" } else { "v" }.to_string();
            true
        }
        _ => false,
    }
}
