use std::collections::BTreeSet;

use super::*;
use crate::projection::common::PackageProvenance;
use crate::render_graph::{
    DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane, TextAlign,
};
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn builds_interactive_choice_buttons() {
    let layout = test_layout();
    let choices = ChoiceSetProjection::new(vec![
        ChoiceProjection::new("left", "Go left"),
        ChoiceProjection::new("right", "Go right"),
    ]);

    let commands = build_choice_commands(&layout, &choices);

    assert_eq!(commands.len(), 3);
    assert_eq!(commands[0].id, "choices:panel");
    assert_eq!(commands[0].kind, DrawCommandKind::RoundedRect);
    assert_eq!(commands[1].id, "choice:left");
    assert!(commands[1].interactive);
    assert_eq!(commands[1].plane, RenderPlane::Safe);

    match &commands[1].params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(params.label, "Go left");
            assert!(params.enabled);
            assert_eq!(params.font_size, 30.0);
            assert_eq!(params.line_height, 42.0);
            assert_eq!(params.align, TextAlign::Center);
            assert_eq!(params.intent.as_ref().unwrap().event, "choice/select");
            assert_eq!(
                params.intent.as_ref().unwrap().choice_id.as_deref(),
                Some("left")
            );
        }
        _ => panic!("expected choice button params"),
    }
}

#[test]
fn disables_unavailable_choice_interaction() {
    let layout = test_layout();
    let choices = ChoiceSetProjection::new(vec![ChoiceProjection {
        enabled: false,
        ..ChoiceProjection::new("locked", "Locked")
    }]);

    let commands = build_choice_commands(&layout, &choices);
    let button = &commands[1];

    assert!(!button.interactive);
    assert_eq!(button.opacity, 0.52);
    match &button.params {
        DrawCommandParams::UiButton(params) => {
            assert!(!params.enabled);
            assert!(params.intent.is_none());
        }
        _ => panic!("expected choice button params"),
    }
}

#[test]
fn skips_hidden_or_empty_choices() {
    let layout = test_layout();
    assert!(build_choice_commands(&layout, &ChoiceSetProjection::new(Vec::new())).is_empty());
    assert!(build_choice_commands(
        &layout,
        &ChoiceSetProjection {
            visible: false,
            choices: vec![ChoiceProjection::new("a", "A")],
            provenance: PackageProvenance::default(),
        },
    )
    .is_empty());
}

#[test]
fn skips_choices_with_unsafe_projection_ids_on_direct_projection() {
    let layout = test_layout();
    let choices = ChoiceSetProjection::new(vec![
        ChoiceProjection::new("left", "Go left"),
        ChoiceProjection::new("https://example.test/right", "Url"),
        ChoiceProjection::new("native:right", "Native"),
        ChoiceProjection::new("bad/right", "Path"),
        ChoiceProjection::new("plugin.dll", "Payload"),
        ChoiceProjection::new("right:ok", "Go right"),
    ]);

    let commands = build_choice_commands(&layout, &choices);
    let ids = commands
        .iter()
        .map(|command| command.id.as_str())
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["choices:panel", "choice:left", "choice:right:ok"]);
    match &commands[2].params {
        DrawCommandParams::UiButton(params) => {
            assert_eq!(
                params.intent.as_ref().unwrap().choice_id.as_deref(),
                Some("right:ok")
            );
        }
        _ => panic!("expected choice button params"),
    }
}

#[test]
fn skips_choice_panel_when_all_choice_ids_are_unsafe() {
    let layout = test_layout();
    let choices = ChoiceSetProjection::new(vec![
        ChoiceProjection::new("bad/left", "Go left"),
        ChoiceProjection::new("native:right", "Go right"),
    ]);

    assert!(build_choice_commands(&layout, &choices).is_empty());
}

#[test]
fn appends_choice_commands_and_preserves_package_provenance() {
    let mut graph = RenderGraph::new(test_layout());
    let choices = ChoiceSetProjection {
        provenance: provenance("runtime.choices", ["base"]),
        choices: vec![ChoiceProjection {
            provenance: provenance("runtime.choice-a", ["runtime.choices"]),
            ..ChoiceProjection::new("a", "A")
        }],
        visible: true,
    };

    append_choice_commands(&mut graph, &choices);

    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Safe].command_count,
        2
    );
    assert_eq!(
        graph.commands()[0].owner_package_id.as_deref(),
        Some("runtime.choices")
    );
    assert!(graph.commands()[0].required_package_ids.contains("base"));
    assert_eq!(
        graph.commands()[1].owner_package_id.as_deref(),
        Some("runtime.choice-a")
    );
    assert!(graph.commands()[1]
        .required_package_ids
        .contains("runtime.choices"));
}

#[test]
fn skips_unsafe_package_provenance_on_direct_projection() {
    let mut graph = RenderGraph::new(test_layout());
    let choices = ChoiceSetProjection {
        provenance: provenance("runtime.choices?rev=1", ["base", "runtime/ui"]),
        choices: vec![ChoiceProjection {
            provenance: provenance("runtime.choice-a", ["runtime.choices", "bad#hash"]),
            ..ChoiceProjection::new("a", "A")
        }],
        visible: true,
    };

    append_choice_commands(&mut graph, &choices);

    assert_eq!(graph.commands()[0].owner_package_id, None);
    assert!(graph.commands()[0].required_package_ids.contains("base"));
    assert!(!graph.commands()[0]
        .required_package_ids
        .contains("runtime/ui"));
    assert_eq!(
        graph.commands()[1].owner_package_id.as_deref(),
        Some("runtime.choice-a")
    );
    assert!(graph.commands()[1]
        .required_package_ids
        .contains("runtime.choices"));
    assert!(!graph.commands()[1]
        .required_package_ids
        .contains("bad#hash"));
}

fn test_layout() -> ResolvedStageLayout {
    resolve_stage_layout(
        Some(ViewLayoutInput {
            preset: Some(ViewLayoutOrientation::Landscape),
            ..Default::default()
        }),
        StageContainerInput {
            width: Some(1600.0),
            height: Some(1000.0),
            ..Default::default()
        },
    )
}

fn provenance<const N: usize>(owner: &str, required: [&str; N]) -> PackageProvenance {
    PackageProvenance {
        content_package_id: Some(owner.to_string()),
        required_runtime_packages: required
            .into_iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>(),
    }
}
