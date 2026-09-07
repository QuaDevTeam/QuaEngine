use super::*;
use crate::render_graph::{EdgeInsetsDrawParam, InlineTextBlock, InlineTextDrawParams};
use std::collections::BTreeMap;

fn atlas() -> FontBackendAtlasLayoutMap {
    let layout = FontBackendAtlasLayout {
        resource_id: ResourceId::from("fonts:test"),
        family: "test".into(),
        raster_size: 10.0,
        ascent: 8.0,
        descent: -2.0,
        line_height: 12.0,
        is_default: true,
        glyphs: "iWMabce\u{301}你好，世界 "
            .chars()
            .map(|c| {
                (
                    c,
                    FontBackendAtlasGlyph {
                        uv_top_left: [0.0; 2],
                        uv_bottom_right: [1.0; 2],
                        advance: match c {
                            'i' => 2.0,
                            '\u{301}' => 0.0,
                            _ => 10.0,
                        },
                        bearing_x: 0.0,
                        bearing_y: -8.0,
                        width: 2.0,
                        height: 10.0,
                    },
                )
            })
            .collect(),
        glyphs_by_id: BTreeMap::new(),
        shaping_face: None,
    };
    [(layout.resource_id.clone(), layout)].into_iter().collect()
}
fn run(text: &str, size: f64) -> InlineTextRun {
    InlineTextRun {
        text: text.into(),
        visible_bytes: text.len(),
        style: InlineTextStyle {
            normal_line_height: false,
            font_family: vec!["test".into()],
            font_size: size,
            line_height: size * 1.2,
            font_weight: None,
            color: "#ff0000".into(),
            align: TextAlign::Left,
        },
    }
}
fn style(blocks: Vec<Vec<InlineTextRun>>) -> WgpuNativeRenderTextStyle {
    WgpuNativeRenderTextStyle {
        inline: Some(InlineTextDrawParams {
            blocks: blocks
                .into_iter()
                .map(|runs| InlineTextBlock {
                    style: run("", 10.0).style,
                    runs,
                })
                .collect(),
        }),
        font_family: vec!["test".into()],
        font_size: 10.0,
        font_style: FontStyleDrawParam::Normal,
        font_weight: None,
        line_height: 12.0,
        letter_spacing: 0.0,
        align: TextAlign::Left,
        vertical_align: WgpuNativeRenderVerticalAlign::Top,
        text_decoration: TextDecorationDrawParam::None,
        text_overflow: TextOverflowDrawParam::Clip,
        text_transform: TextTransformDrawParam::None,
        white_space: WhiteSpaceDrawParam::PreWrap,
        blur_radius: 0.0,
        padding: EdgeInsetsDrawParam::default(),
    }
}
#[test]
fn uses_proportional_advances_shared_baselines_and_block_breaks() {
    let atlases = atlas();
    let style = style(vec![
        vec![run("iii", 10.0), run("W", 20.0), run("i", 10.0)],
        vec![run("M", 10.0)],
    ]);
    let (boxes, height) =
        layout_inline(&style, &atlases, style.inline.as_ref().unwrap(), 100.0).unwrap();
    assert_eq!(
        boxes.iter().map(|b| b.x).collect::<Vec<_>>(),
        [0.0, 6.0, 26.0, 0.0]
    );
    assert_eq!(
        boxes[0].y + boxes[0].item.baseline,
        boxes[1].y + boxes[1].item.baseline
    );
    assert_eq!(boxes[3].y, 24.0);
    assert_eq!(height, 36.0);
}
#[test]
fn wraps_atomic_spans_and_aligns_multiline_span_on_last_baseline() {
    let atlases = atlas();
    let style = style(vec![
        vec![run("WW", 10.0), run("WW", 10.0)],
        vec![run("W\nW", 10.0), run("i", 10.0)],
    ]);
    let (boxes, _) = layout_inline(&style, &atlases, style.inline.as_ref().unwrap(), 30.0).unwrap();
    assert_eq!((boxes[1].x, boxes[1].y), (0.0, 12.0));
    assert_eq!((boxes[2].x, boxes[2].y), (0.0, 24.0));
    assert_eq!((boxes[3].x, boxes[3].y), (10.0, 36.0));
}
#[test]
fn wraps_cjk_and_graphemes_inside_oversized_spans() {
    let atlases = atlas();
    let style = style(vec![
        vec![run("你好，世界", 10.0)],
        vec![run("e\u{301}e\u{301}e\u{301}", 10.0)],
    ]);
    let (boxes, _) = layout_inline(&style, &atlases, style.inline.as_ref().unwrap(), 20.0).unwrap();
    assert!(boxes[0]
        .item
        .lines
        .iter()
        .all(|l| !l.text.starts_with('，')));
    assert_eq!(boxes[1].item.lines[0].text, "e\u{301}e\u{301}");
    assert_eq!(boxes[1].item.lines[1].text, "e\u{301}");
}
#[test]
fn reveals_whole_shaped_ligatures_and_keeps_per_run_draw_metadata_small() {
    let bytes = std::fs::read(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../demo/assets/fonts/NotoSans-Regular.ttf"),
    )
    .unwrap();
    let face = FontBackendShapingFace::new(bytes, 0).unwrap();
    let shaped = face.shape("office", 10.0).unwrap();
    assert!(shaped.glyphs.len() < "office".len());
    let mut atlases = atlas();
    let atlas = atlases.values_mut().next().unwrap();
    atlas.glyphs_by_id = shaped
        .glyphs
        .iter()
        .map(|g| {
            (
                g.glyph_id,
                FontBackendAtlasGlyph {
                    uv_top_left: [0.0; 2],
                    uv_bottom_right: [1.0; 2],
                    advance: g.x_advance,
                    bearing_x: 0.0,
                    bearing_y: -8.0,
                    width: 2.0,
                    height: 10.0,
                },
            )
        })
        .collect();
    atlas.shaping_face = Some(face);
    let mut style = style(vec![vec![run("office", 10.0)]]);
    style.inline.as_mut().unwrap().blocks[0].style.align = TextAlign::Right;
    let bounds = WgpuPhysicalRect {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    };
    let full = inline_text_geometry(bounds, &style, 1.0, &atlases).unwrap();
    style.inline.as_mut().unwrap().blocks[0].runs[0].visible_bytes = 2;
    let prefix = inline_text_geometry(bounds, &style, 1.0, &atlases).unwrap();
    assert_eq!(
        prefix[0].0.vertices.len(),
        4,
        "the ffi cluster must wait for its whole source"
    );
    assert_eq!(prefix[0].0.vertices, full[0].0.vertices[..4]);
    let WgpuNativeRenderPaint::TextPlaceholder { text, style, .. } = &prefix[0].2 else {
        panic!()
    };
    assert_eq!(text, "office");
    assert!(
        style.inline.is_none(),
        "do not clone the whole document into every GPU draw"
    );
}

