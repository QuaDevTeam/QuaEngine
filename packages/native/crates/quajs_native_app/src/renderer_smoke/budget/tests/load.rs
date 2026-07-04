use super::support::unique_budget_path;
use crate::renderer_smoke::budget::load_renderer_smoke_budget;

#[test]
fn rejects_unknown_budget_fields() {
    let path = unique_budget_path("unknown");
    std::fs::write(&path, r#"{ "maxMemoryByts": 1 }"#)
        .expect("renderer smoke budget fixture writes");

    let error = load_renderer_smoke_budget(&path).expect_err("unknown budget fields should fail");

    assert!(error.to_string().contains("unknown field"));
    std::fs::remove_file(path).ok();
}
