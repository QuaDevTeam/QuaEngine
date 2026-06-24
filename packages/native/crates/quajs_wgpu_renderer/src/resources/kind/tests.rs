use super::*;

#[test]
fn infers_resource_kind_from_known_prefixes() {
    assert_eq!(
        infer_resource_kind(&ResourceId::from("fonts:Qua Sans"), DrawCommandKind::Text),
        NativeResourceKind::FontFace
    );
    assert_eq!(
        infer_resource_kind(
            &ResourceId::from("surface:ui/menu.qui"),
            DrawCommandKind::UiSurface
        ),
        NativeResourceKind::UiAst
    );
    assert_eq!(
        infer_resource_kind(
            &ResourceId::from("qss:themes/default.qss.json"),
            DrawCommandKind::UiSurface
        ),
        NativeResourceKind::QssStyle
    );
    assert_eq!(
        infer_resource_kind(
            &ResourceId::from("tokens:default.json"),
            DrawCommandKind::UiSurface
        ),
        NativeResourceKind::TokenTable
    );
    assert_eq!(
        infer_resource_kind(
            &ResourceId::from("video:opening.mp4"),
            DrawCommandKind::VideoFrame
        ),
        NativeResourceKind::VideoDecoder
    );
}

#[test]
fn falls_back_to_command_kind_for_unprefixed_resources() {
    assert_eq!(
        infer_resource_kind(&ResourceId::from("dialogue-font"), DrawCommandKind::Text),
        NativeResourceKind::FontFace
    );
    assert_eq!(
        infer_resource_kind(
            &ResourceId::from("compiled-surface"),
            DrawCommandKind::UiSurface
        ),
        NativeResourceKind::UiAst
    );
    assert_eq!(
        infer_resource_kind(&ResourceId::from("bg-source"), DrawCommandKind::Image),
        NativeResourceKind::Texture
    );
}
