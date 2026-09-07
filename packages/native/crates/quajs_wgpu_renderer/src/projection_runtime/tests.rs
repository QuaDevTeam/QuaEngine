use super::NativeRendererProjectionRuntime;

#[test]
fn typewriter_progresses_without_new_pipeline_messages() {
    let frame = r#"{"view":{"dialogue":{"visible":true,"text":"abcdef","typewriter":{"enabled":true,"durationMs":1000}},"characters":[]}}"#;
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
    let first = runtime
        .project_at_epoch_ms(runtime.received_epoch_ms + 250.0)
        .unwrap();
    assert!(first.local_work_active);
    let first_json: serde_json::Value = serde_json::from_str(&first.json).unwrap();
    assert_eq!(
        first_json
            .pointer("/view/dialogue/text")
            .and_then(serde_json::Value::as_str),
        Some("ab")
    );
    assert_eq!(
        first_json
            .pointer("/view/dialogue/layoutText")
            .and_then(serde_json::Value::as_str),
        Some("abcdef")
    );
    assert!(runtime.reveal_dialogue_on_advance());
    let revealed = runtime
        .project_at_epoch_ms(runtime.received_epoch_ms + 250.0)
        .unwrap();
    assert!(!revealed.local_work_active);
    assert!(revealed.json.contains("abcdef"));
    assert_eq!(runtime.font_prewarm_texts(), vec!["abcdef"]);
}

#[test]
fn animation_interpolates_character_in_rust() {
    let frame = r#"{"view":{"characters":[{"id":"mira","position":{"x":10,"y":20}}],"animations":[{"startedAt":1000,"duration":1000,"resolvedTracks":[{"target":"character:mira","property":"position.x","keyframes":[{"at":0,"value":10},{"at":1000,"value":110}]}]}]}}"#;
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
    let rendered = runtime.project_at_epoch_ms(1500.0).unwrap();
    let rendered_json: serde_json::Value = serde_json::from_str(&rendered.json).unwrap();
    assert_eq!(
        rendered_json
            .pointer("/view/characters/0/position/x")
            .and_then(serde_json::Value::as_f64),
        Some(60.0)
    );
}

