use std::collections::BTreeMap;
use std::ffi::CStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use rquickjs::{Context, Module, Object, Persistent, Runtime};

use super::{
    validate_quickjs_evaluation_request, QuickJsEvaluationError, QuickJsEvaluationErrorCode,
    QuickJsEvaluationRequest, QuickJsEvaluationResponse, QuickJsEvaluationResult,
    QuickJsModuleEvaluator, QuickJsSandboxLimits,
};

pub const RQUICKJS_BACKEND_VERSION: &str = "rquickjs-0.12.1";

pub fn quickjs_rquickjs_runtime_version() -> &'static str {
    static VERSION: OnceLock<&'static str> = OnceLock::new();
    VERSION.get_or_init(|| {
        let quickjs_version = unsafe {
            let version = rquickjs::qjs::JS_GetVersion();
            if version.is_null() {
                "unknown".to_string()
            } else {
                CStr::from_ptr(version).to_string_lossy().into_owned()
            }
        };
        Box::leak(format!("quickjs-{quickjs_version};{RQUICKJS_BACKEND_VERSION}").into_boxed_str())
    })
}

pub struct RquickJsModuleEvaluator {
    namespaces: BTreeMap<String, Persistent<Object<'static>>>,
    next_namespace_index: u64,
    context: Context,
    runtime: Runtime,
}

impl RquickJsModuleEvaluator {
    pub fn new() -> Result<Self, QuickJsEvaluationError> {
        let runtime = Runtime::new().map_err(backend_error)?;
        let context = Context::full(&runtime).map_err(backend_error)?;
        Ok(Self {
            namespaces: BTreeMap::new(),
            next_namespace_index: 0,
            context,
            runtime,
        })
    }

    pub fn contains_module_namespace(&self, module_namespace_id: &str) -> bool {
        self.namespaces.contains_key(module_namespace_id)
    }

    pub fn namespace_count(&self) -> usize {
        self.namespaces.len()
    }

    fn apply_limits(&mut self, limits: &QuickJsSandboxLimits) {
        self.runtime
            .set_memory_limit(saturating_u64_to_usize(limits.max_heap_bytes));
        self.runtime
            .set_max_stack_size(saturating_u64_to_usize(limits.max_stack_bytes));

        let max_execution_ticks = limits.max_execution_ticks;
        let ticks = Arc::new(AtomicU64::new(0));
        self.runtime.set_interrupt_handler(Some(Box::new(move || {
            if max_execution_ticks == 0 {
                return true;
            }
            ticks.fetch_add(1, Ordering::Relaxed) >= max_execution_ticks
        })));
    }

    fn clear_interrupt_handler(&mut self) {
        self.runtime.set_interrupt_handler(None);
    }

    fn next_namespace_id(&mut self) -> String {
        self.next_namespace_index = self.next_namespace_index.saturating_add(1);
        format!("quickjs:rquickjs:{}", self.next_namespace_index)
    }
}

impl QuickJsModuleEvaluator for RquickJsModuleEvaluator {
    fn evaluate_module(&mut self, request: &QuickJsEvaluationRequest) -> QuickJsEvaluationResult {
        validate_quickjs_evaluation_request(request)?;
        self.apply_limits(&request.limits);
        let result: rquickjs::Result<Persistent<Object<'static>>> = self.context.with(|ctx| {
            let module = Module::declare(
                ctx.clone(),
                request.module.asset_name.as_bytes(),
                request.module.code.as_bytes(),
            )?;
            let (module, promise) = module.eval()?;
            promise.finish::<()>()?;
            let namespace = module.namespace()?;
            Ok(Persistent::save(&ctx, namespace))
        });
        self.clear_interrupt_handler();

        match result {
            Ok(namespace) => {
                let module_namespace_id = self.next_namespace_id();
                self.namespaces
                    .insert(module_namespace_id.clone(), namespace);
                Ok(QuickJsEvaluationResponse::success(module_namespace_id))
            }
            Err(error) => Err(QuickJsEvaluationError {
                code: QuickJsEvaluationErrorCode::EvaluationFailed,
                message: format!(
                    "QuickJS failed to evaluate runtime module \"{}\".",
                    request.module.asset_name
                ),
                asset_name: Some(request.module.asset_name.clone()),
                detail: Some(error.to_string()),
            }),
        }
    }

    fn release_module_namespace(&mut self, module_namespace_id: &str) {
        self.namespaces.remove(module_namespace_id);
    }
}

