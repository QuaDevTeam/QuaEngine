use std::collections::BTreeSet;

use super::*;
use crate::projection::common::PackageProvenance;
use crate::render_graph::{
    CharacterAnchor, DrawCommandKind, DrawCommandParams, RenderGraph, RenderPlane,
};
use crate::resources::ResourceId;
use crate::stage_layout::{
    resolve_stage_layout, ResolvedStageLayout, StageContainerInput, ViewLayoutInput,
    ViewLayoutOrientation,
};

#[test]
fn builds_visible_character_commands_on_subject_plane() {
    let layout = test_layout();
    let character = CharacterProjection {
        sprite: Some("yuki/default.png".to_string()),
        expression: Some("smile".to_string()),
        position: CharacterPosition {
            x_percent: Some(50.0),
            y_percent: Some(60.0),
            width: Some(400.0),
            height: Some(900.0),
            ..Default::default()
        },
        layer: 5,
        provenance: provenance("base", []),
        ..CharacterProjection::new("yuki", "Yuki")
    };

    let commands = build_character_commands(&layout, &[character]);

    assert_eq!(commands.len(), 1);
    let command = &commands[0];
    assert_eq!(command.id, "character:yuki");
    assert_eq!(command.plane, RenderPlane::Subject);
    assert_eq!(command.kind, DrawCommandKind::Image);
    assert_eq!(command.z_index, 5);
    assert_eq!(
        command.resource_ids,
        vec![ResourceId::from("characters:yuki/default.png")]
    );
    assert_eq!(command.owner_package_id.as_deref(), Some("base"));

    match &command.params {
        DrawCommandParams::Character(params) => {
            assert_eq!(params.character_id, "yuki");
            assert_eq!(params.character_name, "Yuki");
            assert_eq!(params.expression.as_deref(), Some("smile"));
            assert_eq!(params.anchor, CharacterAnchor::Center);
        }
        _ => panic!("expected character draw params"),
    }
}

#[test]
fn skips_hidden_or_missing_sprite_characters() {
    let layout = test_layout();
    let visible_without_sprite = CharacterProjection::new("empty", "Empty");
    let empty_sprite = CharacterProjection {
        sprite: Some("".to_string()),
        ..CharacterProjection::new("empty-sprite", "Empty Sprite")
    };
    let whitespace_sprite = CharacterProjection {
        sprite: Some("  ".to_string()),
        ..CharacterProjection::new("whitespace-sprite", "Whitespace Sprite")
    };
    let hidden = CharacterProjection {
        visible: false,
        sprite: Some("hidden.png".to_string()),
        ..CharacterProjection::new("hidden", "Hidden")
    };

    assert!(build_character_commands(
        &layout,
        &[
            visible_without_sprite,
            empty_sprite,
            whitespace_sprite,
            hidden
        ],
    )
    .is_empty());
}

#[test]
fn skips_characters_with_unsafe_sprite_asset_names() {
    let layout = test_layout();
    let characters = [
        CharacterProjection {
            sprite: Some("../sprites/escape.png".to_string()),
            ..CharacterProjection::new("traversal", "Traversal")
        },
        CharacterProjection {
            sprite: Some("/sprites/absolute.png".to_string()),
            ..CharacterProjection::new("absolute", "Absolute")
        },
        CharacterProjection {
            sprite: Some("https://example.test/yuki.png".to_string()),
            ..CharacterProjection::new("url", "Url")
        },
        CharacterProjection {
            sprite: Some("sprites\\backslash.png".to_string()),
            ..CharacterProjection::new("backslash", "Backslash")
        },
        CharacterProjection {
            sprite: Some("sprites/native.node?rev=1".to_string()),
            ..CharacterProjection::new("payload", "Payload")
        },
        CharacterProjection {
            sprite: Some("sprites/yuki.png".to_string()),
            ..CharacterProjection::new("valid", "Valid")
        },
    ];

    let commands = build_character_commands(&layout, &characters);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "character:valid");
    assert_eq!(
        commands[0].resource_ids,
        vec![ResourceId::from("characters:sprites/yuki.png")]
    );
}

#[test]
fn skips_characters_with_unsafe_projection_ids_on_direct_projection() {
    let layout = test_layout();
    let characters = [
        CharacterProjection {
            sprite: Some("sprites/url.png".to_string()),
            ..CharacterProjection::new("https://example.test/yuki", "Url")
        },
        CharacterProjection {
            sprite: Some("sprites/native.png".to_string()),
            ..CharacterProjection::new("native:yuki", "Native")
        },
        CharacterProjection {
            sprite: Some("sprites/path.png".to_string()),
            ..CharacterProjection::new("bad/yuki", "Path")
        },
        CharacterProjection {
            sprite: Some("sprites/payload.png".to_string()),
            ..CharacterProjection::new("plugin.dll", "Payload")
        },
        CharacterProjection {
            sprite: Some("sprites/yuki.png".to_string()),
            ..CharacterProjection::new("yuki:smile", "Yuki")
        },
    ];

    let commands = build_character_commands(&layout, &characters);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "character:yuki:smile");
    match &commands[0].params {
        DrawCommandParams::Character(params) => {
            assert_eq!(params.character_id, "yuki:smile");
        }
        _ => panic!("expected character draw params"),
    }
}

