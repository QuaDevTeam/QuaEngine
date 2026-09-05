use super::super::primitive::WgpuNativeRenderPrimitivePlan;
use super::pass::WgpuNativeRenderMeshPass;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WgpuNativeRenderMeshPlan {
    pub revision: u64,
    pub pass_count: usize,
    pub quad_count: usize,
    pub visible_quad_count: usize,
    pub skipped_quad_count: usize,
    pub invalid_paint_count: usize,
    pub passes: Vec<WgpuNativeRenderMeshPass>,
}

impl WgpuNativeRenderMeshPlan {
    pub fn from_primitive_plan(primitive_plan: &WgpuNativeRenderPrimitivePlan) -> Self {
        Self::from_primitive_plan_with_texture_dimensions(primitive_plan, &Default::default())
    }

    pub fn from_primitive_plan_with_texture_dimensions(
        primitive_plan: &WgpuNativeRenderPrimitivePlan,
        dimensions: &std::collections::BTreeMap<String, (u32, u32)>,
    ) -> Self {
        let passes = primitive_plan
            .passes
            .iter()
            .map(|pass| WgpuNativeRenderMeshPass::from_primitive_pass(pass, dimensions))
            .collect::<Vec<_>>();
        let quad_count = passes.iter().map(|pass| pass.quad_count).sum();
        let visible_quad_count = passes.iter().map(|pass| pass.visible_quad_count).sum();
        let skipped_quad_count = passes.iter().map(|pass| pass.skipped_quad_count).sum();
        let invalid_paint_count = passes.iter().map(|pass| pass.invalid_paint_count).sum();

        Self {
            revision: primitive_plan.revision,
            pass_count: primitive_plan.pass_count,
            quad_count,
            visible_quad_count,
            skipped_quad_count,
            invalid_paint_count,
            passes,
        }
    }
}
