use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageProvenance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_package_id: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    pub required_runtime_packages: BTreeSet<String>,
}

impl PackageProvenance {
    pub fn is_empty(&self) -> bool {
        self.content_package_id.is_none() && self.required_runtime_packages.is_empty()
    }

    pub fn package_ids(&self) -> BTreeSet<String> {
        let mut package_ids = self
            .safe_required_runtime_packages()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>();
        if let Some(package_id) = self.safe_content_package_id() {
            package_ids.insert(package_id.to_string());
        }
        package_ids
    }

    pub(crate) fn safe_content_package_id(&self) -> Option<&str> {
        self.content_package_id
            .as_deref()
            .filter(|package_id| is_safe_native_package_id(package_id))
    }

    pub(crate) fn safe_required_runtime_packages(&self) -> impl Iterator<Item = &str> {
        self.required_runtime_packages
            .iter()
            .map(String::as_str)
            .filter(|package_id| is_safe_native_package_id(package_id))
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct FontFamilyProjection {
    pub families: Vec<String>,
}

impl FontFamilyProjection {
    pub fn new<I, S>(families: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            families: families.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum FontWeightProjection {
    Number(u16),
    Keyword(String),
}

impl FontWeightProjection {
    pub fn number(weight: u16) -> Self {
        Self::Number(weight)
    }

    pub fn keyword(keyword: impl Into<String>) -> Self {
        Self::Keyword(keyword.into())
    }
}

pub(crate) fn is_safe_native_asset_name(asset_name: &str) -> bool {
    let base_name = strip_asset_reference_suffix(asset_name);
    if asset_name.trim().is_empty()
        || base_name.trim().is_empty()
        || asset_name.trim() != asset_name
        || asset_name.chars().any(char::is_control)
        || asset_name.contains('\\')
    {
        return false;
    }

    let normalized = asset_name.replace('\\', "/");
    let normalized_base_name = base_name.replace('\\', "/");
    if normalized.starts_with('/')
        || has_uri_scheme(&normalized)
        || normalized_base_name.ends_with('/')
        || normalized_base_name
            .split('/')
            .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
    {
        return false;
    }

    !is_forbidden_native_payload_reference(&normalized)
}

pub(crate) fn is_safe_native_asset_type(asset_type: &str) -> bool {
    !asset_type.trim().is_empty()
        && asset_type.trim() == asset_type
        && matches!(asset_type.chars().next(), Some(char) if char.is_ascii_alphanumeric())
        && asset_type
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'))
}

pub(crate) fn is_safe_native_asset_ref(asset_type: &str, asset_name: &str) -> bool {
    is_safe_native_asset_type(asset_type) && is_safe_native_asset_name(asset_name)
}

pub(crate) fn is_safe_native_package_id(package_id: &str) -> bool {
    if package_id.trim().is_empty()
        || package_id.trim() != package_id
        || package_id.chars().any(char::is_control)
        || has_uri_scheme(package_id)
        || package_id.contains(['?', '#'])
        || package_id.starts_with('/')
    {
        return false;
    }

    let normalized = package_id.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..")
        || package_id.contains("..")
        || package_id.contains(['/', '\\'])
    {
        return false;
    }

    package_id
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_'))
}

pub(crate) fn is_safe_native_dispatch_identifier(value: &str) -> bool {
    if value.trim().is_empty()
        || value.trim() != value
        || value.chars().any(char::is_control)
        || has_forbidden_native_dispatch_uri_scheme(value)
        || value.contains(['?', '#'])
        || value.starts_with('/')
    {
        return false;
    }

    let normalized = value.replace('\\', "/");
    if normalized.split('/').any(|segment| segment == "..")
        || value.contains("..")
        || value.contains(['/', '\\'])
        || is_forbidden_native_payload_reference(value)
        || !value.chars().any(|char| char.is_ascii_alphanumeric())
    {
        return false;
    }

    value
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_' | ':'))
}

pub(crate) fn insert_unique_safe_native_dispatch_identifier(
    seen: &mut BTreeSet<String>,
    value: &str,
) -> bool {
    is_safe_native_dispatch_identifier(value) && seen.insert(value.to_string())
}

fn is_forbidden_native_payload_reference(asset_name: &str) -> bool {
    let normalized = strip_asset_reference_suffix(asset_name).to_ascii_lowercase();
    FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS.iter().any(|extension| {
        normalized.ends_with(extension) || normalized.contains(&format!("{extension}/"))
    })
}

fn strip_asset_reference_suffix(asset_name: &str) -> &str {
    asset_name
        .split_once(['?', '#'])
        .map(|(base, _)| base)
        .unwrap_or(asset_name)
}

fn has_uri_scheme(value: &str) -> bool {
    let Some(index) = value.find(':') else {
        return false;
    };
    let scheme = &value[..index];
    !scheme.is_empty()
        && scheme.chars().enumerate().all(|(index, char)| {
            if index == 0 {
                char.is_ascii_alphabetic()
            } else {
                char.is_ascii_alphanumeric() || matches!(char, '+' | '-' | '.')
            }
        })
}

fn has_forbidden_native_dispatch_uri_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };

    matches!(
        scheme.to_ascii_lowercase().as_str(),
        "http"
            | "https"
            | "file"
            | "data"
            | "blob"
            | "javascript"
            | "native"
            | "shell"
            | "ffi"
            | "node"
            | "wasm"
    )
}

const FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS: [&str; 17] = [
    ".dylib",
    ".so",
    ".dll",
    ".framework",
    ".bundle",
    ".node",
    ".wasm",
    ".wasi",
    ".exe",
    ".msi",
    ".app",
    ".pkg",
    ".deb",
    ".rpm",
    ".appimage",
    ".jar",
    ".class",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_safe_native_asset_names() {
        assert!(is_safe_native_asset_name("ui/menu.png"));
        assert!(is_safe_native_asset_name("ui/menu.png?v=1#hash"));

        for asset_name in [
            "",
            "   ",
            "?v=1",
            "#hash",
            " ui/menu.png",
            "ui/menu.png ",
            "ui\\menu.png",
            "ui/",
            "ui/?v=1",
            "ui//menu.png",
            "ui/./menu.png",
            "/abs/menu.png",
            "https://example.test/menu.png",
            "ui/../menu.png",
            "ui/native.dll",
            "ui/native.dll?v=1",
            "ui/native.class?rev=1",
            "ui/plugin.framework/Contents/bin",
            "ui/module.wasm#hash",
            "ui/menu.png\n",
        ] {
            assert!(
                !is_safe_native_asset_name(asset_name),
                "asset name should be unsafe: {asset_name:?}"
            );
        }
    }

    #[test]
    fn validates_safe_native_package_ids() {
        assert!(is_safe_native_package_id("base"));
        assert!(is_safe_native_package_id("runtime.ui-1"));
        assert!(is_safe_native_package_id("runtime_ui"));

        for package_id in [
            "",
            "   ",
            " runtime.ui",
            "runtime.ui ",
            "runtime/ui",
            "runtime\\ui",
            "/runtime.ui",
            "https://example.test/runtime.ui",
            "runtime.ui?rev=1",
            "runtime.ui#hash",
            "runtime..ui",
            "../runtime.ui",
            "runtime:ui",
            "runtime ui",
            "runtime.ui\n",
        ] {
            assert!(
                !is_safe_native_package_id(package_id),
                "package id should be unsafe: {package_id:?}"
            );
        }
    }

    #[test]
    fn validates_safe_native_dispatch_identifiers() {
        assert!(is_safe_native_dispatch_identifier("base"));
        assert!(is_safe_native_dispatch_identifier("runtime.ui-1"));
        assert!(is_safe_native_dispatch_identifier("runtime_ui"));
        assert!(is_safe_native_dispatch_identifier("choice:a"));

        for identifier in [
            "",
            "   ",
            " runtime.ui",
            "runtime.ui ",
            "runtime/ui",
            "runtime\\ui",
            "/runtime.ui",
            "https://example.test/runtime.ui",
            "native:open",
            "shell:open",
            "runtime.ui?rev=1",
            "runtime.ui#hash",
            "runtime..ui",
            "../runtime.ui",
            "runtime ui",
            "runtime.ui\n",
            "---",
            "native.dll",
            "plugin.framework",
        ] {
            assert!(
                !is_safe_native_dispatch_identifier(identifier),
                "dispatch identifier should be unsafe: {identifier:?}"
            );
        }
    }

    #[test]
    fn inserts_unique_safe_native_dispatch_identifiers() {
        let mut seen = BTreeSet::new();

        assert!(insert_unique_safe_native_dispatch_identifier(
            &mut seen, "choice:a"
        ));
        assert!(!insert_unique_safe_native_dispatch_identifier(
            &mut seen, "choice:a"
        ));
        assert!(!insert_unique_safe_native_dispatch_identifier(
            &mut seen,
            "bad/choice"
        ));
        assert!(insert_unique_safe_native_dispatch_identifier(
            &mut seen, "choice:b"
        ));
        assert_eq!(
            seen,
            ["choice:a".to_string(), "choice:b".to_string()]
                .into_iter()
                .collect()
        );
    }

    #[test]
    fn package_ids_skip_unsafe_provenance_ids() {
        let provenance = PackageProvenance {
            content_package_id: Some("https://example.test/runtime.ui".to_string()),
            required_runtime_packages: [
                "base".to_string(),
                "runtime.good".to_string(),
                "runtime/bad".to_string(),
                "runtime..bad".to_string(),
            ]
            .into_iter()
            .collect(),
        };

        assert_eq!(
            provenance.package_ids(),
            ["base".to_string(), "runtime.good".to_string()]
                .into_iter()
                .collect()
        );
    }
}
