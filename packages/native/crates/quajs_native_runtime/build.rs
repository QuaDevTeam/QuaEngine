fn main() {
    println!("cargo:rerun-if-env-changed=BUN_WEBKIT_VERSION");
    // Keep host metadata aligned with the exact otter-jsc-sys distribution,
    // including a deliberately overridden build supplied by a release builder.
    let version = std::env::var("BUN_WEBKIT_VERSION")
        .unwrap_or_else(|_| "aaf3f80b1cc701b412f8abfb7c7f413644a229ff".into());
    println!("cargo:rustc-env=QUA_JSC_WINDOWS_BUILD={version}");
}
