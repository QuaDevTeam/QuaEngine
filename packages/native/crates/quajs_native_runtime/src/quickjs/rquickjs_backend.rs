use std::collections::BTreeMap;
use std::ffi::CStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use rquickjs::{Array, Context, Function, Module, Object, Persistent, Runtime, Value};

use super::{
    validate_quickjs_evaluation_request, validate_quickjs_game_step_factory_call_request,
    validate_quickjs_game_step_run_request, validate_quickjs_module_export_call_request,
    QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest,
    QuickJsEvaluationResponse, QuickJsEvaluationResult, QuickJsGameStepDescriptor,
    QuickJsGameStepFactoryCallRequest, QuickJsGameStepFactoryCallResponse,
    QuickJsGameStepFactoryCallResult, QuickJsGameStepRunRequest, QuickJsGameStepRunResponse,
    QuickJsGameStepRunResult, QuickJsModuleEvaluator, QuickJsModuleExportCallRequest,
    QuickJsModuleExportCallResponse, QuickJsModuleExportCallResult, QuickJsSandboxLimits,
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
    step_run_handles: BTreeMap<String, QuickJsStepRunHandle>,
    next_namespace_index: u64,
    next_step_run_index: u64,
    context: Context,
    runtime: Runtime,
}

struct QuickJsStepRunHandle {
    module_namespace_id: String,
    function: Persistent<Function<'static>>,
}