#[test]
fn reveal_changes_glyph_visibility_without_moving_aligned_runs() {
    let atlases = atlas();
    let mut style = style(vec![vec![run("WW", 10.0), run("e\u{301}i", 20.0)]]);
    style.inline.as_mut().unwrap().blocks[0].style.align = TextAlign::Center;
    let bounds = WgpuPhysicalRect {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    };
    let full = inline_text_geometry(bounds, &style, 0.5, &atlases).unwrap();
    style.inline.as_mut().unwrap().blocks[0].runs[1].visible_bytes = "e\u{301}".len();
    let prefix = inline_text_geometry(bounds, &style, 0.5, &atlases).unwrap();
    assert_eq!(full[0].0, prefix[0].0);
    assert_eq!(&full[1].0.vertices[..8], &prefix[1].0.vertices);
    assert_eq!(prefix[1].0.vertices[0].color, [1.0, 0.0, 0.0, 0.5]);
    style.inline.as_mut().unwrap().blocks[0].runs[1].visible_bytes = 1;
    let partial_cluster = inline_text_geometry(bounds, &style, 0.5, &atlases).unwrap();
    assert_eq!(partial_cluster.len(), 1);
    assert!(inline_text_geometry(bounds, &style, 1.0, &BTreeMap::new()).is_none());
}

#[test]
fn preserves_leading_spaces_across_spans_and_wrapped_lines() {
    let atlases = atlas();
    let style = style(vec![vec![run("W", 10.0), run(" i", 10.0)]]);
    let bounds = WgpuPhysicalRect {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    };
    let draws = inline_text_geometry(bounds, &style, 1.0, &atlases).unwrap();
    assert_eq!(draws[1].0.physical_bounds.x, 20);
    let lines = pre_wrap_lines(" i i W", 22.0, |text| {
        text.chars()
            .map(|c| if c == 'i' { 2.0 } else { 10.0 })
            .sum()
    });
    assert_eq!(
        lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>(),
        [" i ", "i W"]
    );
    assert_eq!(
        lines.iter().map(|l| l.text.as_str()).collect::<String>(),
        " i i W"
    );
}

#[test]
fn block_struts_alignment_and_normal_height_use_selected_font_metrics() {
    let mut atlases = atlas();
    atlases.values_mut().next().unwrap().line_height = 15.0;
    let mut style = style(vec![vec![run("i", 10.0)], vec![run("W", 20.0)]]);
    let inline = style.inline.as_mut().unwrap();
    inline.blocks[0].style.normal_line_height = true;
    inline.blocks[0].style.align = TextAlign::Right;
    inline.blocks[0].runs[0].style.normal_line_height = true;
    inline.blocks[1].style = run("", 20.0).style;
    inline.blocks[1].style.normal_line_height = true;
    inline.blocks[1].style.align = TextAlign::Center;
    inline.blocks[1].runs[0].style.normal_line_height = true;
    let (boxes, height) =
        layout_inline(&style, &atlases, style.inline.as_ref().unwrap(), 100.0).unwrap();
    assert_eq!((boxes[0].x, boxes[0].y), (98.0, 0.0));
    assert_eq!((boxes[1].x, boxes[1].y), (40.0, 15.0));
    assert_eq!(height, 45.0);
}

