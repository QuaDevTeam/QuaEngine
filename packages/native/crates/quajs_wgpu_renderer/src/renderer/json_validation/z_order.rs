const MAX_NATIVE_Z_INDEX: i32 = 1_000_000;
const MAX_NATIVE_STACK_PRIORITY: i32 = 1_000;

pub(super) fn invalid_native_json_z_index_reason(value: i32, noun: &str) -> Option<String> {
    if value < -MAX_NATIVE_Z_INDEX || value > MAX_NATIVE_Z_INDEX {
        return Some(format!("{noun} must stay within native z-order limits"));
    }
    None
}

pub(super) fn invalid_native_json_stack_priority_reason(value: i32, noun: &str) -> Option<String> {
    if value < -MAX_NATIVE_STACK_PRIORITY || value > MAX_NATIVE_STACK_PRIORITY {
        return Some(format!(
            "{noun} must stay within native overlay stack priority limits"
        ));
    }
    None
}