impl RquickJsModuleEvaluator {
    pub fn new() -> Result<Self, QuickJsEvaluationError> {
        let runtime = Runtime::new().map_err(backend_error)?;
        let context = Context::full(&runtime).map_err(backend_error)?;
        Ok(Self {
            namespaces: BTreeMap::new(),
            step_run_handles: BTreeMap::new(),
            next_namespace_index: 0,
            next_step_run_index: 0,
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

    pub fn step_run_handle_count(&self) -> usize {
        self.step_run_handles.len()
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

    fn next_step_run_handle_id(&mut self) -> String {
        self.next_step_run_index = self.next_step_run_index.saturating_add(1);
        format!("quickjs:rquickjs:step:{}", self.next_step_run_index)
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

    fn call_game_step_factory(
        &mut self,
        request: &QuickJsGameStepFactoryCallRequest,
    ) -> QuickJsGameStepFactoryCallResult {
        validate_quickjs_game_step_factory_call_request(request)?;
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

        let result: Result<
            Vec<(QuickJsGameStepDescriptor, Persistent<Function<'static>>)>,
            QuickJsEvaluationError,
        > = self.context.with(|ctx| {
            let namespace = namespace.restore(&ctx).map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::EvaluationFailed,
                    "QuickJS module namespace could not be restored.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            let factory: Function = read_callable_export(
                &namespace,
                &request.module_namespace_id,
                &request.export_name,
            )?;
            let steps_value: Value = factory
                .call_arg(factory_args_from_scope_json(
                    ctx.clone(),
                    request.scope_json.as_deref(),
                )?)
                .map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::EvaluationFailed,
                        format!(
                            "QuickJS GameStep factory export \"{}\" call failed.",
                            request.export_name
                        ),
                        Some(error.to_string()),
                    )
                })?;
            let steps_array = steps_value.into_array().ok_or_else(|| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidStepFactoryResult,
                    "QuickJS GameStep factory must return a GameStep array.".to_string(),
                    None,
                )
            })?;

            let mut handles = Vec::new();
            for index in 0..steps_array.len() {
                let step_object: Object = steps_array.get(index).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                        format!("QuickJS GameStep descriptor at index {index} is not an object."),
                        Some(error.to_string()),
                    )
                })?;
                let uuid: String = step_object.get("uuid").map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                        format!(
                            "QuickJS GameStep descriptor at index {index} requires a string uuid."
                        ),
                        Some(error.to_string()),
                    )
                })?;
                if uuid.trim().is_empty()
                    || uuid.trim() != uuid
                    || uuid.chars().any(char::is_control)
                {
                    return Err(call_error(
                        QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                        format!(
                            "QuickJS GameStep descriptor at index {index} has an invalid uuid."
                        ),
                        None,
                    ));
                }

                let run_value: Value = step_object.get("run").map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                        format!("QuickJS GameStep descriptor \"{uuid}\" requires a run function."),
                        Some(error.to_string()),
                    )
                })?;
                let run_function = run_value.into_function().ok_or_else(|| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                        format!(
                            "QuickJS GameStep descriptor \"{uuid}\" run property is not callable."
                        ),
                        None,
                    )
                })?;
                let metadata_json = step_metadata_json(&ctx, &step_object)?;
                let descriptor = QuickJsGameStepDescriptor {
                    uuid,
                    run_handle_id: String::new(),
                    metadata_json,
                };
                handles.push((descriptor, Persistent::save(&ctx, run_function)));
            }
            Ok(handles)
        });

        match result {
            Ok(handles) => {
                let mut descriptors = Vec::with_capacity(handles.len());
                for (mut descriptor, function) in handles {
                    let run_handle_id = self.next_step_run_handle_id();
                    descriptor.run_handle_id = run_handle_id.clone();
                    self.step_run_handles.insert(
                        run_handle_id,
                        QuickJsStepRunHandle {
                            module_namespace_id: request.module_namespace_id.clone(),
                            function,
                        },
                    );
                    descriptors.push(descriptor);
                }
                Ok(QuickJsGameStepFactoryCallResponse::success(descriptors))
            }
            Err(error) => Err(error),
        }
    }

    fn call_game_step_run(
        &mut self,
        request: &QuickJsGameStepRunRequest,
    ) -> QuickJsGameStepRunResult {
        validate_quickjs_game_step_run_request(request)?;
        let Some(handle) = self.step_run_handles.get(&request.run_handle_id) else {
            return Err(QuickJsEvaluationError {
                code: QuickJsEvaluationErrorCode::MissingRunHandle,
                message: format!(
                    "QuickJS GameStep run handle \"{}\" is not registered.",
                    request.run_handle_id
                ),
                asset_name: None,
                detail: None,
            });
        };
        let function = handle.function.clone();

        let result: Result<(), QuickJsEvaluationError> = self.context.with(|ctx| {
            let function = function.restore(&ctx).map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::StepRunFailed,
                    "QuickJS GameStep run function could not be restored.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            let ctx_value = step_context_value(ctx.clone(), request.ctx_json.as_deref())?;
            let value: Value = function
                .call_arg(one_arg(ctx.clone(), ctx_value)?)
                .map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        format!(
                            "QuickJS GameStep run handle \"{}\" call failed.",
                            request.run_handle_id
                        ),
                        Some(error.to_string()),
                    )
                })?;
            if let Some(promise) = value.as_promise() {
                promise.finish::<()>().map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        format!(
                            "QuickJS GameStep run handle \"{}\" promise failed.",
                            request.run_handle_id
                        ),
                        Some(error.to_string()),
                    )
                })?;
            }
            Ok(())
        });

        result.map(|_| QuickJsGameStepRunResponse::success())
    }

    fn release_module_namespace(&mut self, module_namespace_id: &str) {
        self.namespaces.remove(module_namespace_id);
        self.step_run_handles
            .retain(|_, handle| handle.module_namespace_id != module_namespace_id);
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

fn factory_args_from_scope_json<'js>(
    ctx: rquickjs::Ctx<'js>,
    scope_json: Option<&str>,
) -> Result<rquickjs::function::Args<'js>, QuickJsEvaluationError> {
    let mut args =
        rquickjs::function::Args::new(ctx.clone(), if scope_json.is_some() { 1 } else { 0 });
    if let Some(scope_json) = scope_json {
        let value = ctx.json_parse(scope_json).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidScope,
                "QuickJS GameStep factory scopeJson must be valid JSON.".to_string(),
                Some(error.to_string()),
            )
        })?;
        if !value.is_object() || value.is_array() {
            return Err(call_error(
                QuickJsEvaluationErrorCode::InvalidScope,
                "QuickJS GameStep factory scopeJson must be a JSON object.".to_string(),
                None,
            ));
        }
        args.push_arg(value).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidScope,
                "QuickJS GameStep factory scopeJson could not be passed to QuickJS.".to_string(),
                Some(error.to_string()),
            )
        })?;
    }
    Ok(args)
}

fn step_context_value<'js>(
    ctx: rquickjs::Ctx<'js>,
    ctx_json: Option<&str>,
) -> Result<Value<'js>, QuickJsEvaluationError> {
    match ctx_json {
        Some(ctx_json) => {
            let value = ctx.json_parse(ctx_json).map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidStepContext,
                    "QuickJS GameStep run ctxJson must be valid JSON.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            if !value.is_object() || value.is_array() {
                return Err(call_error(
                    QuickJsEvaluationErrorCode::InvalidStepContext,
                    "QuickJS GameStep run ctxJson must be a JSON object.".to_string(),
                    None,
                ));
            }
            Ok(value)
        }
        None => Object::new(ctx.clone())
            .map(Value::from_object)
            .map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidStepContext,
                    "QuickJS GameStep run context object could not be created.".to_string(),
                    Some(error.to_string()),
                )
            }),
    }
}

