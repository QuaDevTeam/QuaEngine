use std::collections::BTreeMap;

use crate::render_graph::{
    DrawCommand, LogicalRect, RenderGraph, UiControlDrawParam, UiControlPartsDrawParam,
};

use super::{
    NativePointerEventPhase, NativePointerEventResolution, PointerIntentResolution,
    RendererIntentHit,
};

pub(crate) const SELECT_OPTION_HEIGHT: f64 = 42.0;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct NativeUiControlInteractionState {
    active_ranges: BTreeMap<u64, ActiveRangeInteraction>,
    local_selected_indices: BTreeMap<String, usize>,
    open_select_command_id: Option<String>,
    projected_selected_indices: BTreeMap<String, usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ActiveRangeInteraction {
    command_id: String,
    selected_index: usize,
}

impl NativeUiControlInteractionState {
    pub(crate) fn clear(&mut self) {
        self.active_ranges.clear();
        self.local_selected_indices.clear();
        self.open_select_command_id = None;
        self.projected_selected_indices.clear();
    }

    pub(crate) fn has_feedback(&self) -> bool {
        !self.active_ranges.is_empty()
            || !self.local_selected_indices.is_empty()
            || self.open_select_command_id.is_some()
    }

    pub(crate) fn open_select_command_id(&self) -> Option<&str> {
        self.open_select_command_id.as_deref()
    }

    pub(crate) fn selected_index(&self, command_id: &str, control: &UiControlDrawParam) -> usize {
        self.local_selected_indices
            .get(command_id)
            .copied()
            .unwrap_or(control.selected_index)
            .min(control.options.len().saturating_sub(1))
    }

    pub(crate) fn reconcile(&mut self, graph: &RenderGraph) {
        let projected = graph
            .commands()
            .iter()
            .filter_map(|command| {
                command
                    .control
                    .as_ref()
                    .map(|control| (command.id.clone(), control.selected_index))
            })
            .collect::<BTreeMap<_, _>>();

        self.local_selected_indices
            .retain(|command_id, local_index| {
                let Some(projected_index) = projected.get(command_id) else {
                    return false;
                };
                let changed = self
                    .projected_selected_indices
                    .get(command_id)
                    .is_some_and(|previous| previous != projected_index);
                !changed || local_index == projected_index
            });
        self.active_ranges
            .retain(|_, active| projected.contains_key(&active.command_id));
        if self
            .open_select_command_id
            .as_ref()
            .is_some_and(|command_id| !projected.contains_key(command_id))
        {
            self.open_select_command_id = None;
        }
        self.projected_selected_indices = projected;
    }

    pub(crate) fn resolve_pointer(
        &mut self,
        graph: &RenderGraph,
        mut pointer: PointerIntentResolution,
    ) -> PointerIntentResolution {
        let Some(command_id) = self.open_select_command_id.clone() else {
            return pointer;
        };
        let Some(command) = control_command(graph, &command_id) else {
            self.open_select_command_id = None;
            return pointer;
        };
        let Some(control) = command.control.as_ref() else {
            self.open_select_command_id = None;
            return pointer;
        };
        if !matches!(control.parts, UiControlPartsDrawParam::Select { .. }) {
            self.open_select_command_id = None;
            return pointer;
        }

        pointer.intent = select_option_rects(graph, command, control)
            .into_iter()
            .find(|(_, bounds)| rect_contains(*bounds, pointer.point.x, pointer.point.y))
            .and_then(|(index, _)| {
                control.options.get(index).map(|option| RendererIntentHit {
                    command_id: select_option_command_id(&command.id, index),
                    intent: option.intent.clone(),
                })
            })
            .or_else(|| {
                if rect_contains(command.bounds, pointer.point.x, pointer.point.y) {
                    control.selected_option().map(|option| RendererIntentHit {
                        command_id: command.id.clone(),
                        intent: option.intent.clone(),
                    })
                } else {
                    None
                }
            });
        pointer
    }

    pub(crate) fn apply_event(
        &mut self,
        graph: &RenderGraph,
        resolution: &mut NativePointerEventResolution,
    ) {
        let previous = self.clone();
        let event = resolution.event;

        if let Some(active) = self.active_ranges.get_mut(&event.pointer_id) {
            if let Some(command) = control_command(graph, &active.command_id) {
                if let Some(control) = command.control.as_ref() {
                    active.selected_index =
                        range_index_at(command, control, resolution.pointer.point.x);
                    self.local_selected_indices
                        .insert(command.id.clone(), active.selected_index);
                    resolution.intent_to_dispatch = match event.phase {
                        NativePointerEventPhase::Release => control
                            .options
                            .get(active.selected_index)
                            .map(|option| RendererIntentHit {
                                command_id: command.id.clone(),
                                intent: option.intent.clone(),
                            }),
                        _ => None,
                    };
                }
            }
            if matches!(
                event.phase,
                NativePointerEventPhase::Release | NativePointerEventPhase::Cancel
            ) {
                self.active_ranges.remove(&event.pointer_id);
            }
            resolution.visual_state_changed |= *self != previous;
            return;
        }

        let hit_command_id = resolution
            .pointer
            .intent
            .as_ref()
            .map(|hit| hit.command_id.as_str());

        if event.phase == NativePointerEventPhase::Press {
            if let Some(command) = hit_command_id.and_then(|id| control_command(graph, id)) {
                if let Some(control) = command.control.as_ref() {
                    if matches!(control.parts, UiControlPartsDrawParam::Range { .. }) {
                        let selected_index =
                            range_index_at(command, control, resolution.pointer.point.x);
                        self.local_selected_indices
                            .insert(command.id.clone(), selected_index);
                        self.active_ranges.insert(
                            event.pointer_id,
                            ActiveRangeInteraction {
                                command_id: command.id.clone(),
                                selected_index,
                            },
                        );
                        resolution.intent_to_dispatch = None;
                    }
                }
            }
        }

        if event.phase == NativePointerEventPhase::Release {
            if let Some((command_id, option_index)) =
                hit_command_id.and_then(parse_select_option_command_id)
            {
                self.local_selected_indices
                    .insert(command_id.to_string(), option_index);
                self.open_select_command_id = None;
            } else if let Some(command) = hit_command_id.and_then(|id| control_command(graph, id)) {
                if let Some(control) = command.control.as_ref() {
                    match control.parts {
                        UiControlPartsDrawParam::Select { .. } => {
                            self.open_select_command_id = if self.open_select_command_id.as_deref()
                                == Some(command.id.as_str())
                            {
                                None
                            } else {
                                Some(command.id.clone())
                            };
                            resolution.intent_to_dispatch = None;
                        }
                        UiControlPartsDrawParam::Switch { .. } => {
                            let current = self.selected_index(&command.id, control);
                            let selected_index = (current + 1) % control.options.len();
                            self.local_selected_indices
                                .insert(command.id.clone(), selected_index);
                            resolution.intent_to_dispatch = control
                                .options
                                .get(selected_index)
                                .map(|option| RendererIntentHit {
                                    command_id: command.id.clone(),
                                    intent: option.intent.clone(),
                                });
                        }
                        UiControlPartsDrawParam::Range { .. } => {}
                    }
                }
            } else if self.open_select_command_id.is_some() {
                self.open_select_command_id = None;
                resolution.intent_to_dispatch = None;
            }
        }

        if event.phase == NativePointerEventPhase::Cancel {
            self.active_ranges.remove(&event.pointer_id);
        }
        resolution.visual_state_changed |= *self != previous;
    }
}

pub(crate) fn control_command<'a>(
    graph: &'a RenderGraph,
    command_id: &str,
) -> Option<&'a DrawCommand> {
    graph
        .commands()
        .iter()
        .find(|command| command.id == command_id && command.control.is_some())
}

