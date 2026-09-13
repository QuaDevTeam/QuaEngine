use serde_json::json;

use crate::startup::{platform_manifest_value, profile_manifest_value};

use super::*;

mod fixtures;
mod loading;
mod metadata;
mod target_core;

pub(crate) use fixtures::*;