#[test]
fn skips_duplicate_character_projection_ids_on_direct_projection() {
    let layout = test_layout();
    let characters = [
        CharacterProjection {
            sprite: Some("sprites/yuki-first.png".to_string()),
            ..CharacterProjection::new("yuki", "Yuki First")
        },
        CharacterProjection {
            sprite: Some("sprites/yuki-second.png".to_string()),
            ..CharacterProjection::new("yuki", "Yuki Second")
        },
        CharacterProjection {
            sprite: Some("sprites/mei.png".to_string()),
            ..CharacterProjection::new("mei", "Mei")
        },
    ];

    let commands = build_character_commands(&layout, &characters);

    assert_eq!(
        commands
            .iter()
            .map(|command| command.id.as_str())
            .collect::<Vec<_>>(),
        vec!["character:yuki", "character:mei"]
    );
    match &commands[0].params {
        DrawCommandParams::Character(params) => {
            assert_eq!(params.character_name, "Yuki First");
            assert_eq!(params.sprite_asset_name, "sprites/yuki-first.png");
        }
        _ => panic!("expected character draw params"),
    }
}

#[test]
fn skips_characters_with_unsafe_resolved_numbers_on_direct_projection() {
    let layout = test_layout();
    let characters = [
        CharacterProjection {
            sprite: Some("sprites/opacity.png".to_string()),
            opacity: -0.01,
            ..CharacterProjection::new("bad-opacity", "Bad Opacity")
        },
        CharacterProjection {
            sprite: Some("sprites/layer.png".to_string()),
            layer: 1_000_001,
            ..CharacterProjection::new("bad-layer", "Bad Layer")
        },
        CharacterProjection {
            sprite: Some("sprites/scale.png".to_string()),
            position: CharacterPosition {
                scale: Some(0.0),
                ..Default::default()
            },
            ..CharacterProjection::new("bad-scale", "Bad Scale")
        },
        CharacterProjection {
            sprite: Some("sprites/width.png".to_string()),
            position: CharacterPosition {
                width: Some(-1.0),
                ..Default::default()
            },
            ..CharacterProjection::new("bad-width", "Bad Width")
        },
        CharacterProjection {
            sprite: Some("sprites/rotation.png".to_string()),
            position: CharacterPosition {
                rotation: Some(360_001.0),
                ..Default::default()
            },
            ..CharacterProjection::new("bad-rotation", "Bad Rotation")
        },
        CharacterProjection {
            sprite: Some("sprites/x.png".to_string()),
            position: CharacterPosition {
                x: Some(f64::INFINITY),
                ..Default::default()
            },
            ..CharacterProjection::new("bad-x", "Bad X")
        },
        CharacterProjection {
            sprite: Some("sprites/yuki.png".to_string()),
            ..CharacterProjection::new("yuki", "Yuki")
        },
    ];

    let commands = build_character_commands(&layout, &characters);

    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].id, "character:yuki");
}

#[test]
fn resolves_anchor_and_default_safe_area_position() {
    let layout = test_layout();
    let left = CharacterPosition {
        x_percent: Some(5.0),
        ..Default::default()
    };
    let right = CharacterPosition {
        x_percent: Some(95.0),
        ..Default::default()
    };
    let center_bounds = resolve_character_bounds(&layout, &CharacterPosition::default());

    assert_eq!(resolve_character_anchor(&left), CharacterAnchor::Left);
    assert_eq!(resolve_character_anchor(&right), CharacterAnchor::Right);
    assert_eq!(
        resolve_character_anchor(&CharacterPosition::default()),
        CharacterAnchor::Center
    );
    assert_eq!(
        center_bounds.x + center_bounds.width / 2.0,
        layout.safe_area.x + layout.safe_area.width / 2.0
    );
    assert_eq!(
        center_bounds.y + center_bounds.height / 2.0,
        layout.safe_area.y + layout.safe_area.height / 2.0
    );

    let zero_bounds = resolve_character_bounds(
        &layout,
        &CharacterPosition {
            width: Some(0.0),
            height: Some(0.0),
            ..Default::default()
        },
    );
    assert_eq!(zero_bounds.width, 0.0);
    assert_eq!(zero_bounds.height, 0.0);
}

#[test]
fn appends_commands_and_preserves_package_dependencies() {
    let mut graph = RenderGraph::new(test_layout());
    let character = CharacterProjection {
        sprite: Some("runtime/yuki.png".to_string()),
        provenance: provenance("runtime.sprite", ["base"]),
        ..CharacterProjection::new("yuki", "Yuki")
    };

    append_character_commands(&mut graph, &[character]);

    let command = &graph.commands()[0];
    assert_eq!(command.owner_package_id.as_deref(), Some("runtime.sprite"));
    assert!(command.required_package_ids.contains("base"));
    assert_eq!(
        graph.summary().by_plane[&RenderPlane::Subject].command_count,
        1
    );
}

#[test]
fn skips_unsafe_package_provenance_on_direct_projection() {
    let layout = test_layout();
    let character = CharacterProjection {
        sprite: Some("runtime/yuki.png".to_string()),
        provenance: provenance(
            "https://example.test/runtime.sprite",
            ["base", "runtime/ui"],
        ),
        ..CharacterProjection::new("yuki", "Yuki")
    };

    let commands = build_character_commands(&layout, &[character]);
    let command = &commands[0];

    assert_eq!(command.owner_package_id, None);
    assert!(command.required_package_ids.contains("base"));
    assert!(!command.required_package_ids.contains("runtime/ui"));
    assert!(!command
        .required_package_ids
        .contains("https://example.test/runtime.sprite"));
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
