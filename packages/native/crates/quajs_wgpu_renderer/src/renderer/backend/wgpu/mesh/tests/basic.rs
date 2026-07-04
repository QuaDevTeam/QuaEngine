use super::*;

#[test]
fn lowers_primitives_into_gpu_quads_and_paints() {
    let plan = WgpuNativeRenderMeshPlan::from_primitive_plan(&primitive_plan(vec![
        primitive(
            "ui:panel",
            DrawBatchPipeline::Ui,
            DrawCommandKind::RoundedRect,
            WgpuNativeRenderPrimitiveKind::Panel {
                fill_color: "#336699cc".to_string(),
                corner_radius: 12.0,
                border: WgpuNativeRenderPrimitiveBorder {
                    color: Some("rgba(255,255,255,0.5)".to_string()),
                    width: 2.0,
                },
            },
            physical_rect(10, 20, 120, 40),
            Vec::new(),
        ),
        primitive(
            "ui:button",
            DrawBatchPipeline::Ui,
            DrawCommandKind::UiSurface,
            WgpuNativeRenderPrimitiveKind::UiButton {
                label: "Start".to_string(),
                enabled: true,
                background_color: "transparent".to_string(),
                text_color: "currentColor".to_string(),
                text_style: text_style(
                    28.0,
                    TextAlign::Right,
                    EdgeInsetsDrawParam {
                        top: 4.0,
                        right: 12.0,
                        bottom: 6.0,
                        left: 20.0,
                    },
                ),
                corner_radius: 8.0,
                border: WgpuNativeRenderPrimitiveBorder::default(),
            },
            physical_rect(20, 70, 180, 52),
            Vec::new(),
        ),
        primitive(
            "background:main",
            DrawBatchPipeline::Image,
            DrawCommandKind::Image,
            WgpuNativeRenderPrimitiveKind::Image {
                asset_type: "images".to_string(),
                asset_name: "bg/school.png".to_string(),
                fit: MediaFit::Fill,
                origin: MediaOrigin::default(),
                source: LogicalRect::default(),
                rotation_degrees: 0.0,
            },
            physical_rect(0, 0, 1280, 720),
            vec![ResourceId::from("images:bg/school.png")],
        ),
    ]));

    assert_eq!(plan.revision, 99);
    assert_eq!(plan.pass_count, 1);
    assert_eq!(plan.quad_count, 3);
    assert_eq!(plan.visible_quad_count, 3);
    assert_eq!(plan.skipped_quad_count, 0);
    assert_eq!(plan.invalid_paint_count, 0);

    let panel = &plan.passes[0].quads[0];
    assert!(panel.is_visible());
    assert_eq!(panel.vertices, quad_vertices(10.0, 20.0, 120.0, 40.0));
    assert_eq!(panel.indices, [0, 1, 2, 0, 2, 3]);
    assert_eq!(panel.corner_radius, 12.0);
    assert_eq!(
        panel.paint,
        WgpuNativeRenderPaint::Solid {
            color: rgba(0x33, 0x66, 0x99, 0xcc),
            literal: "#336699cc".to_string(),
        }
    );
    assert_eq!(
        panel.border,
        Some(WgpuNativeRenderQuadBorder {
            color: Some(WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
                r: 1.0,
                g: 1.0,
                b: 1.0,
                a: 0.5,
            })),
            literal: Some("rgba(255,255,255,0.5)".to_string()),
            width: 2.0,
        })
    );
    assert_eq!(panel.owner_package_id.as_deref(), Some("runtime.menu"));
    assert_eq!(panel.required_package_ids, vec!["runtime.ui".to_string()]);

    let button = &plan.passes[0].quads[1];
    assert_eq!(
        button.paint,
        WgpuNativeRenderPaint::Solid {
            color: WgpuNativeRenderPaintColor::Rgba(WgpuNativeRenderColor {
                r: 0.0,
                g: 0.0,
                b: 0.0,
                a: 0.0,
            }),
            literal: "transparent".to_string(),
        }
    );
    assert_eq!(
        button.text_overlay,
        Some(WgpuNativeRenderTextOverlay {
            text: "Start".to_string(),
            color: WgpuNativeRenderPaintColor::CurrentColor,
            literal: "currentColor".to_string(),
            style: text_style(
                28.0,
                TextAlign::Right,
                EdgeInsetsDrawParam {
                    top: 4.0,
                    right: 12.0,
                    bottom: 6.0,
                    left: 20.0,
                },
            ),
        })
    );

    let image = &plan.passes[0].quads[2];
    assert_eq!(
        image.paint,
        WgpuNativeRenderPaint::Texture {
            resource_id: Some(ResourceId::from("images:bg/school.png")),
            tint: WgpuNativeRenderColor::WHITE,
        }
    );
    assert_eq!(
        image.resource_ids,
        vec![ResourceId::from("images:bg/school.png")]
    );
}