fn backend_error(error: rquickjs::Error) -> QuickJsEvaluationError {
    QuickJsEvaluationError {
        code: QuickJsEvaluationErrorCode::UnsupportedRuntime,
        message: "QuickJS evaluator backend could not be initialized.".to_string(),
        asset_name: None,
        detail: Some(error.to_string()),
    }
}

fn saturating_u64_to_usize(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quickjs::{
        evaluate_quickjs_module_with_registry, QuickJsModuleNamespaceRegistry,
        QuickJsRuntimeModuleKind, QuickJsRuntimeModuleRecord,
    };

    #[test]
    fn reports_real_quickjs_version_when_backend_feature_is_enabled() {
        let version = quickjs_rquickjs_runtime_version();

        assert!(version.starts_with("quickjs-"));
        assert!(version.contains(RQUICKJS_BACKEND_VERSION));
    }

    #[test]
    fn evaluates_es_module_and_keeps_namespace_handle_until_release() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let request = request_for_code(
            "scripts/opening.js",
            "export const title = 'Opening'; export default function opening() { return title; }",
        );

        let response = evaluator.evaluate_module(&request).unwrap();

        assert!(response.ok);
        let namespace_id = response.module_namespace_id.unwrap();
        assert!(namespace_id.starts_with("quickjs:rquickjs:"));
        assert!(evaluator.contains_module_namespace(&namespace_id));
        assert_eq!(
            exported_string(&evaluator, &namespace_id, "title"),
            "Opening"
        );

        evaluator.release_module_namespace(&namespace_id);

        assert!(!evaluator.contains_module_namespace(&namespace_id));
    }

    #[test]
    fn returns_structured_error_for_invalid_js_module() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let error = evaluator
            .evaluate_module(&request_for_code("scripts/broken.js", "export const = ;"))
            .unwrap_err();

        assert_eq!(error.code, QuickJsEvaluationErrorCode::EvaluationFailed);
        assert_eq!(error.asset_name, Some("scripts/broken.js".to_string()));
        assert!(error.detail.unwrap().len() > 0);
    }

    #[test]
    fn honors_interrupt_limit_for_long_running_modules() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let mut request = request_for_code(
            "scripts/loop.js",
            "while (true) {} export const unreachable = true;",
        );
        request.limits.max_execution_ticks = 1;

        let error = evaluator.evaluate_module(&request).unwrap_err();

        assert_eq!(error.code, QuickJsEvaluationErrorCode::EvaluationFailed);
        assert_eq!(error.asset_name, Some("scripts/loop.js".to_string()));
    }

    #[test]
    fn registry_release_drops_persistent_namespace_handles() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let mut registry = QuickJsModuleNamespaceRegistry::new();
        let request = request_for_code("scripts/opening.js", "export const ok = true;");
        let response =
            evaluate_quickjs_module_with_registry(&mut evaluator, &mut registry, &request);
        let namespace_id = response.module_namespace_id.unwrap();

        assert_eq!(evaluator.namespace_count(), 1);
        assert!(registry.contains(&namespace_id));

        let released = registry.release_namespace(&namespace_id).unwrap();
        evaluator.release_module_namespace(&released.id);

        assert!(registry.is_empty());
        assert_eq!(evaluator.namespace_count(), 0);
    }

    fn exported_string(
        evaluator: &RquickJsModuleEvaluator,
        module_namespace_id: &str,
        export_name: &str,
    ) -> String {
        let namespace = evaluator
            .namespaces
            .get(module_namespace_id)
            .unwrap()
            .clone();
        evaluator
            .context
            .with(|ctx| {
                namespace
                    .restore(&ctx)
                    .unwrap()
                    .get::<_, String>(export_name)
            })
            .unwrap()
    }

    fn request_for_code(asset_name: &str, code: &str) -> QuickJsEvaluationRequest {
        QuickJsEvaluationRequest {
            module: QuickJsRuntimeModuleRecord {
                asset_name: asset_name.to_string(),
                bundle_name: "runtime.chapter.native-ui".to_string(),
                package_id: "runtime.chapter.native-ui".to_string(),
                kind: QuickJsRuntimeModuleKind::Script,
                code: code.to_string(),
                bytes: code.as_bytes().to_vec(),
            },
            limits: QuickJsSandboxLimits::default(),
        }
    }
}
