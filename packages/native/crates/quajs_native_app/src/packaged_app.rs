//! Distribution startup is rooted at the executable, never the working directory.
//! The signed executable pins the launch manifest, which pins every QPK and target manifest.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PackagedApp {
    pub app_asset: String,
    pub bundles: Vec<PackagedResource>,
    pub target_manifest_sha256: String,
    #[serde(skip)]
    pub resources: PathBuf,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PackagedResource {
    pub file: String,
    pub sha256: String,
}

static APP: OnceLock<PackagedApp> = OnceLock::new();

pub(crate) fn enabled() -> bool {
    option_env!("QUA_NATIVE_DISTRIBUTION_SHA256").is_some_and(|value| !value.is_empty())
}

pub(crate) fn config() -> Option<&'static PackagedApp> {
    APP.get()
}

pub(crate) fn initialize() -> Result<(), Box<dyn std::error::Error>> {
    if !enabled() {
        return Ok(());
    }
    let executable = std::env::current_exe()?;
    let parent = executable
        .parent()
        .ok_or("Executable has no parent directory")?;
    let resources = if cfg!(target_os = "macos") {
        parent.join("../Resources")
    } else {
        parent.join("resources")
    };
    let bytes = read_verified(
        &resources.join("native-app.json"),
        option_env!("QUA_NATIVE_DISTRIBUTION_SHA256").unwrap_or(""),
    )?;
    let mut app: PackagedApp = serde_json::from_slice(&bytes)?;
    if app.app_asset.contains(['\\', ':'])
        || app
            .app_asset
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || ![".js", ".mjs", ".cjs"]
            .iter()
            .any(|extension| app.app_asset.ends_with(extension))
    {
        return Err("Invalid packaged app asset".into());
    }
    if app.bundles.is_empty() || app.bundles.len() > 128 {
        return Err("Packaged application requires 1–128 QPK bundles".into());
    }
    for bundle in &app.bundles {
        if bundle.file.contains(['/', '\\']) || !bundle.file.ends_with(".qpk") {
            return Err("Invalid packaged QPK filename".into());
        }
    }
    app.resources = resources;
    APP.set(app)
        .map_err(|_| "Packaged application initialized twice")?;
    Ok(())
}

pub(crate) fn read_verified(path: &Path, expected: &str) -> Result<Vec<u8>, std::io::Error> {
    if std::fs::metadata(path)?.len() > 1024 * 1024 * 1024 {
        return Err(std::io::Error::other("Packaged resource exceeds 1 GiB"));
    }
    let bytes = std::fs::read(path)?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if digest != expected {
        return Err(std::io::Error::other(format!(
            "Packaged resource integrity check failed: {}",
            path.display()
        )));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pinned_resources_reject_modified_bytes() {
        let path =
            std::env::temp_dir().join(format!("qua-distribution-integrity-{}", std::process::id()));
        std::fs::write(&path, b"original").unwrap();
        let hash = format!("{:x}", Sha256::digest(b"original"));
        assert_eq!(read_verified(&path, &hash).unwrap(), b"original");
        std::fs::write(&path, b"modified").unwrap();
        assert!(read_verified(&path, &hash).is_err());
        std::fs::remove_file(path).unwrap();
    }
}
