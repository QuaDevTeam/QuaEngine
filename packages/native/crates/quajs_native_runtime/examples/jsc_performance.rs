//! Reproducible in-process bridge costs; run with --features javascriptcore.
//! This measures bridge work, not a full game's frame rate.
use quajs_native_runtime::*;
use std::time::Instant;

fn main() {
    let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
    let code = r#"
        export default function story() {
            return [{ uuid: 'bench.dialogue', async run(ctx) {
                await ctx.engine.showDialogue({ characterName: 'Mira', text: 'Hello from QuaScript' });
            }}];
        }
        const view = { characters: [], dialogue: { text: 'a'.repeat(32768) } };
        export function project() {
            __quaNativePipelineBridge.emit('view/update', { view });
        }
    "#;
    let namespace = evaluator
        .evaluate_module(&JscEvaluationRequest {
            module: JscRuntimeModuleRecord {
                asset_name: "scripts/performance.js".into(),
                bundle_name: "benchmark".into(),
                package_id: "benchmark".into(),
                kind: JscRuntimeModuleKind::Script,
                code: code.into(),
                bytes: code.as_bytes().to_vec(),
            },
            module_graph: vec![],
            limits: JscSandboxLimits::default(),
        })
        .unwrap()
        .module_namespace_id
        .unwrap();
    let steps = evaluator
        .call_game_step_factory(&JscGameStepFactoryCallRequest {
            module_namespace_id: namespace.clone(),
            export_name: "default".into(),
            scope_json: None,
        })
        .unwrap()
        .steps
        .unwrap();
    let request = JscGameStepRunRequest {
        run_handle_id: steps[0].run_handle_id.clone(),
        ctx_json: None,
    };
    let projection = JscModuleExportCallRequest {
        module_namespace_id: namespace,
        export_name: "project".into(),
        args_json: None,
    };
    for _ in 0..100 {
        evaluator.call_game_step_run(&request).unwrap();
    }
    for sample in 0..5 {
        let started = Instant::now();
        for _ in 0..2000 {
            evaluator.call_game_step_run(&request).unwrap();
        }
        let steps_us = started.elapsed().as_secs_f64() * 1e6 / 2000.0;
        let started = Instant::now();
        for _ in 0..1000 {
            evaluator.call_module_export(&projection).unwrap();
            assert_eq!(evaluator.drain_native_pipeline_messages().unwrap().len(), 1);
        }
        let projection_us = started.elapsed().as_secs_f64() * 1e6 / 1000.0;
        println!("{{\"sample\":{sample},\"step_us\":{steps_us:.3},\"projection_32k_us\":{projection_us:.3}}}");
    }
}
