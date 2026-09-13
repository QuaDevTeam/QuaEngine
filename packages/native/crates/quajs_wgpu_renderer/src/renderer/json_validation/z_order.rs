use crate::projection::safety::{is_safe_native_stack_priority, is_safe_native_z_index};

pub(super) fn invalid_native_json_z_index_reason(value: i32, noun: &str) -> Option<String> {
    if !is_safe_native_z_index(value) {
        return Some(format!("{noun} must stay within native z-order limits"));
    }
    None
}

pub(super) fn invalid_native_json_stack_priority_reason(value: i32, noun: &str) -> Option<String> {
    if !is_safe_native_stack_priority(value) {
        return Some(format!(
            "{noun} must stay within native overlay stack priority limits"
        ));
    }
    None
}
