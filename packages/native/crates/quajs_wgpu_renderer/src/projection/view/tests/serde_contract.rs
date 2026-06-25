use super::test_layout;
use crate::projection::view::{build_view_render_graph, ViewProjection};
use crate::render_graph::{DrawCommandParams, FontWeightDrawParam, MediaFit};
use crate::resources::ResourceId;

#[test]
fn deserializes_native_view_projection_from_camel_case_json() {
    let view: ViewProjection = serde_json::from_str(
        r##"
        {
          "background": {
            "mode": "image",
            "assetName": "bg/menu.png",
            "provenance": {
              "contentPackageId": "runtime.bg",
              "requiredRuntimePackages": ["base"]
            }
          },
          "characters": [
            {
              "id": "yuki",
              "name": "Yuki",
              "sprite": "yuki/default.png",
              "position": { "xPercent": 50, "width": 420, "height": 900 },
              "provenance": { "contentPackageId": "runtime.character" }
            }
          ],
          "dialogue": {
            "speaker": "Yuki",
            "text": "Native JSON bridge",
            "speakerStyle": { "fontFamily": ["Qua Serif"], "fontWeight": 700 },
            "provenance": { "contentPackageId": "runtime.dialogue" }
          },
          "choices": {
            "choices": [
              { "id": "start", "text": "Start" }
            ]
          },
          "ui": {
            "overlays": [
              {
                "elementId": "menu",
                "surface": {
                  "key": "ui/menu.qui",
                  "root": {
                    "id": "root",
                    "kind": "Box",
                    "bounds": { "x": 32, "y": 24, "width": 480, "height": 280 },
                    "style": {
                      "backgroundColor": "#101820",
                      "borderRadius": 16,
                      "borderColor": "#5ac8fa",
                      "borderWidth": 2
                    },
                    "children": [
                      {
                        "id": "title",
                        "kind": "Text",
                        "bounds": { "x": 64, "y": 52, "width": 320, "height": 48 },
                        "text": "Menu",
                        "style": {
                          "color": "#f7f3e8",
                          "fontFamily": ["Qua Sans", "Fallback Serif"],
                          "fontSize": 34,
                          "fontWeight": "bold",
                          "lineHeight": 44,
                          "textAlign": "center"
                        },
                        "provenance": {
                          "contentPackageId": "runtime.ui",
                          "requiredRuntimePackages": ["runtime.fonts"]
                        }
                      },
                      {
                        "id": "poster",
                        "kind": "Image",
                        "bounds": { "x": 64, "y": 118, "width": 180, "height": 112 },
                        "image": { "assetName": "ui/poster.png" },
                        "style": { "objectFit": "cover" }
                      },
                      {
                        "id": "close",
                        "kind": "Button",
                        "bounds": { "x": 340, "y": 236, "width": 120, "height": 48 },
                        "text": "Close",
                        "intent": {
                          "event": "ui/intent",
                          "action": "close",
                          "metadata": { "source": "json-contract" }
                        }
                      }
                    ]
                  }
                },
                "provenance": { "contentPackageId": "runtime.ui" }
              }
            ]
          }
        }
        "##,
    )
    .expect("view projection JSON should deserialize");

    let graph = build_view_render_graph(test_layout(), &view);
    let title = graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:title")
        .expect("title command");
    let button = graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:close")
        .expect("button command");
    let poster = graph
        .commands()
        .iter()
        .find(|command| command.id == "ui:menu:poster")
        .expect("poster command");

    assert_eq!(graph.commands()[0].id, "background:main");
    assert_eq!(
        graph.commands()[0].resource_ids,
        vec![ResourceId::from("images:bg/menu.png")]
    );
    assert_eq!(title.owner_package_id.as_deref(), Some("runtime.ui"));
    assert!(title.required_package_ids.contains("runtime.fonts"));
    assert_eq!(
        title.resource_ids,
        vec![
            ResourceId::from("fonts:Qua Sans"),
            ResourceId::from("fonts:Fallback Serif")
        ]
    );

    match &title.params {
        DrawCommandParams::Text(params) => {
            assert_eq!(params.text, "Menu");
            assert_eq!(params.color, "#f7f3e8");
            assert_eq!(
                params.font_weight.as_ref(),
                Some(&FontWeightDrawParam::Keyword("bold".to_string()))
            );
        }
        _ => panic!("expected title text params"),
    }
    match &poster.params {
        DrawCommandParams::Image(params) => {
            assert_eq!(params.fit, MediaFit::Cover);
            assert_eq!(params.asset_type, "images");
            assert_eq!(params.asset_name, "ui/poster.png");
        }
        _ => panic!("expected poster image params"),
    }
    match &button.params {
        DrawCommandParams::UiButton(params) => {
            let intent = params.intent.as_ref().expect("button intent");
            assert_eq!(intent.event, "ui/intent");
            assert_eq!(intent.action.as_deref(), Some("close"));
            assert_eq!(intent.element_id.as_deref(), Some("menu:close"));
            assert_eq!(intent.metadata["source"], "json-contract");
        }
        _ => panic!("expected button params"),
    }

    let round_trip = serde_json::to_value(&view).expect("view projection serializes");
    assert_eq!(round_trip["ui"]["overlays"][0]["elementId"], "menu");
    assert_eq!(
        round_trip["ui"]["overlays"][0]["surface"]["root"]["children"][0]["style"]["fontFamily"],
        serde_json::json!(["Qua Sans", "Fallback Serif"])
    );
}