#[test]
fn empty_inline_blocks_have_no_inflow_baseline_but_still_participate_in_parent_strut() {
    let atlases = atlas();
    let style = style(vec![vec![run("", 100.0)], vec![run("i", 10.0)]]);
    let (boxes, height) =
        layout_inline(&style, &atlases, style.inline.as_ref().unwrap(), 100.0).unwrap();
    assert_eq!(boxes[0].item.height, 0.0);
    assert_eq!(boxes[0].item.baseline, 0.0);
    assert_eq!(height, 24.0);
}

#[test]
fn font_upload_reflows_panel_choices_and_hit_tests_without_changing_reveal_layout_or_resources() {
    use crate::projection::{
        choices::{ChoiceProjection, ChoiceSetProjection},
        dialogue::{DialogueProjection, RichTextContent},
        view::ViewProjection,
    };
    use crate::render_graph::DrawCommandParams;
    use crate::renderer::{
        backend::wgpu::{WgpuNativeRenderBackend, WgpuNativeRenderBackendConfig},
        NativeRenderer,
    };
    use crate::stage_layout::{resolve_stage_layout, StageContainerInput};
    // Very narrow proportional glyphs expose the old ASCII character-count estimate.
    let mut renderer = NativeRenderer::new(WgpuNativeRenderBackend::new(
        WgpuNativeRenderBackendConfig::default(),
    ));
    let layout = resolve_stage_layout(
        None,
        StageContainerInput {
            width: Some(1920.0),
            height: Some(1080.0),
            ..Default::default()
        },
    );
    let full = "i".repeat(1500);
    let mut view = ViewProjection {
        dialogue: Some(DialogueProjection {
            text: RichTextContent::Plain("i".into()),
            layout_text: Some(RichTextContent::Plain(full.clone())),
            ..DialogueProjection::say("")
        }),
        choices: Some(ChoiceSetProjection::new(vec![ChoiceProjection::new(
            "continue", "Next",
        )])),
        ..Default::default()
    };
    renderer.prepare_frame(layout, &view);
    let initial = renderer.state().frame().unwrap().clone();
    let panel = |frame: &crate::frame::PreparedNativeFrame| {
        frame
            .graph
            .commands()
            .iter()
            .find(|c| c.id == "dialogue:panel")
            .unwrap()
            .bounds
    };
    for font in atlas().into_values() {
        renderer.backend_mut().register_font_atlas_layout(font);
    }
    assert!(renderer.reflow_text(&view));
    let reflowed = renderer.state().frame().unwrap().clone();
    assert!(panel(&reflowed).height < panel(&initial).height);
    assert_eq!(
        panel(&reflowed).y + panel(&reflowed).height,
        panel(&initial).y + panel(&initial).height
    );
    assert_eq!(reflowed.resources, initial.resources);
    assert_eq!(reflowed.assets, initial.assets);
    let choice = reflowed
        .graph
        .commands()
        .iter()
        .find(|c| matches!(&c.params, DrawCommandParams::UiButton(_)))
        .unwrap();
    assert!(choice.bounds.y + choice.bounds.height <= panel(&reflowed).y);
    assert!(reflowed
        .hit_intent(
            choice.bounds.x + choice.bounds.width / 2.0,
            choice.bounds.y + choice.bounds.height / 2.0
        )
        .is_some());
    assert!(!renderer.reflow_text(&view));
    view.dialogue.as_mut().unwrap().text = RichTextContent::Plain(full);
    renderer.prepare_frame(layout, &view);
    assert_eq!(panel(renderer.state().frame().unwrap()), panel(&reflowed));
    let half_scale_layout = resolve_stage_layout(
        None,
        StageContainerInput {
            width: Some(960.0),
            height: Some(600.0),
            device_pixel_ratio: Some(1.0),
            ..Default::default()
        },
    );
    renderer.prepare_frame(half_scale_layout, &view);
    assert_eq!(panel(renderer.state().frame().unwrap()), panel(&reflowed));
    view.dialogue.as_mut().unwrap().text = RichTextContent::Plain("i".into());
    view.dialogue.as_mut().unwrap().layout_text = None;
    renderer.prepare_frame(layout, &view);
    assert!(panel(renderer.state().frame().unwrap()).height < panel(&reflowed).height);
}

#[test]
fn zero_line_height_keeps_overflowing_ink_for_ancestor_clipping() {
    let atlases = atlas();
    let mut style = style(vec![vec![run("W", 20.0)]]);
    let inline = style.inline.as_mut().unwrap();
    inline.blocks[0].style.line_height = 0.0;
    inline.blocks[0].runs[0].style.line_height = 0.0;
    let bounds = WgpuPhysicalRect {
        x: 0,
        y: 20,
        width: 100,
        height: 1,
    };
    let output = inline_text_geometry(bounds, &style, 1.0, &atlases).unwrap();
    assert!(output[0].0.vertices.iter().any(|v| v.position[1] < 20.0));
    assert!(output[0].0.vertices.iter().any(|v| v.position[1] > 21.0));
}
