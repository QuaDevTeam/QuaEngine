use crate::render_graph::FontWeightDrawParam;

use super::common::{FontFamilyProjection, FontWeightProjection};

pub fn font_family_to_draw_param(font_family: &Option<FontFamilyProjection>) -> Vec<String> {
    font_family
        .as_ref()
        .map(|font_family| {
            font_family
                .families
                .iter()
                .map(|family| family.trim())
                .filter(|family| !family.is_empty())
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