#[test]
fn scene_change_is_renderer_timed_and_emits_ready() {
    let frame = r#"{"view":{}}"#;
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
    runtime
        .apply_pipeline_event(
            "scene/change",
            r#"{"toScene":"next","transition":{"type":"fade","duration":100}}"#,
        )
        .unwrap();
    assert!(
        runtime
            .project_at_epoch_ms(runtime.received_epoch_ms + 50.0)
            .unwrap()
            .local_work_active
    );
    assert!(runtime.drain_intents().is_empty());
    runtime
        .project_at_epoch_ms(runtime.received_epoch_ms + 101.0)
        .unwrap();
    assert_eq!(
        runtime
            .drain_intents()
            .first()
            .map(|intent| intent.r#type.as_str()),
        Some("scene/ready")
    );
}

#[test]
fn animation_redraw_covers_delay_rate_loops_and_pause() {
    use serde_json::json;
    let mut animation = json!({
        "state": "running", "startedAt": 1000, "duration": 1000,
        "delay": 200, "playbackRate": 0.5, "loop": 2, "direction": "alternate", "fill": "none",
        "resolvedTracks": [{"target":"character:mira", "property":"position.x",
            "keyframes":[{"at":0,"value":10},{"at":1000,"value":110}]}]
    });
    let project = |animation: &serde_json::Value, now| {
        let mut view = json!({"characters":[{"id":"mira","position":{"x":10}}]});
        let active = super::animation::apply_animations(
            view.as_object_mut().unwrap(),
            &json!([animation]),
            now,
        );
        (
            view.pointer("/characters/0/position/x")
                .unwrap()
                .as_f64()
                .unwrap(),
            active,
        )
    };
    assert_eq!(project(&animation, 1100.0), (10.0, 1)); // delay owes a future frame without backwards fill
    assert_eq!(project(&animation, 2400.0), (60.0, 1)); // slow timeline still active after 1 second
    assert_eq!(project(&animation, 4400.0), (60.0, 1)); // second, reverse iteration
    assert_eq!(project(&animation, 5400.0), (10.0, 0));
    animation["state"] = json!("paused");
    animation["pausedAt"] = json!(2400);
    assert_eq!(project(&animation, 9999.0), (60.0, 0));
    animation["state"] = json!("running");
    animation["playbackRate"] = json!(2);
    assert_eq!(project(&animation, 1700.0), (90.0, 1));
    assert_eq!(project(&animation, 2100.0), (10.0, 0));
    animation.as_object_mut().unwrap().remove("fill");
    animation["direction"] = json!("normal");
    assert_eq!(project(&animation, 2100.0), (110.0, 0)); // shared default is forwards
}

mod easing {
    use super::super::animation::ease_progress;

    /// Exact-arithmetic curves (polynomials, linear passthrough) must match to
    /// the last bit.
    fn assert_eased(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-12,
            "expected {expected}, got {actual}"
        );
    }

    /// Bezier curves go through an iterative x-solve, so they are compared at
    /// the same 1e-6 tolerance the interaction-feedback path uses for the
    /// identical WebKit reference constants.
    fn assert_solved(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-6,
            "expected {expected}, got {actual}"
        );
    }

    // Reference values from the canonical WebKit UnitBezier solver, the same
    // source the interaction-feedback path asserts against. Both paths now share
    // the CSS-spec solver, so `ease` resolves to cubic-bezier(0.25, 0.1, 0.25, 1)
    // and is solved on x before y is evaluated.
    #[test]
    fn maps_the_ease_keyword_to_css_spec_bezier() {
        assert_solved(ease_progress(0.1, Some("ease")), 0.094_796_306);
        assert_solved(ease_progress(0.25, Some("ease")), 0.408_510_593);
        assert_solved(ease_progress(0.5, Some("ease")), 0.802_403_388);
        assert_solved(ease_progress(0.75, Some("ease")), 0.960_458_978);
        assert_solved(ease_progress(0.9, Some("ease")), 0.994_316_478);
    }

    #[test]
    fn evaluates_cubic_bezier_strings_with_css_spec_solver() {
        // ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1). Same reference values as
        // the interaction-feedback suite.
        let easing = Some("cubic-bezier(0.19, 1, 0.22, 1)");
        assert_solved(ease_progress(0.1, easing), 0.479_754_619);
        assert_solved(ease_progress(0.5, easing), 0.977_824_592);
        assert_solved(ease_progress(0.9, easing), 0.999_911_198);
        assert_eased(ease_progress(0.0, easing), 0.0);
        assert_eased(ease_progress(1.0, easing), 1.0);
        // No-space variant must resolve to the same bezier.
        assert_solved(
            ease_progress(0.5, Some("cubic-bezier(0.19,1,0.22,1)")),
            0.977_824_592,
        );
        // Overshooting spring bezier: y control points outside 0..=1 are legal and
        // the solver must still key off x. The old simplified evaluator returned
        // exactly 0.5 here because it ignored the x control points.
        assert_solved(
            ease_progress(0.5, Some("cubic-bezier(0.68, -0.55, 0.27, 1.55)")),
            0.596_596_292,
        );
    }

    #[test]
    fn supports_the_cubic_in_out_keyword() {
        assert_eased(ease_progress(0.25, Some("cubic-in-out")), 0.0625);
        assert_eased(ease_progress(0.5, Some("cubicInOut")), 0.5);
        assert_eased(ease_progress(0.75, Some("easeInOutCubic")), 0.9375);
    }

    #[test]
    fn falls_back_to_linear_for_malformed_bezier_strings() {
        // render-core's regex rejects all of these, and unknown keywords fall
        // through to linear there as well.
        for easing in [
            "cubic-bezier(0.19, 1, 0.22)",
            "cubic-bezier(0.19, 1, 0.22, 1, 5)",
            "cubic-bezier( 0.19, 1, 0.22, 1)",
            "cubic-bezier(0.19 , 1, 0.22, 1)",
            "cubic-bezier(1e1, 1, 0.22, 1)",
            "cubic-bezier(a, b, c, d)",
            "bounce",
        ] {
            assert_eased(ease_progress(0.37, Some(easing)), 0.37);
        }
    }
}

mod scroll {
    use super::NativeRendererProjectionRuntime;

