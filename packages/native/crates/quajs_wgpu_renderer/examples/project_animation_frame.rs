//! Audit adapter for the real Rust frame clock. No assets or engine state are
//! loaded here; the resulting frame goes through the normal product renderer.
use quajs_wgpu_renderer::projection_runtime::NativeRendererProjectionRuntime;
use serde_json::{json, Value};
use std::io::{self, BufRead};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    for line in io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line?)?;
        let mut runtime =
            NativeRendererProjectionRuntime::from_frame_json(&request["frame"].to_string())?;
        let result = runtime
            .project_at_epoch_ms(request["nowMs"].as_f64().ok_or("nowMs must be numeric")?)?;
        println!(
            "{}",
            json!({"frame":serde_json::from_str::<Value>(&result.json)?,"localWorkActive":result.local_work_active})
        );
    }
    Ok(())
}
