mod checks;
mod load;
mod report;
mod types;

pub use load::{load_renderer_smoke_budget, NativeRendererSmokeBudgetLoadError};
pub use report::NativeRendererSmokeBudgetReport;

pub const RENDERER_SMOKE_BUDGET_ENV: &str = "QUA_NATIVE_RENDERER_SMOKE_BUDGET";

#[cfg(test)]
pub use types::NativeRendererSmokeBudget;

#[cfg(test)]
mod tests;
