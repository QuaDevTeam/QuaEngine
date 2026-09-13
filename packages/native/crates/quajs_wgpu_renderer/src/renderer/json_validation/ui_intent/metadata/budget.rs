pub(super) const MAX_NATIVE_UI_INTENT_METADATA_ENTRIES: usize = 32;
pub(super) const MAX_NATIVE_UI_INTENT_METADATA_TOTAL_BYTES: usize = 16 * 1024;
pub(super) const MAX_NATIVE_UI_INTENT_METADATA_STRING_BYTES: usize = 4 * 1024;
pub(super) const MAX_NATIVE_UI_INTENT_METADATA_DEPTH: usize = 8;
pub(super) const MAX_NATIVE_UI_INTENT_METADATA_ARRAY_ITEMS: usize = 128;
pub(super) const MAX_NATIVE_UI_INTENT_METADATA_OBJECT_FIELDS: usize = 64;

#[derive(Default)]
pub(super) struct MetadataBudget {
    total_bytes: usize,
}

impl MetadataBudget {
    pub(super) fn add_bytes(
        &mut self,
        path: &str,
        bytes: usize,
    ) -> Option<(String, String, String)> {
        self.total_bytes = self.total_bytes.saturating_add(bytes);
        if self.total_bytes > MAX_NATIVE_UI_INTENT_METADATA_TOTAL_BYTES {
            return Some((
                path.to_string(),
                self.total_bytes.to_string(),
                "UI intent metadata must stay within native renderer payload limits".to_string(),
            ));
        }
        None
    }
}
