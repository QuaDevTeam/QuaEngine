use std::collections::BTreeMap;
use std::ffi::CStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use rquickjs::{Array, Context, Module, Object, Persistent, Runtime, Value};

use super::{
    validate_quickjs_evaluation_request, validate_quickjs_module_export_call_request,
    QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest,
    QuickJsEvaluationResponse, QuickJsEvaluationResult, QuickJsModuleEvaluator,
    QuickJsModuleExportCallRequest, QuickJsModuleExportCallResponse, QuickJsModuleExportCallResult,
    QuickJsSandboxLimits,
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

    fn call_module_export(
        &mut self,
        request: &QuickJsModuleExportCallRequest,
    ) -> QuickJsModuleExportCallResult {
        validate_quickjs_module_export_call_request(request)?;
        let Some(namespace) = self.namespaces.get(&request.module_namespace_id).cloned() else {
            return Err(QuickJsEvaluationError {
                code: QuickJsEvaluationErrorCode::MissingModuleNamespace,
                message: format!(
                    "QuickJS module namespace \"{}\" is not registered.",
                    request.module_namespace_id
                ),
                asset_name: None,
                detail: None,
            });
        };

        let result: Result<Option<String>, QuickJsEvaluationError> = self.context.with(|ctx| {
            let namespace = namespace.restore(&ctx).map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::EvaluationFailed,
                    "QuickJS module namespace could not be restored.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            let export_value: Value =
                namespace
                    .get(request.export_name.as_str())
                    .map_err(|error| {
                        call_error(
                            QuickJsEvaluationErrorCode::EvaluationFailed,
                            format!(
                                "QuickJS module export \"{}\" could not be read.",
                                request.export_name
                            ),
                            Some(error.to_string()),
                        )
                    })?;
            if export_value.is_undefined() || export_value.is_null() {
                return Err(call_error(
                    QuickJsEvaluationErrorCode::MissingExport,
                    format!(
                        "QuickJS module namespace \"{}\" does not export \"{}\".",
                        request.module_namespace_id, request.export_name
                    ),
                    None,
                ));
            }
            if !export_value.is_function() {
                return Err(call_error(
                    QuickJsEvaluationErrorCode::ExportNotCallable,
                    format!(
                        "QuickJS module export \"{}\" is not callable.",
                        request.export_name
                    ),
                    None,
                ));
            }

            let function = export_value.into_function().ok_or_else(|| {
                call_error(
                    QuickJsEvaluationErrorCode::ExportNotCallable,
                    format!(
                        "QuickJS module export \"{}\" is not callable.",
                        request.export_name
                    ),
                    None,
                )
            })?;
            let args_json = request.args_json.as_deref().unwrap_or("[]");
            let args_value = ctx.json_parse(args_json).map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidArguments,
                    "QuickJS module export argsJson must be valid JSON.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            let args_array = args_value.into_array().ok_or_else(|| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidArguments,
                    "QuickJS module export argsJson must be a JSON array.".to_string(),
                    None,
                )
            })?;
            let value: Value = function
                .call_arg(args_from_json_array(ctx.clone(), &args_array)?)
                .map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::EvaluationFailed,
                        format!(
                            "QuickJS module export \"{}\" call failed.",
                            request.export_name
                        ),
                        Some(error.to_string()),
                    )
                })?;
            let value_json = ctx
                .json_stringify(value)
                .map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::UnsupportedReturnValue,
                        "QuickJS module export returned a value that cannot be serialized to JSON."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?
                .map(|value| value.to_string())
                .transpose()
                .map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::UnsupportedReturnValue,
                        "QuickJS module export returned a string that cannot be copied to Rust."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?;
            Ok(value_json)
        });

        match result {
            Ok(value_json) => Ok(QuickJsModuleExportCallResponse::success(value_json)),
            Err(error) => Err(error),
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

fn args_from_json_array<'js>(
    ctx: rquickjs::Ctx<'js>,
    array: &Array<'js>,
) -> Result<rquickjs::function::Args<'js>, QuickJsEvaluationError> {
    let mut args = rquickjs::function::Args::new(ctx.clone(), array.len());
    for index in 0..array.len() {
        let value: Value = array.get(index).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidArguments,
                "QuickJS module export argsJson contains a value that cannot be read.".to_string(),
                Some(error.to_string()),
            )
        })?;
        args.push_arg(value).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidArguments,
                "QuickJS module export argsJson contains a value that cannot be passed."
                    .to_string(),
                Some(error.to_string()),
            )
        })?;
    }
    Ok(args)
}

fn call_error(
    code: QuickJsEvaluationErrorCode,
    message: String,
    detail: Option<String>,
) -> QuickJsEvaluationError {
    QuickJsEvaluationError {
        code,
        message,
        asset_name: None,
        detail,
    }
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

    #[test]
    fn calls_json_safe_module_exports_by_namespace_handle() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let request = request_for_code(
            "scripts/math.js",
            "export function add(a, b) { return { value: a + b }; }",
        );
        let response = evaluator.evaluate_module(&request).unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let call = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "add".to_string(),
                args_json: Some("[2,3]".to_string()),
            })
            .unwrap();

        assert!(call.ok);
        assert_eq!(call.value_json, Some("{\"value\":5}".to_string()));
    }

    #[test]
    fn rejects_missing_and_non_callable_exports() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/constants.js",
                "export const value = 42;",
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let missing = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "missing".to_string(),
                args_json: None,
            })
            .unwrap_err();
        assert_eq!(missing.code, QuickJsEvaluationErrorCode::MissingExport);

        let non_callable = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "value".to_string(),
                args_json: None,
            })
            .unwrap_err();
        assert_eq!(
            non_callable.code,
            QuickJsEvaluationErrorCode::ExportNotCallable
        );
    }

    #[test]
    fn rejects_invalid_export_call_arguments() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/echo.js",
                "export function echo(value) { return value; }",
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let error = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "echo".to_string(),
                args_json: Some("{\"not\":\"array\"}".to_string()),
            })
            .unwrap_err();

        assert_eq!(error.code, QuickJsEvaluationErrorCode::InvalidArguments);
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
