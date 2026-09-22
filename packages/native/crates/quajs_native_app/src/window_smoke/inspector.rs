//! Read-only CDP snapshot of the rendered QUI hierarchy and remaining draw commands.
use quajs_wgpu_renderer::render_graph::{DrawCommand, LogicalRect};
use quajs_wgpu_renderer::renderer::{NativeRenderBackend, NativeRenderer};
use quajs_wgpu_renderer::stage_layout::{
    stage_logical_to_client_point, ResolvedStageLayout, StageClientRectOrigin, StageLogicalPoint,
};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Default)]
pub(super) struct InspectorSnapshot {
    pub(super) root: Value,
    details: HashMap<i64, (Value, Value)>,
    ids: HashMap<String, i64>,
    previous_ids: HashMap<String, i64>,
    next: i64,
}
impl InspectorSnapshot {
    pub(super) fn build<B: NativeRenderBackend, A, V, F>(
        renderer: &NativeRenderer<B, A, V, F>,
        source: &str,
        previous: &Self,
    ) -> Self {
        let mut snapshot = Self {
            next: previous.next.max(3),
            previous_ids: previous.ids.clone(),
            root: json!({"nodeId":1,"nodeName":"#document","nodeType":9,"children":[]}),
            ..Self::default()
        };
        let Some(frame) = renderer.state().frame() else {
            return snapshot;
        };
        let commands = frame.graph.commands();
        let by_id: HashMap<&str, &DrawCommand> = commands
            .iter()
            .map(|command| (command.id.as_str(), command))
            .collect();
        let mut consumed = HashSet::new();
        let mut children = Vec::new();
        if let Ok(source) = serde_json::from_str::<Value>(source) {
            if let Some(overlays) = source
                .pointer("/view/ui/overlays")
                .and_then(Value::as_array)
            {
                for overlay in overlays {
                    let id = overlay
                        .get("elementId")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let root = overlay
                        .pointer("/surface/root")
                        .or_else(|| overlay.pointer("/scene/surface/root"));
                    if let Some(root) = root {
                        children.push(snapshot.ui_node(
                            root,
                            id,
                            0.0,
                            0.0,
                            &frame.graph.layout,
                            &by_id,
                            &mut consumed,
                            0,
                        ));
                    }
                }
            }
        }
        let mut draw_nodes = Vec::new();
        for command in commands.iter().take(10000) {
            if consumed.contains(&command.id) || snapshot.details.len() >= 10000 {
                continue;
            }
            let text = super::control::command_text(command).unwrap_or_default();
            draw_nodes.push(snapshot.node(&command.id, "qua-command", &text, command.bounds, &frame.graph.layout,
                json!({"kind": format!("{:?}", command.kind), "opacity": command.opacity, "z-index": command.z_index, "interactive": command.interactive}), Vec::new()));
        }
        children.push(json!({"nodeId":2,"nodeType":1,"nodeName":"QUA-DRAW-COMMANDS","localName":"qua-draw-commands","children":draw_nodes,"childNodeCount":draw_nodes.len()}));
        snapshot.previous_ids.clear();
        snapshot.root = json!({"nodeId":1,"nodeType":9,"nodeName":"#document","nodeValue":"","children":children,"childNodeCount":children.len()});
        snapshot
    }
    fn ui_node(
        &mut self,
        raw: &Value,
        overlay: &str,
        sx: f64,
        sy: f64,
        layout: &ResolvedStageLayout,
        commands: &HashMap<&str, &DrawCommand>,
        consumed: &mut HashSet<String>,
        depth: usize,
    ) -> Value {
        if depth > 80 || self.details.len() >= 10000 {
            return Value::Null;
        }
        let id = format!("ui:{}:{}", overlay, raw["id"].as_str().unwrap_or_default());
        let rect = &raw["bounds"];
        let mut bounds = LogicalRect {
            x: rect["x"].as_f64().unwrap_or(0.0) - sx,
            y: rect["y"].as_f64().unwrap_or(0.0) - sy,
            width: rect["width"].as_f64().unwrap_or(0.0),
            height: rect["height"].as_f64().unwrap_or(0.0),
        };
        if let Some(command) = commands.get(id.as_str()) {
            bounds = command.bounds;
            consumed.insert(id.clone());
        }
        let mut children = Vec::new();
        if let Some(nodes) = raw["children"].as_array() {
            for child in nodes {
                if self.details.len() >= 10000 {
                    break;
                }
                let child = self.ui_node(
                    child,
                    overlay,
                    sx + raw["scrollOffsetX"].as_f64().unwrap_or(0.0),
                    sy + raw["scrollOffsetY"].as_f64().unwrap_or(0.0),
                    layout,
                    commands,
                    consumed,
                    depth + 1,
                );
                if !child.is_null() {
                    children.push(child);
                }
            }
        }
        self.node(
            &id,
            raw["kind"].as_str().unwrap_or("qua-node"),
            raw["text"].as_str().unwrap_or_default(),
            bounds,
            layout,
            raw["style"].clone(),
            children,
        )
    }
    fn node(
        &mut self,
        id: &str,
        name: &str,
        text: &str,
        rect: LogicalRect,
        layout: &ResolvedStageLayout,
        style: Value,
        children: Vec<Value>,
    ) -> Value {
        let node_id = self.previous_ids.get(id).copied().unwrap_or_else(|| {
            let next = self.next;
            self.next += 1;
            next
        });
        self.ids.insert(id.into(), node_id);
        let top = stage_logical_to_client_point(
            layout,
            StageLogicalPoint {
                x: rect.x,
                y: rect.y,
            },
            StageClientRectOrigin::default(),
        );
        let end = stage_logical_to_client_point(
            layout,
            StageLogicalPoint {
                x: rect.x + rect.width,
                y: rect.y + rect.height,
            },
            StageClientRectOrigin::default(),
        );
        let model = super::control::box_model_json(
            top.client_x,
            top.client_y,
            end.client_x - top.client_x,
            end.client_y - top.client_y,
        );
        let styles: Vec<Value> = style.as_object().map(|map| map.iter().take(500).map(|(key,value)| json!({"name":key,"value":value.as_str().map(str::to_string).unwrap_or_else(||value.to_string())})).collect()).unwrap_or_default();
        self.details.insert(node_id, (model, json!(styles)));
        json!({"nodeId":node_id,"backendNodeId":node_id,"nodeType":1,"nodeName":name.to_uppercase(),"localName":name,"nodeValue":text.chars().take(2048).collect::<String>(),"attributes":["id",id],"childNodeCount":children.len(),"children":children})
    }
    pub(super) fn query(&self, selector: &str) -> i64 {
        let id = selector
            .strip_prefix('#')
            .or_else(|| {
                selector
                    .strip_prefix("[id=\"")
                    .and_then(|v| v.strip_suffix("\"]"))
            })
            .unwrap_or_default();
        self.ids.get(id).copied().unwrap_or(0)
    }
    pub(super) fn details(&self, id: i64, method: &str) -> Result<Value, String> {
        let Some((model, style)) = self.details.get(&id) else {
            return Err("Node is no longer available; refresh DOM.getDocument".into());
        };
        Ok(match method {
            "CSS.getComputedStyleForNode" => json!({"computedStyle":style}),
            "DOM.getContentQuads" => json!({"quads":[model["border"]]}),
            _ => json!({"model":model}),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspector_preserves_nested_nodes_and_box_style_identity() {
        let layout =
            quajs_wgpu_renderer::stage_layout::resolve_stage_layout(None, Default::default());
        let raw = json!({"id":"root","kind":"column","bounds":{"x":0,"y":0,"width":500,"height":300},"children":[
          {"id":"label","kind":"text","text":"hello","bounds":{"x":10,"y":20,"width":100,"height":30},"style":{"color":"red"}},
          {"id":"button","kind":"button","bounds":{"x":20,"y":60,"width":200,"height":40},"style":{"opacity":0.5}}
        ]});
        let mut snapshot = InspectorSnapshot {
            next: 3,
            ..Default::default()
        };
        let node = snapshot.ui_node(
            &raw,
            "screen",
            0.0,
            0.0,
            &layout,
            &HashMap::new(),
            &mut HashSet::new(),
            0,
        );
        assert_eq!(node["children"].as_array().unwrap().len(), 2);
        let text_id = node["children"][0]["nodeId"].as_i64().unwrap();
        let button_id = node["children"][1]["nodeId"].as_i64().unwrap();
        assert_ne!(text_id, button_id);
        assert_eq!(snapshot.query("#ui:screen:label"), text_id);
        assert_eq!(
            snapshot
                .details(text_id, "CSS.getComputedStyleForNode")
                .unwrap()["computedStyle"][0]["value"],
            "red"
        );
        assert!(
            snapshot.details(button_id, "DOM.getBoxModel").unwrap()["model"]["border"].is_array()
        );
        assert!(snapshot.details(9999, "DOM.getBoxModel").is_err());
    }
}