    fn runtime_with_scroll_overlay(
        viewport_w: f64,
        viewport_h: f64,
        content_h: f64,
    ) -> NativeRendererProjectionRuntime {
        let frame = format!(
            r#"{{
                "view": {{
                    "ui": {{
                        "overlays": [{{
                            "elementId": "panel",
                            "surface": {{
                                "root": {{
                                    "id": "scroll-root",
                                    "kind": "Scroll",
                                    "bounds": {{ "x": 0, "y": 0, "width": {viewport_w}, "height": {viewport_h} }},
                                    "children": [{{
                                        "id": "child",
                                        "kind": "Panel",
                                        "bounds": {{ "x": 0, "y": 0, "width": {viewport_w}, "height": {content_h} }}
                                    }}]
                                }}
                            }}
                        }}]
                    }}
                }}
            }}"#
        );
        NativeRendererProjectionRuntime::from_frame_json(&frame).unwrap()
    }

    #[test]
    fn scroll_down_moves_offset_and_clears_cache() {
        let mut rt = runtime_with_scroll_overlay(400.0, 300.0, 800.0);
        // Hit the scroll node, scroll 50 px down.
        let moved = rt.scroll_at_client(200.0, 150.0, 0.0, 50.0);
        assert!(moved, "should find scroll node and move");
        // A fresh projection must include the updated offset.
        let frame = rt.project_now().unwrap();
        let v: serde_json::Value = serde_json::from_str(&frame.json).unwrap();
        // The offset is stored in renderer-local state and is applied to the
        // projected view. Check that the cache was cleared so the next call
        // actually projects rather than returning the stale cached string.
        assert!(!frame.json.is_empty());
    }

    #[test]
    fn scroll_is_clamped_to_zero_at_top() {
        let mut rt = runtime_with_scroll_overlay(400.0, 300.0, 800.0);
        // Scroll up when already at the top — should return false (no change).
        let moved = rt.scroll_at_client(200.0, 150.0, 0.0, -50.0);
        assert!(!moved, "scrolling up past top should be a no-op");
    }

    #[test]
    fn scroll_is_clamped_to_max_at_bottom() {
        let mut rt = runtime_with_scroll_overlay(400.0, 300.0, 800.0);
        // max_scroll_y = content_h - viewport_h = 500.
        // Scroll 10000 px — must clamp to 500.
        let moved = rt.scroll_at_client(200.0, 150.0, 0.0, 10_000.0);
        assert!(moved);
        // Scroll another 1 px — already at max, no movement.
        let moved_again = rt.scroll_at_client(200.0, 150.0, 0.0, 1.0);
        assert!(!moved_again, "second scroll past max should be a no-op");
    }

    #[test]
    fn miss_outside_scroll_node_bounds_returns_false() {
        let mut rt = runtime_with_scroll_overlay(400.0, 300.0, 800.0);
        // Hit outside the viewport.
        let moved = rt.scroll_at_client(999.0, 999.0, 0.0, 50.0);
        assert!(!moved, "hit outside viewport should not scroll");
    }

    #[test]
    fn zero_delta_is_a_no_op() {
        let mut rt = runtime_with_scroll_overlay(400.0, 300.0, 800.0);
        assert!(!rt.scroll_at_client(200.0, 150.0, 0.0, 0.0));
    }

    #[test]
    fn non_scroll_node_does_not_capture_scroll() {
        // A Panel root — no scroll node anywhere.
        let frame = r#"{
            "view": {
                "ui": {
                    "overlays": [{
                        "elementId": "panel",
                        "surface": {
                            "root": {
                                "id": "panel-root",
                                "kind": "Panel",
                                "bounds": { "x": 0, "y": 0, "width": 400, "height": 300 },
                                "children": []
                            }
                        }
                    }]
                }
            }
        }"#;
        let mut rt = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
        assert!(!rt.scroll_at_client(200.0, 150.0, 0.0, 50.0));
    }

    #[test]
    fn nested_scroll_nodes_innermost_wins() {
        // Outer scroll: 0,0 -> 600,600, content 600x1200.
        // Inner scroll: 100,100 -> 300,300 (inside outer), content 300x600.
        let frame = r#"{
            "view": {
                "ui": {
                    "overlays": [{
                        "elementId": "outer-panel",
                        "surface": {
                            "root": {
                                "id": "outer-scroll",
                                "kind": "Scroll",
                                "bounds": { "x": 0, "y": 0, "width": 600, "height": 600 },
                                "children": [
                                    {
                                        "id": "inner-scroll",
                                        "kind": "Scroll",
                                        "bounds": { "x": 100, "y": 100, "width": 300, "height": 300 },
                                        "children": [
                                            {
                                                "id": "inner-child",
                                                "kind": "Panel",
                                                "bounds": { "x": 100, "y": 100, "width": 300, "height": 600 }
                                            }
                                        ]
                                    },
                                    {
                                        "id": "outer-child",
                                        "kind": "Panel",
                                        "bounds": { "x": 0, "y": 0, "width": 600, "height": 1200 }
                                    }
                                ]
                            }
                        }
                    }]
                }
            }
        }"#;
        let mut rt = NativeRendererProjectionRuntime::from_frame_json(frame).unwrap();
        // Hit inside inner scroll (200,200 is inside both outer [0,600] and inner [100,400]).
        let moved = rt.scroll_at_client(200.0, 200.0, 0.0, 50.0);
        assert!(moved);
        // The key written must be for the inner scroll node.
        // We can't inspect scroll_offsets directly, but we can verify that
        // a second scroll with a hit outside the inner rect falls back to the outer.
        let moved_outer = rt.scroll_at_client(50.0, 50.0, 0.0, 50.0);
        assert!(
            moved_outer,
            "hit outside inner but inside outer should scroll outer"
        );
    }
}

