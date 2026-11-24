use std::sync::Arc;

/// Encoded bytes may be borrowed for synchronous drawing or shared with an upload worker.
pub trait ImageUploadBytes: AsRef<[u8]> {
    fn into_shared(self) -> Arc<[u8]>;
}

impl<T: AsRef<[u8]> + ?Sized> ImageUploadBytes for &T {
    fn into_shared(self) -> Arc<[u8]> {
        Arc::from(self.as_ref())
    }
}

impl ImageUploadBytes for Arc<[u8]> {
    fn into_shared(self) -> Arc<[u8]> {
        self
    }
}