fn one_arg<'js>(
    ctx: rquickjs::Ctx<'js>,
    value: Value<'js>,
) -> Result<rquickjs::function::Args<'js>, QuickJsEvaluationError> {
    let mut args = rquickjs::function::Args::new(ctx, 1);
    args.push_arg(value).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep run context could not be passed.".to_string(),
            Some(error.to_string()),
        )
    })?;
    Ok(args)
}

fn read_callable_export<'js>(
    namespace: &Object<'js>,
    module_namespace_id: &str,
    export_name: &str,
) -> Result<Function<'js>, QuickJsEvaluationError> {
    let export_value: Value = namespace.get(export_name).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::EvaluationFailed,
            format!("QuickJS module export \"{export_name}\" could not be read."),
            Some(error.to_string()),
        )
    })?;
    if export_value.is_undefined() || export_value.is_null() {
        return Err(call_error(
            QuickJsEvaluationErrorCode::MissingExport,
            format!("QuickJS module namespace \"{module_namespace_id}\" does not export \"{export_name}\"."),
            None,
        ));
    }
    export_value.into_function().ok_or_else(|| {
        call_error(
            QuickJsEvaluationErrorCode::ExportNotCallable,
            format!("QuickJS module export \"{export_name}\" is not callable."),
            None,
        )
    })
}

fn step_metadata_json<'js>(
    ctx: &rquickjs::Ctx<'js>,
    step_object: &Object<'js>,
) -> Result<Option<String>, QuickJsEvaluationError> {
    let metadata: Value = step_object.get("metadata").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepDescriptor,
            "QuickJS GameStep metadata could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if metadata.is_undefined() || metadata.is_null() {
        return Ok(None);
    }
    let value = ctx
        .json_stringify(metadata)
        .map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                "QuickJS GameStep metadata could not be serialized to JSON.".to_string(),
                Some(error.to_string()),
            )
        })?
        .ok_or_else(|| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                "QuickJS GameStep metadata must be JSON-serializable.".to_string(),
                None,
            )
        })?
        .to_string()
        .map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepDescriptor,
                "QuickJS GameStep metadata string could not be copied to Rust.".to_string(),
                Some(error.to_string()),
            )
        })?;
    Ok(Some(value))
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

    #[test]
    fn creates_game_step_descriptors_and_runs_step_handles() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                let lastRun = null;
                export default function opening(scope = {}) {
                    return [{
                        uuid: 'intro.1',
                        metadata: { title: scope.title, point: { nodeId: 'intro' } },
                        async run(ctx) {
                            lastRun = { stepId: ctx.stepId, previousStepId: ctx.previousStepId };
                        }
                    }];
                }
                export function getLastRun() { return lastRun; }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let factory = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "default".to_string(),
                scope_json: Some("{\"title\":\"Opening\"}".to_string()),
            })
            .unwrap();
        let steps = factory.steps.unwrap();

        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].uuid, "intro.1");
        assert_eq!(
            steps[0].metadata_json,
            Some("{\"title\":\"Opening\",\"point\":{\"nodeId\":\"intro\"}}".to_string())
        );
        assert_eq!(evaluator.step_run_handle_count(), 1);

        let run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some(
                    "{\"stepId\":\"intro.1\",\"previousStepId\":\"intro.0\"}".to_string(),
                ),
            })
            .unwrap();
        assert!(run.ok);

        let last_run = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "getLastRun".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(
            last_run.value_json,
            Some("{\"stepId\":\"intro.1\",\"previousStepId\":\"intro.0\"}".to_string())
        );
    }

    #[test]
    fn releasing_namespace_drops_game_step_run_handles() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                "export default function opening() { return [{ uuid: 'intro.1', run() {} }]; }",
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        assert_eq!(steps.len(), 1);
        assert_eq!(evaluator.step_run_handle_count(), 1);

        evaluator.release_module_namespace(&module_namespace_id);

        assert_eq!(evaluator.namespace_count(), 0);
        assert_eq!(evaluator.step_run_handle_count(), 0);
        let missing = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: None,
            })
            .unwrap_err();
        assert_eq!(missing.code, QuickJsEvaluationErrorCode::MissingRunHandle);
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