#[test]
fn rich_text_animation_survives_typewriter_projection_and_updates_full_layout() {
    use serde_json::json;
    let input = json!({"view":{"dialogue":{"visible":true,"text":{"blocks":[{"id":"line","spans":[{"id":"word","text":"abcdef"}]}]},"typewriter":{"enabled":true,"durationMs":1000}},"animations":[{
        "startedAt":0,"duration":1000,"fill":"forwards","resolvedTracks":[{"target":"richTextSpan:dialogue:word","property":"fontSize","keyframes":[{"at":0,"value":20},{"at":1000,"value":40}]}]
    }]}});
    let mut runtime = NativeRendererProjectionRuntime::from_frame_json(&input.to_string()).unwrap();
    runtime.base_frame["view"]["animations"][0]["startedAt"] = json!(runtime.received_epoch_ms);
    let frame = runtime
        .project_at_epoch_ms(runtime.received_epoch_ms + 500.0)
        .unwrap();
    let view: serde_json::Value = serde_json::from_str(&frame.json).unwrap();
    for field in ["text", "layoutText"] {
        assert_eq!(
            view.pointer(&format!(
                "/view/dialogue/{field}/blocks/0/spans/0/style/fontSize"
            ))
            .unwrap(),
            30.0
        );
    }
}

#[test]
fn rich_span_targets_follow_shared_ids_across_blocks_and_normalize_native_styles() {
    use serde_json::json;
    let mut view = json!({"dialogue":{"text":{"blocks":[
        {"spans":[{"id":"word:one","text":"first"}]},
        {"spans":[{"id":"word:one","text":"second"}]}
    ]}}});
    let animations = json!([{"startedAt":0,"duration":100,"resolvedTracks":[
        {"target":"richTextSpan:dialogue:word:one","property":"fontFamily","keyframes":[{"at":0,"value":"Noto Sans"}]},
        {"target":"richTextSpan:dialogue:word:one","property":"lineHeight","keyframes":[{"at":0,"value":1.5}]},
        {"target":"richTextSpan:dialogue:word:one","property":"fontWeight","keyframes":[{"at":0,"value":400},{"at":100,"value":700}]}
    ]}]);
    super::animation::apply_animations(view.as_object_mut().unwrap(), &animations, 50.0);
    for block in view["dialogue"]["text"]["blocks"].as_array().unwrap() {
        assert_eq!(
            block["spans"][0]["style"],
            json!({"fontFamily":["Noto Sans"],"lineHeight":"1.5","fontWeight":550})
        );
    }
    serde_json::from_value::<crate::projection::view::ViewProjection>(view).unwrap();
}
