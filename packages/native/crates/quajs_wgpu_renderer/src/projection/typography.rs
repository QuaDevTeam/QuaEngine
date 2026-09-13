use crate::render_graph::FontWeightDrawParam;
use crate::resources::ResourceId;

use super::common::{FontFamilyProjection, FontWeightProjection};
use super::safety::is_safe_native_font_family_name;

pub fn font_family_to_draw_param(font_family: &Option<FontFamilyProjection>) -> Vec<String> {
    font_family
        .as_ref()
        .map(|font_family| {
            font_family
                .families
                .iter()
                .map(|family| family.trim())
                .filter(|family| is_safe_native_font_family_name(family))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

pub fn font_weight_to_draw_param(
    font_weight: &Option<FontWeightProjection>,
) -> Option<FontWeightDrawParam> {
    match font_weight {
        Some(FontWeightProjection::Number(weight)) if (1..=1000).contains(weight) => {
            Some(FontWeightDrawParam::Number(*weight))
        }
        Some(FontWeightProjection::Keyword(keyword)) => {
            let keyword = keyword.trim();
            if keyword.is_empty() {
                None
            } else {
                Some(FontWeightDrawParam::Keyword(keyword.to_string()))
            }
        }
        _ => None,
    }
}

pub fn font_family_resource_ids(families: &[String]) -> Vec<ResourceId> {
    families
        .iter()
        .map(|family| family.trim())
        .filter(|family| is_safe_native_font_family_name(family))
        .map(|family| ResourceId::new(format!("fonts:{family}")))
        .collect()
}
