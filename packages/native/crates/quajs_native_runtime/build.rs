use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf};

fn link_mobile_jsc(platform: &str) {
    println!("cargo:rerun-if-changed=mobile-jsc.json");
    let manifest: serde_json::Value =
        serde_json::from_str(include_str!("mobile-jsc.json")).unwrap();
    let distribution = &manifest[platform];
    println!(
        "cargo:rustc-env=QUA_MOBILE_JSC_VERSION={}",
        distribution["runtimeVersion"].as_str().unwrap()
    );
    if platform == "android" {
        assert_eq!(
            env::var("CARGO_CFG_TARGET_ARCH").as_deref(),
            Ok("aarch64"),
            "Android JSC is qualified for arm64-v8a only"
        );
        println!("cargo:rerun-if-env-changed=QUA_ANDROID_JSC_LIB_DIR");
        let directory = PathBuf::from(env::var_os("QUA_ANDROID_JSC_LIB_DIR").expect(
            "Run packages/native/sdk/prepare-android-jsc.py and set QUA_ANDROID_JSC_LIB_DIR",
        ));
        let library = directory.join("libjsc.so");
        println!("cargo:rerun-if-changed={}", library.display());
        let digest = Sha256::digest(fs::read(library).expect("read Android arm64-v8a libjsc.so"));
        assert_eq!(
            format!("{digest:x}"),
            distribution["librarySha256"].as_str().unwrap(),
            "Unexpected Android JavaScriptCore binary"
        );
        println!("cargo:rustc-link-search=native={}", directory.display());
    }
}

fn main() {
    let platform = env::var("CARGO_CFG_TARGET_OS").unwrap();
    if matches!(platform.as_str(), "android" | "ios")
        && env::var_os("CARGO_FEATURE_JAVASCRIPTCORE").is_some()
    {
        link_mobile_jsc(&platform);
    }
    println!("cargo:rerun-if-env-changed=BUN_WEBKIT_VERSION");
    // Keep host metadata aligned with the exact otter-jsc-sys distribution,
    // including a deliberately overridden build supplied by a release builder.
    let version = std::env::var("BUN_WEBKIT_VERSION")
        .unwrap_or_else(|_| "aaf3f80b1cc701b412f8abfb7c7f413644a229ff".into());
    println!("cargo:rustc-env=QUA_JSC_WINDOWS_BUILD={version}");
}
