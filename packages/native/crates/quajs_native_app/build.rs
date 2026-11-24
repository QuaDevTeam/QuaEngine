fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android")
        && std::env::var_os("CARGO_FEATURE_NATIVE_WINDOW").is_some()
    {
        println!("cargo:rerun-if-changed=src/window_smoke/android_gamepad.c");
        cc::Build::new()
            .file("src/window_smoke/android_gamepad.c")
            .compile("qua_android_input");
        // These flags apply only to the app's own final link. Both calls still
        // reach libandroid; no platform library or external process is modified.
        for function in ["AInputQueue_preDispatchEvent", "AInputQueue_finishEvent"] {
            println!("cargo:rustc-link-arg=-Wl,--wrap={function}");
        }
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios")
        && std::env::var_os("CARGO_FEATURE_NATIVE_WINDOW").is_some()
    {
        println!("cargo:rerun-if-changed=src/window_smoke/ios_scene.m");
        cc::Build::new()
            .file("src/window_smoke/ios_scene.m")
            .flag("-fobjc-arc")
            .compile("qua_ios_scene");
        println!("cargo:rustc-link-arg-bin=quajs_native_app=-lqua_ios_scene");
        println!("cargo:rustc-link-lib=framework=UIKit");
    }

    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("macos" | "ios")
    ) && std::env::var_os("CARGO_FEATURE_NATIVE_WINDOW").is_some()
    {
        println!("cargo:rerun-if-changed=src/window_smoke/apple_gamepad.m");
        cc::Build::new()
            .file("src/window_smoke/apple_gamepad.m")
            .flag("-fobjc-arc")
            .compile("qua_gamepad");
        println!("cargo:rustc-link-arg-bin=quajs_native_app=-lqua_gamepad");
        println!("cargo:rustc-link-arg-bin=quajs_native_app=-Wl,-framework,GameController");
        println!("cargo:rustc-link-lib=framework=GameController");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    println!("cargo:rerun-if-changed=src/window_smoke/editor_surface.m");
    println!("cargo:rerun-if-changed=src/window_smoke/display_color.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
        && std::env::var_os("CARGO_FEATURE_NATIVE_WINDOW").is_some()
    {
        cc::Build::new()
            .file("src/window_smoke/editor_surface.m")
            .file("src/window_smoke/display_color.m")
            .flag("-fobjc-arc")
            .compile("qua_editor_surface");
        // Cargo directs rustc-link-lib metadata to this package's SDK library.
        // The standalone window binary owns these Objective-C entry points.
        println!("cargo:rustc-link-arg-bin=quajs_native_app=-lqua_editor_surface");
        for framework in ["AppKit", "QuartzCore", "CoreGraphics", "Metal"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
}
