use super::super::*;
use super::support::request_for_asset;

#[test]
fn accepts_package_relative_runtime_module_assets_under_limits() {
    let request = request_for_asset("scripts/opening.js", vec![1, 2, 3]);

    assert_eq!(validate_quickjs_evaluation_request(&request), Ok(()));

    for asset_name in [
        "scripts/opening.mjs",
        "migrations/save.cjs",
        "scripts/opening.js?cache=1",
        "scripts/opening.mjs#runtime",
        "scripts/opening.cjs?cache=1#runtime",
    ] {
        let request = request_for_asset(asset_name, vec![1]);
        assert_eq!(validate_quickjs_evaluation_request(&request), Ok(()));
    }
}

#[test]
fn rejects_absolute_uri_parent_and_oversized_runtime_module_assets() {
    for asset_name in [
        "",
        "/tmp/opening.js",
        "\\tmp\\opening.js",
        "../opening.js",
        "scripts/../opening.js",
        " scripts/opening.js",
        "scripts/opening.js ",
        "scripts/\u{1B}opening.js",
        "scripts//opening.js",
        "scripts/./opening.js",
        "scripts/",
        "?module",
        "https://example.invalid/opening.js",
        "file:///tmp/opening.js",
    ] {
        let request = request_for_asset(asset_name, vec![1]);
        let error = validate_quickjs_evaluation_request(&request).unwrap_err();
        assert!(matches!(
            error.code,
            QuickJsEvaluationErrorCode::MissingAssetName
                | QuickJsEvaluationErrorCode::ForbiddenAssetName
        ));
    }

    let mut request = request_for_asset("scripts/large.js", vec![0; 4]);
    request.limits.max_module_bytes = 3;
    let error = validate_quickjs_evaluation_request(&request).unwrap_err();
    assert_eq!(error.code, QuickJsEvaluationErrorCode::ModuleTooLarge);
    assert_eq!(error.asset_name, Some("scripts/large.js".to_string()));
}

#[test]
fn rejects_native_payload_and_non_js_runtime_module_assets() {
    for asset_name in [
        "scripts/native.node",
        "native/plugin.dll",
        "native/plugin.so",
        "native/plugin.dylib",
        "native/helper.wasm",
        "native/helper.wasm?raw",
        "native/helper.wasm#runtime",
        "native/helper.wasm?cache=1#runtime",
    ] {
        let request = request_for_asset(asset_name, vec![1]);
        let error = validate_quickjs_evaluation_request(&request).unwrap_err();
        assert_eq!(
            error.code,
            QuickJsEvaluationErrorCode::ForbiddenNativePayload
        );
        assert_eq!(error.asset_name, Some(asset_name.to_string()));
    }

    for asset_name in [
        "ui/menu.qui.json",
        "styles/default.qss.json",
        "data/plugin.json",
    ] {
        let request = request_for_asset(asset_name, vec![1]);
        let error = validate_quickjs_evaluation_request(&request).unwrap_err();
        assert_eq!(
            error.code,
            QuickJsEvaluationErrorCode::UnsupportedModuleAsset
        );
        assert_eq!(error.asset_name, Some(asset_name.to_string()));
    }
}

#[test]
fn rejects_code_bytes_over_quickjs_module_limit() {
    let mut request = request_for_asset("scripts/opening.js", vec![1]);
    request.module.code = "export const label = \"序章\"".to_string();
    request.limits.max_module_bytes = 4;

    let error = validate_quickjs_evaluation_request(&request).unwrap_err();

    assert_eq!(error.code, QuickJsEvaluationErrorCode::ModuleTooLarge);
    assert_eq!(error.asset_name, Some("scripts/opening.js".to_string()));
    assert_eq!(
        error.detail,
        Some("code bytes: 29; maxModuleBytes: 4".to_string())
    );
}
