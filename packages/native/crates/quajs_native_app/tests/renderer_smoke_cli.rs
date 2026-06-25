use std::process::Command;

const RENDERER_SMOKE_FRAME_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_FRAME";

#[test]
fn binary_runs_renderer_smoke_frame_from_projection_json() {
    let path = unique_frame_path("valid");
    std::fs::write(&path, smoke_frame_json()).expect("renderer smoke fixture writes");

    let output = Command::new(env!("CARGO_BIN_EXE_quajs_native_app"))
        .env(RENDERER_SMOKE_FRAME_ENV, &path)
        .env_remove("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .output()
        .expect("native app binary runs");

    std::fs::remove_file(path).ok();

    assert!(
        output.status.success(),
        "native app failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Qua native host ready: renderer="));
    assert!(stdout.contains("\"quickjsVersion\":\"unsupported\""));
    assert!(stdout.contains("Qua native renderer smoke: revision=1 passes=2 batches="));
    assert!(stdout.contains("missingResources=0"));
}

#[test]
fn binary_reports_invalid_renderer_smoke_frame_json() {
    let path = unique_frame_path("invalid");
    std::fs::write(&path, "{not json").expect("invalid renderer smoke fixture writes");

    let output = Command::new(env!("CARGO_BIN_EXE_quajs_native_app"))
        .env(RENDERER_SMOKE_FRAME_ENV, &path)
        .env_remove("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .output()
        .expect("native app binary runs");

    std::fs::remove_file(path).ok();

    assert!(
        !output.status.success(),
        "invalid frame unexpectedly succeeded\nstdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Native renderer smoke frame failed"));
    assert!(stderr.contains("Failed to parse native renderer frame JSON"));
}

fn unique_frame_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "quajs-native-app-cli-renderer-smoke-{label}-{}-{}.json",
        std::process::id(),
        std::thread::current().name().unwrap_or("test")
    ))
}

fn smoke_frame_json() -> &'static str {
    r##"
    {
      "layout": { "preset": "landscape" },
      "container": { "width": 1600, "height": 1000, "devicePixelRatio": 2 },
      "view": {
        "background": {
          "mode": "image",
          "assetName": "bg/native-cli-smoke.png",
          "provenance": { "contentPackageId": "base" }
        },
        "ui": {
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/native-cli-smoke.qui",
                "root": {
                  "id": "root",
                  "kind": "Box",
                  "bounds": { "x": 48, "y": 48, "width": 420, "height": 220 },
                  "style": {
                    "backgroundColor": "#101820",
                    "borderColor": "#5ac8fa",
                    "borderWidth": 2,
                    "borderRadius": 12
                  },
                  "children": [
                    {
                      "id": "title",
                      "kind": "Text",
                      "bounds": { "x": 80, "y": 80, "width": 280, "height": 48 },
                      "text": "Native CLI Smoke",
                      "style": {
                        "color": "#f7f3e8",
                        "fontFamily": ["Qua Sans"],
                        "fontSize": 30,
                        "fontWeight": "bold",
                        "lineHeight": 38,
                        "textAlign": "center"
                      }
                    }
                  ]
                }
              },
              "provenance": { "contentPackageId": "runtime.ui" }
            }
          ]
        }
      }
    }
    "##
}
