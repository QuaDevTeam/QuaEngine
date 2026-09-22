fn main() {
    println!("cargo:rerun-if-changed=src/window_smoke/editor_surface.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
        && std::env::var_os("CARGO_FEATURE_NATIVE_WINDOW").is_some()
    {
        cc::Build::new()
            .file("src/window_smoke/editor_surface.m")
            .flag("-fobjc-arc")
            .compile("qua_editor_surface");
        for framework in ["AppKit", "QuartzCore", "CoreGraphics", "Metal"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
}
