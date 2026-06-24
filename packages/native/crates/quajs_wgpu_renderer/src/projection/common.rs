use std::collections::BTreeSet;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackageProvenance {
    pub content_package_id: Option<String>,
    pub required_runtime_packages: BTreeSet<String>,
}

impl PackageProvenance {
    pub fn package_ids(&self) -> BTreeSet<String> {
        let mut package_ids = self.required_runtime_packages.clone();
        if let Some(package_id) = &self.content_package_id {
            package_ids.insert(package_id.clone());
        }
        package_ids
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
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

#[derive(Clone, Debug, PartialEq, Eq)]
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
