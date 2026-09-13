use std::collections::BTreeSet;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ResourceId(String);

impl ResourceId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for ResourceId {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl From<String> for ResourceId {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum NativeResourceKind {
    Texture,
    Buffer,
    GlyphAtlas,
    FontFace,
    DecodedImage,
    VideoDecoder,
    VideoFrameQueue,
    VideoTextureRing,
    AudioBuffer,
    AudioStream,
    AudioHandle,
    UiAst,
    QssStyle,
    TokenTable,
    RenderGraph,
    Other,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ResourceMemory {
    pub cpu_bytes: u64,
    pub gpu_bytes: u64,
}

impl ResourceMemory {
    pub fn total_bytes(self) -> u64 {
        self.cpu_bytes.saturating_add(self.gpu_bytes)
    }

    pub(crate) fn add_assign(&mut self, other: ResourceMemory) {
        self.cpu_bytes = self.cpu_bytes.saturating_add(other.cpu_bytes);
        self.gpu_bytes = self.gpu_bytes.saturating_add(other.gpu_bytes);
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeResourceRecord {
    pub id: ResourceId,
    pub kind: NativeResourceKind,
    pub owner_package_id: Option<String>,
    pub required_package_ids: BTreeSet<String>,
    pub memory: ResourceMemory,
    pub label: Option<String>,
}

impl NativeResourceRecord {
    pub fn new(id: impl Into<ResourceId>, kind: NativeResourceKind) -> Self {
        Self {
            id: id.into(),
            kind,
            owner_package_id: None,
            required_package_ids: BTreeSet::new(),
            memory: ResourceMemory::default(),
            label: None,
        }
    }

    pub fn owned_by(mut self, package_id: impl Into<String>) -> Self {
        self.owner_package_id = Some(package_id.into());
        self
    }

    pub fn require_package(mut self, package_id: impl Into<String>) -> Self {
        self.required_package_ids.insert(package_id.into());
        self
    }

    pub fn require_packages<I, S>(mut self, package_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for package_id in package_ids {
            self.required_package_ids.insert(package_id.into());
        }
        self
    }

    pub fn memory(mut self, cpu_bytes: u64, gpu_bytes: u64) -> Self {
        self.memory = ResourceMemory {
            cpu_bytes,
            gpu_bytes,
        };
        self
    }

    pub fn label(mut self, label: impl Into<String>) -> Self {
        self.label = Some(label.into());
        self
    }
}
