use super::*;

#[test]
fn rust_and_json_character_defaults_preserve_visible_opaque_sprites() {
    let character: CharacterProjection = serde_json::from_value(serde_json::json!({
        "id":"yuki", "name":"Yuki"
    }))
    .unwrap();
    assert_eq!(
        character,
        CharacterProjection {
            id: "yuki".into(),
            name: "Yuki".into(),
            ..Default::default()
        }
    );
    let layer: CharacterSpriteLayerProjection = serde_json::from_value(serde_json::json!({
        "asset":"yuki/face.png"
    }))
    .unwrap();
    assert_eq!(
        layer,
        CharacterSpriteLayerProjection {
            asset: "yuki/face.png".into(),
            ..Default::default()
        }
    );
    assert!(layer.visible);
    assert_eq!((layer.opacity, layer.scale), (1.0, 1.0));
}

#[test]
fn sprite_opacity_and_layer_order_apply_to_the_complete_character() {
    let character = CharacterProjection {
        sprite: Some("yuki/base.png".into()),
        opacity: 0.5,
        presence_opacity: 0.6,
        layer: 2,
        sprite_layers: vec![
            CharacterSpriteLayerProjection {
                asset: "yuki/face.png".into(),
                opacity: 0.4,
                z_index: 100,
                ..Default::default()
            },
            CharacterSpriteLayerProjection {
                asset: "yuki/back.png".into(),
                z_index: -1,
                ..Default::default()
            },
        ],
        provenance: provenance("runtime.sprite", ["base"]),
        ..CharacterProjection::new("yuki", "Yuki")
    };
    let neighbor = CharacterProjection {
        sprite: Some("neighbor.png".into()),
        layer: 3,
        ..CharacterProjection::new("neighbor", "Neighbor")
    };
    let mut graph = RenderGraph::new(test_layout());
    append_character_commands(&mut graph, &[character, neighbor]);
    let commands = graph.commands();
    assert_eq!(
        commands.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
        vec![
            "character:yuki:sprite-layer:1",
            "character:yuki",
            "character:yuki:sprite-layer:0",
            "character:neighbor"
        ]
    );
    assert_eq!(commands[1].opacity, 1.0);
    assert_eq!(commands[2].opacity, 0.4);
    for command in &commands[..3] {
        assert_eq!(command.composite_groups.len(), 1);
        assert!((command.composite_groups[0].opacity - 0.3).abs() < 1e-6);
        assert_eq!(command.composite_groups[0].z_index, 2);
        assert_eq!(command.owner_package_id.as_deref(), Some("runtime.sprite"));
        assert!(command.required_package_ids.contains("base"));
    }
    assert!(commands[3].composite_groups.is_empty());
}

#[test]
fn unsafe_direct_sprite_layers_do_not_reach_gpu_geometry() {
    let valid = CharacterSpriteLayerProjection {
        asset: "yuki/face.png".into(),
        ..Default::default()
    };
    for invalid in [
        CharacterSpriteLayerProjection {
            offset_x: f64::NAN,
            ..valid.clone()
        },
        CharacterSpriteLayerProjection {
            offset_y: 1e20,
            ..valid.clone()
        },
        CharacterSpriteLayerProjection {
            rotation: f64::INFINITY,
            ..valid.clone()
        },
        CharacterSpriteLayerProjection {
            scale: -1.0,
            ..valid.clone()
        },
        CharacterSpriteLayerProjection {
            scale: 1e20,
            ..valid.clone()
        },
        CharacterSpriteLayerProjection {
            z_index: i32::MAX,
            ..valid.clone()
        },
        CharacterSpriteLayerProjection {
            asset: "../escape.png".into(),
            ..valid
        },
    ] {
        let character = CharacterProjection {
            sprite: Some("yuki/base.png".into()),
            opacity: 0.5,
            sprite_layers: vec![invalid],
            ..CharacterProjection::new("yuki", "Yuki")
        };
        let commands = build_character_commands(&test_layout(), &[character]);
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].opacity, 0.5);
        assert!(commands[0].composite_groups.is_empty());
    }
}
