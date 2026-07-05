pub(in super::super::super) fn json_frame_with_remote_provenance_package_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "background": {
          "mode": "image",
          "provenance": {
            "contentPackageId": "https://example.invalid/runtime.ui"
          }
        }
      }
    }
    "#
}

pub(in super::super::super) fn json_frame_with_traversal_required_package_input() -> &'static str {
    r#"
    {
      "container": { "width": 1600, "height": 1000 },
      "view": {
        "ui": {
          "visible": true,
          "overlays": [
            {
              "elementId": "menu",
              "surface": {
                "key": "ui/menu.qui",
                "root": {
                  "id": "root",
                  "kind": "Box",
                  "visible": true,
                  "provenance": {
                    "contentPackageId": "runtime.ui",
                    "requiredRuntimePackages": ["runtime.fonts", "../base"]
                  }
                }
              }
            }
          ]
        }
      }
    }
    "#
}