pub(crate) fn select_option_rects(
    graph: &RenderGraph,
    command: &DrawCommand,
    control: &UiControlDrawParam,
) -> Vec<(usize, LogicalRect)> {
    let height = SELECT_OPTION_HEIGHT * control.options.len() as f64;
    let y = if command.bounds.y + command.bounds.height + height <= graph.layout.logical_height {
        command.bounds.y + command.bounds.height + 4.0
    } else {
        (command.bounds.y - height - 4.0).max(0.0)
    };
    control
        .options
        .iter()
        .enumerate()
        .map(|(index, _)| {
            (
                index,
                LogicalRect {
                    x: command.bounds.x,
                    y: y + SELECT_OPTION_HEIGHT * index as f64,
                    width: command.bounds.width,
                    height: SELECT_OPTION_HEIGHT,
                },
            )
        })
        .collect()
}

fn range_index_at(command: &DrawCommand, control: &UiControlDrawParam, x: f64) -> usize {
    if control.options.len() <= 1 || command.bounds.width <= 0.0 {
        return 0;
    }
    let progress = ((x - command.bounds.x) / command.bounds.width).clamp(0.0, 1.0);
    (progress * (control.options.len() - 1) as f64).round() as usize
}

fn select_option_command_id(command_id: &str, index: usize) -> String {
    format!("{command_id}::option:{index}")
}

fn parse_select_option_command_id(command_id: &str) -> Option<(&str, usize)> {
    let (command_id, index) = command_id.rsplit_once("::option:")?;
    Some((command_id, index.parse().ok()?))
}

fn rect_contains(rect: LogicalRect, x: f64, y: f64) -> bool {
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}
