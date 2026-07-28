pub(crate) fn default_true() -> bool {
    true
}

pub(crate) fn default_one_f32() -> f32 {
    1.0
}

pub(crate) fn default_one_f64() -> f64 {
    1.0
}

pub(crate) fn is_one_f32(value: &f32) -> bool {
    (*value - 1.0).abs() < f32::EPSILON
}
