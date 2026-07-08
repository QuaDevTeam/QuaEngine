mod assets;
mod records;
mod sync;

pub use assets::plan_font_asset_requests;
pub use records::{font_face_resource_id, font_resource_records};
pub use sync::{plan_font_resource_sync, FontResourceSyncPlan};

#[cfg(test)]
mod tests;
