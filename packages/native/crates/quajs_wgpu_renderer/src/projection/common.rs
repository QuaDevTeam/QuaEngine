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
        let mut package_ids = self.required_runtime_packages.clone();
        if let Some(package_id) = &self.content_package_id {
            package_ids.insert(package_id.clone());
        }
        package_ids
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
    if normalized.starts_with('/')
        || has_uri_scheme(&normalized)
        || normalized.split('/').any(|segment| segment == "..")
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

const FORBIDDEN_NATIVE_PAYLOAD_EXTENSIONS: [&str; 16] = [
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
            "/abs/menu.png",
            "https://example.test/menu.png",
            "ui/../menu.png",
            "ui/native.dll",
            "ui/native.dll?v=1",
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
}
