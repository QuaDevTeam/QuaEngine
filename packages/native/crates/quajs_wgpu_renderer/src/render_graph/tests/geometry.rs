use super::support::test_layout;
use super::*;

#[test]
fn creates_logical_rect_from_safe_area() {
    let layout = test_layout();
    let rect = LogicalRect::from_safe_area(layout.safe_area);

    assert_eq!(rect.x, layout.safe_area.x);
    assert_eq!(rect.y, layout.safe_area.y);
    assert_eq!(rect.width, layout.safe_area.width);
    assert_eq!(rect.height, layout.safe_area.height);
    assert!(!rect.is_empty());
}
