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
