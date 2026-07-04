use super::super::*;

#[test]
fn rejects_target_core_adapters_in_non_post_bundle_project_graphs() {
    let mut manifest = native_manifest();
    manifest
        .project_graphs
        .push(TargetBundleProjectGraphRecord {
            id: "native.startup-shell.declares-core".to_string(),
            kind: "startup-shell".to_string(),
            references: vec![
                TargetBundleReference::Specifier("@quajs/engine".to_string()),
                TargetBundleReference::Specifier("@quajs/engine-native/bootstrap".to_string()),
            ],
        });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("startup shell target core declarations are rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Project graph \"native.startup-shell.declares-core\" (startup-shell) for native target must not declare target core adapter \"@quajs/engine-native\""
    )));
}

#[test]
fn rejects_target_core_adapters_in_native_project_shell_and_distribution_graphs() {
    for (kind, specifier, expected_package) in [
        (
            "project-template",
            "@quajs/engine-native/bootstrap",
            "@quajs/engine-native",
        ),
        (
            "debug-shell",
            "@quajs/renderer-web/plugins/ui",
            "@quajs/renderer-web",
        ),
        (
            "release-shell",
            "@quajs/cocos-host/runtime",
            "@quajs/cocos-host",
        ),
        (
            "smoke-runner",
            "@quajs/renderer-cocos/plugins/dialogue",
            "@quajs/renderer-cocos",
        ),
        ("installer", "@quajs/assets-web", "@quajs/assets-web"),
        (
            "updater",
            "@quajs/store-native/runtime",
            "@quajs/store-native",
        ),
    ] {
        let graph_id = format!("native.{kind}.declares-core");
        let mut manifest = native_manifest();
        manifest
            .project_graphs
            .push(TargetBundleProjectGraphRecord {
                id: graph_id.clone(),
                kind: kind.to_string(),
                references: vec![
                    TargetBundleReference::Specifier("@quajs/engine".to_string()),
                    TargetBundleReference::Specifier(specifier.to_string()),
                ],
            });

        let error = validate_native_target_bundle_manifest(&manifest, None)
            .expect_err("native project shell/distribution target core declarations are rejected");

        assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
            &format!(
                "Project graph \"{graph_id}\" ({kind}) for native target must not declare target core adapter \"{expected_package}\""
            ),
        )));
    }
}

#[test]
fn rejects_inactive_target_core_adapters_in_post_bundle_project_graphs() {
    let mut manifest = native_manifest();
    manifest
        .project_graphs
        .push(TargetBundleProjectGraphRecord {
            id: "native.release.macos.post-bundle.bad".to_string(),
            kind: "post-bundle".to_string(),
            references: vec![
                TargetBundleReference::Specifier("@quajs/engine-native".to_string()),
                TargetBundleReference::Object(TargetBundleReferenceObject {
                    specifier: Some("@quajs/character".to_string()),
                    package_name: Some("@quajs/renderer-web/plugins/ui".to_string()),
                    target: None,
                    plugin_id: None,
                }),
                TargetBundleReference::Specifier(
                    "/repo/app/node_modules/@quajs/renderer-cocos/plugins/dialogue.js?import"
                        .to_string(),
                ),
            ],
        });

    let error = validate_native_target_bundle_manifest(&manifest, None)
        .expect_err("post-bundle inactive target core adapters are rejected");

    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Post-bundle project graph \"native.release.macos.post-bundle.bad\" for native target must not include inactive target core adapter \"@quajs/renderer-web\""
    )));
    assert!(error.diagnostics().iter().any(|diagnostic| diagnostic.contains(
        "Post-bundle project graph \"native.release.macos.post-bundle.bad\" for native target must not include inactive target core adapter \"@quajs/renderer-cocos\""
    )));
}
