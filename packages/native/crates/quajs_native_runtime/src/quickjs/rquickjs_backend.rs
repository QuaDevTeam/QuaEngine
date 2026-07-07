use std::collections::BTreeMap;
use std::ffi::CStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use rquickjs::{
    loader::{ImportAttributes, Loader, Resolver},
    module::Declared,
    Array, Context, Ctx, Error, Function, Module, Object, Persistent, Promise, Runtime, Value,
};

use super::{
    validate_quickjs_evaluation_request, validate_quickjs_game_step_factory_call_request,
    validate_quickjs_game_step_run_request, validate_quickjs_module_export_call_request,
    QuickJsEvaluationError, QuickJsEvaluationErrorCode, QuickJsEvaluationRequest,
    QuickJsEvaluationResponse, QuickJsEvaluationResult, QuickJsGameStepCommand,
    QuickJsGameStepDescriptor, QuickJsGameStepFactoryCallRequest,
    QuickJsGameStepFactoryCallResponse, QuickJsGameStepFactoryCallResult,
    QuickJsGameStepHelperCallRequest, QuickJsGameStepPipelineEmitRequest,
    QuickJsGameStepResumeRequest, QuickJsGameStepRunRequest, QuickJsGameStepRunResponse,
    QuickJsGameStepRunResult, QuickJsGameStepTranslationRequest, QuickJsGameStepWaitRequest,
    QuickJsModuleEvaluator, QuickJsModuleExportCallRequest, QuickJsModuleExportCallResponse,
    QuickJsModuleExportCallResult, QuickJsSandboxLimits,
};

pub const RQUICKJS_BACKEND_VERSION: &str = "rquickjs-0.12.1";

const NATIVE_QUICKJS_GAME_STEP_ENGINE_COMMAND_METHODS: &[&str] = &[
    "showDialogue",
    "hideDialogue",
    "showChoices",
    "clearChoices",
    "jumpToChoice",
    "setBackgroundProjection",
    "setAnimationProjection",
    "removeAnimationProjection",
    "clearAnimationProjections",
    "showCharacter",
    "hideCharacter",
    "moveCharacter",
    "setCharacterExpression",
    "setCharacterSprite",
    "showUI",
    "hideUI",
    "updateUI",
    "setPluginProjection",
    "setLayoutProjection",
    "setFlowControlOptions",
    "setDialogueOptions",
    "setFlowControlMode",
    "setFlowControlPolicy",
    "resetFlowControlPolicy",
    "startAuto",
    "stopAuto",
    "startSkip",
    "stopSkip",
    "startFastForward",
    "stopFastForward",
];

const NATIVE_QUICKJS_STEP_CONTEXT_BRIDGE_SOURCE: &str = r#"
((ctx, commands, unsupportedState, waitState, translationState, pipelineState, helperState, methods) => {
  const engine = Object.create(null);
  const pipeline = Object.create(null);
  const serializeArgs = (method, args) => JSON.stringify(args, (_key, value) => {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
      throw new TypeError(`Native QuickJS StepContext command ${method} arguments must be JSON-serializable.`);
    }
    return value;
  });
  const record = method => (...args) => {
    const argsJson = serializeArgs(method, args);
    if (argsJson === undefined) {
      throw new TypeError(`Native QuickJS StepContext command ${method} arguments must be JSON-serializable.`);
    }
    commands.push({ target: 'engine', method, argsJson });
  };
  const unsupported = name => () => {
    unsupportedState.name = name;
    throw new Error(`Native QuickJS StepContext ${name} requires a native continuation bridge.`);
  };
  const assertWaitEvent = event => {
    if (typeof event !== 'string' || event.trim() !== event || event.length === 0 || event.length > 256 || /[\u0000-\u001F\u007F]/.test(event)) {
      throw new TypeError('Native QuickJS StepContext engine.waitFor requires a safe pipeline event name.');
    }
  };
  const assertTranslationKey = key => {
    if (typeof key !== 'string' || key.trim() !== key || key.length === 0 || key.length > 256 || /[\u0000-\u001F\u007F]/.test(key)) {
      throw new TypeError('Native QuickJS StepContext t requires a safe translation key.');
    }
  };
  const assertPipelineEvent = event => {
    if (typeof event !== 'string' || event.trim() !== event || event.length === 0 || event.length > 256 || /[\u0000-\u001F\u007F]/.test(event)) {
      throw new TypeError('Native QuickJS StepContext pipeline.emit requires a safe event name.');
    }
  };
  const assertHelperText = (value, label) => {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > 256 || /[\u0000-\u001F\u007F]/.test(value)) {
      throw new TypeError(`Native QuickJS StepContext helper call requires a safe ${label}.`);
    }
  };
  const assertNoPendingContinuation = name => {
    if (waitState.active || translationState.active || pipelineState.active || helperState.active) {
      throw new Error(`Native QuickJS StepContext can only suspend one ${name} continuation at a time.`);
    }
  };
  const waitFor = (event, matcher) => {
    assertWaitEvent(event);
    if (matcher !== undefined && typeof matcher !== 'function') {
      throw new TypeError('Native QuickJS StepContext engine.waitFor matcher must be a function when provided.');
    }
    assertNoPendingContinuation('engine.waitFor');
    waitState.active = true;
    waitState.event = event;
    waitState.matcher = matcher;
    return new Promise(resolve => {
      waitState.resolve = resolve;
    });
  };
  const translate = (key, options) => {
    assertTranslationKey(key);
    let optionsJson;
    if (options !== undefined) {
      optionsJson = JSON.stringify(options, (_key, value) => {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
          throw new TypeError('Native QuickJS StepContext t options must be JSON-serializable.');
        }
        return value;
      });
      if (optionsJson === undefined || (!optionsJson.startsWith('{') && !optionsJson.startsWith('['))) {
        throw new TypeError('Native QuickJS StepContext t options must be a JSON object or array.');
      }
    }
    assertNoPendingContinuation('translation');
    translationState.active = true;
    translationState.key = key;
    translationState.optionsJson = optionsJson;
    return new Promise(resolve => {
      translationState.resolve = resolve;
    });
  };
  const emitPipeline = (event, payload) => {
    assertPipelineEvent(event);
    let payloadJson;
    if (payload !== undefined) {
      payloadJson = JSON.stringify(payload, (_key, value) => {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
          throw new TypeError('Native QuickJS StepContext pipeline.emit payload must be JSON-serializable.');
        }
        return value;
      });
      if (payloadJson === undefined) {
        throw new TypeError('Native QuickJS StepContext pipeline.emit payload must be JSON-serializable.');
      }
    }
    assertNoPendingContinuation('pipeline.emit');
    pipelineState.active = true;
    pipelineState.event = event;
    pipelineState.payloadJson = payloadJson;
    return new Promise(resolve => {
      pipelineState.resolve = resolve;
    });
  };
  const callHelper = (moduleName, exportName, engineArg, args) => {
    assertHelperText(moduleName, 'helper module name');
    assertHelperText(exportName, 'helper export name');
    if (exportName === '__proto__' || exportName === 'prototype' || exportName === 'constructor') {
      throw new TypeError(`Native QuickJS helper export ${exportName} is blocked.`);
    }
    if (!engineArg || typeof engineArg !== 'object') {
      throw new TypeError(`Native QuickJS helper ${moduleName}.${exportName} requires ctx.engine as its first argument.`);
    }
    let argsJson = JSON.stringify(args, (_key, value) => {
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
        throw new TypeError(`Native QuickJS helper ${moduleName}.${exportName} arguments must be JSON-serializable.`);
      }
      return value;
    });
    if (argsJson === undefined || !argsJson.startsWith('[')) {
      throw new TypeError(`Native QuickJS helper ${moduleName}.${exportName} arguments must serialize to a JSON array.`);
    }
    assertNoPendingContinuation('helper call');
    helperState.active = true;
    helperState.module = moduleName;
    helperState.exportName = exportName;
    helperState.argsJson = argsJson;
    return new Promise(resolve => {
      helperState.resolve = resolve;
    });
  };
  for (const method of methods) {
    Object.defineProperty(engine, method, { value: record(method), enumerable: true });
  }
  Object.defineProperty(engine, 'waitFor', { value: waitFor, enumerable: true });
  Object.defineProperty(pipeline, 'emit', { value: emitPipeline, enumerable: true });
  Object.freeze(engine);
  Object.freeze(pipeline);
  Object.defineProperty(ctx, 'engine', { value: engine, enumerable: true, configurable: true });
  Object.defineProperty(ctx, 'pipeline', { value: pipeline, enumerable: true, configurable: true });
  Object.defineProperty(ctx, 't', { value: translate, enumerable: true, configurable: true });
  Object.defineProperty(globalThis, '__quaNativeStepHelperCall', { value: callHelper, enumerable: false, configurable: true });
  return ctx;
})
"#;

const NATIVE_QUICKJS_STEP_WAIT_RESUME_SOURCE: &str = r#"
((waitState, payload) => {
  if (!waitState.active) {
    return { accepted: false };
  }
  const matcher = waitState.matcher;
  if (typeof matcher === 'function' && matcher(payload) !== true) {
    return { accepted: false, event: waitState.event };
  }
  const resolve = waitState.resolve;
  waitState.active = false;
  waitState.event = undefined;
  waitState.matcher = undefined;
  waitState.resolve = undefined;
  resolve(payload);
  return { accepted: true };
})
"#;

const NATIVE_QUICKJS_STEP_TRANSLATION_RESUME_SOURCE: &str = r#"
((translationState, payload) => {
  if (!translationState.active) {
    return { accepted: false };
  }
  if (typeof payload !== 'string') {
    throw new TypeError('Native QuickJS StepContext t resume payload must be a string.');
  }
  const resolve = translationState.resolve;
  translationState.active = false;
  translationState.key = undefined;
  translationState.optionsJson = undefined;
  translationState.resolve = undefined;
  resolve(payload);
  return { accepted: true };
})
"#;

const NATIVE_QUICKJS_STEP_PIPELINE_RESUME_SOURCE: &str = r#"
((pipelineState) => {
  if (!pipelineState.active) {
    return { accepted: false };
  }
  const resolve = pipelineState.resolve;
  pipelineState.active = false;
  pipelineState.event = undefined;
  pipelineState.payloadJson = undefined;
  pipelineState.resolve = undefined;
  resolve(undefined);
  return { accepted: true };
})
"#;

const NATIVE_QUICKJS_STEP_HELPER_RESUME_SOURCE: &str = r#"
((helperState, payload) => {
  if (!helperState.active) {
    return { accepted: false };
  }
  const resolve = helperState.resolve;
  helperState.active = false;
  helperState.module = undefined;
  helperState.exportName = undefined;
  helperState.argsJson = undefined;
  helperState.resolve = undefined;
  resolve(payload);
  return { accepted: true };
})
"#;

const NATIVE_QUICKJS_ENGINE_HELPERS_SOURCE: &str = r#"
export const RenderToLogicEvents = Object.freeze({
  USER_ADVANCE: 'user/advance',
  USER_CHOICE_SELECT: 'user/choice_select'
});

export async function resolveQuaText(_ctx, parts) {
  if (!Array.isArray(parts)) {
    throw new TypeError('resolveQuaText expects a part array.');
  }
  const resolved = [];
  for (const part of parts) {
    const value = await part;
    resolved.push(value === undefined || value === null ? '' : String(value));
  }
  return resolved.join('');
}
"#;

const NATIVE_QUICKJS_CHARACTER_HELPERS_SOURCE: &str = r#"
const USER_ADVANCE = 'user/advance';

function assertEngine(engine, helper) {
  if (!engine || typeof engine !== 'object') {
    throw new TypeError(`${helper} requires ctx.engine.`);
  }
}

function characterId(character) {
  if (typeof character === 'string') {
    return character;
  }
  if (character && typeof character.id === 'string') {
    return character.id;
  }
  throw new TypeError('Native QuickJS character helpers require a string character id or an object with a string id.');
}

function characterName(character, options) {
  if (options && typeof options.characterName === 'string') {
    return options.characterName;
  }
  if (character && typeof character !== 'string') {
    if (typeof character.displayName === 'string') {
      return character.displayName;
    }
    if (typeof character.name === 'string') {
      return character.name;
    }
    if (typeof character.id === 'string') {
      return character.id;
    }
  }
  return characterId(character);
}

function normalizeAvatar(avatar) {
  if (avatar === undefined || avatar === null) {
    return undefined;
  }
  if (typeof avatar === 'string') {
    return { type: 'images', name: avatar };
  }
  if (typeof avatar === 'object') {
    return { ...avatar, type: avatar.type || 'images' };
  }
  throw new TypeError('Native QuickJS character helper avatar must be a string or object.');
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function shouldWait(options) {
  return !options || options.wait !== false;
}

export async function speakWithEngine(engine, character, text, options = {}) {
  assertEngine(engine, 'speakWithEngine');
  const payload = {
    characterId: characterId(character),
    characterName: characterName(character, options),
    text,
    mode: options.mode || 'say'
  };
  assignIfDefined(payload, 'avatar', normalizeAvatar(options.avatar));
  assignIfDefined(payload, 'speaker', options.speaker);
  assignIfDefined(payload, 'speakerStyle', options.speakerStyle);
  assignIfDefined(payload, 'typewriter', options.typewriter);
  await engine.showDialogue(payload);
  if (shouldWait(options)) {
    await engine.waitFor(USER_ADVANCE);
  }
}

export async function narrateWithEngine(engine, text, options = {}) {
  assertEngine(engine, 'narrateWithEngine');
  const payload = { text, mode: 'narration' };
  assignIfDefined(payload, 'typewriter', options.typewriter);
  assignIfDefined(payload, 'metadata', options.metadata);
  await engine.showDialogue(payload);
  if (shouldWait(options)) {
    await engine.waitFor(USER_ADVANCE);
  }
}

export async function showWithEngine(engine, character, options = {}) {
  assertEngine(engine, 'showWithEngine');
  await engine.showCharacter({
    ...options,
    id: characterId(character),
    name: characterName(character, options),
    visible: options.visible !== false
  });
}

export async function hideWithEngine(engine, character) {
  assertEngine(engine, 'hideWithEngine');
  await engine.hideCharacter(characterId(character));
}

export async function moveWithEngine(engine, character, position) {
  assertEngine(engine, 'moveWithEngine');
  await engine.moveCharacter(characterId(character), position);
}

export async function expressionWithEngine(engine, character, expression) {
  assertEngine(engine, 'expressionWithEngine');
  await engine.setCharacterExpression(characterId(character), expression);
}

export async function spriteWithEngine(engine, character, sprite) {
  assertEngine(engine, 'spriteWithEngine');
  await engine.setCharacterSprite(characterId(character), sprite);
}
"#;

#[derive(Debug, Clone)]
struct NativeQuickJsBuiltinHelperResolver {
    module_graph: NativeQuickJsModuleGraphRegistry,
}

#[derive(Debug, Clone)]
struct NativeQuickJsBuiltinHelperLoader {
    module_graph: NativeQuickJsModuleGraphRegistry,
}

#[derive(Debug, Clone, Default)]
struct NativeQuickJsModuleGraphRegistry {
    modules: Arc<Mutex<BTreeMap<String, NativeQuickJsModuleGraphEntry>>>,
}

#[derive(Debug, Clone)]
struct NativeQuickJsModuleGraphEntry {
    package_id: String,
    asset_name: String,
    code: String,
}

impl NativeQuickJsModuleGraphRegistry {
    fn set_for_request(&self, request: &QuickJsEvaluationRequest) {
        let mut modules = self.modules.lock().unwrap();
        modules.clear();
        modules.insert(
            native_quickjs_package_module_key(
                request.module.package_id.as_str(),
                request.module.asset_name.as_str(),
            ),
            NativeQuickJsModuleGraphEntry {
                package_id: request.module.package_id.clone(),
                asset_name: request.module.asset_name.clone(),
                code: request.module.code.clone(),
            },
        );
        for module in &request.module_graph {
            modules.insert(
                native_quickjs_package_module_key(
                    module.package_id.as_str(),
                    module.asset_name.as_str(),
                ),
                NativeQuickJsModuleGraphEntry {
                    package_id: module.package_id.clone(),
                    asset_name: module.asset_name.clone(),
                    code: module.code.clone(),
                },
            );
        }
    }

    fn clear(&self) {
        self.modules.lock().unwrap().clear();
    }

    fn get(&self, key: &str) -> Option<NativeQuickJsModuleGraphEntry> {
        self.modules.lock().unwrap().get(key).cloned()
    }

    fn contains(&self, key: &str) -> bool {
        self.modules.lock().unwrap().contains_key(key)
    }
}

impl Resolver for NativeQuickJsBuiltinHelperResolver {
    fn resolve<'js>(
        &mut self,
        _ctx: &Ctx<'js>,
        base: &str,
        name: &str,
        attributes: Option<ImportAttributes<'js>>,
    ) -> rquickjs::Result<String> {
        if attributes.is_some() {
            return Err(Error::new_resolving_message(
                base,
                name,
                "Native QuickJS built-in helper imports do not support import attributes.",
            ));
        }
        if native_quickjs_builtin_helper_source(name).is_some() {
            return Ok(name.to_string());
        }
        if let Some(resolved) = self.resolve_module_graph_import(base, name) {
            return Ok(resolved);
        }
        Err(Error::new_resolving_message(
            base,
            name,
            format!("Native QuickJS has no built-in helper module named \"{name}\"."),
        ))
    }
}

impl NativeQuickJsBuiltinHelperResolver {
    fn resolve_module_graph_import(&self, base: &str, name: &str) -> Option<String> {
        if !is_package_local_import_specifier(name) {
            return None;
        }
        let base_entry = self.module_graph.get(base)?;
        let resolved_asset_name = resolve_package_local_asset_name(&base_entry.asset_name, name)?;
        let key = native_quickjs_package_module_key(&base_entry.package_id, &resolved_asset_name);
        self.module_graph.contains(&key).then_some(key)
    }
}

impl Loader for NativeQuickJsBuiltinHelperLoader {
    fn load<'js>(
        &mut self,
        ctx: &Ctx<'js>,
        name: &str,
        attributes: Option<ImportAttributes<'js>>,
    ) -> rquickjs::Result<Module<'js, Declared>> {
        if attributes.is_some() {
            return Err(Error::new_loading_message(
                name,
                "Native QuickJS built-in helper imports do not support import attributes.",
            ));
        }
        if let Some(source) = native_quickjs_builtin_helper_source(name) {
            return Module::declare(ctx.clone(), name, source.as_bytes());
        }
        let Some(entry) = self.module_graph.get(name) else {
            return Err(Error::new_loading_message(
                name,
                "Native QuickJS built-in helper module is not registered.",
            ));
        };
        Module::declare(ctx.clone(), name, entry.code.as_bytes())
    }
}

fn native_quickjs_package_module_key(package_id: &str, asset_name: &str) -> String {
    format!("qua-native-qpk:{}:{}", package_id, asset_name)
}

fn is_package_local_import_specifier(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../")
}

fn resolve_package_local_asset_name(base_asset_name: &str, specifier: &str) -> Option<String> {
    if !is_package_local_import_specifier(specifier)
        || specifier.contains('\\')
        || specifier.contains(':')
        || specifier.chars().any(char::is_control)
    {
        return None;
    }
    let base_dir = base_asset_name
        .rsplit_once('/')
        .map(|(dir, _)| dir)
        .unwrap_or("");
    let mut parts: Vec<&str> = base_dir
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();
    for part in specifier.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            value => parts.push(value),
        }
    }
    let resolved = parts.join("/");
    let resolved_without_suffix = strip_quickjs_asset_reference_suffix(&resolved);
    if resolved.is_empty()
        || resolved.starts_with('/')
        || resolved.contains("//")
        || !resolved_without_suffix.ends_with(".js")
            && !resolved_without_suffix.ends_with(".mjs")
            && !resolved_without_suffix.ends_with(".cjs")
    {
        return None;
    }
    Some(resolved)
}

fn strip_quickjs_asset_reference_suffix(asset_name: &str) -> &str {
    match asset_name.find(['?', '#']) {
        Some(index) => &asset_name[..index],
        None => asset_name,
    }
}

fn native_quickjs_builtin_helper_source(name: &str) -> Option<String> {
    match name {
        "@quajs/engine" => Some(NATIVE_QUICKJS_ENGINE_HELPERS_SOURCE.to_string()),
        "@quajs/character" => Some(NATIVE_QUICKJS_CHARACTER_HELPERS_SOURCE.to_string()),
        _ => native_quickjs_bridge_helper_exports(name)
            .map(|exports| native_quickjs_bridge_helper_source(name, exports)),
    }
}

fn native_quickjs_bridge_helper_exports(name: &str) -> Option<&'static [&'static str]> {
    match name {
        "@quajs/character/animation" => Some(&[
            "playCharacterEnterWithEngine",
            "playCharacterFadeWithEngine",
            "playCharacterExitWithEngine",
        ]),
        "@quajs/plugin-achievement" => Some(&[
            "unlockAchievementWithEngine",
            "openAchievementBoardWithEngine",
        ]),
        "@quajs/plugin-animation" => Some(&[
            "registerAnimationWithEngine",
            "playTimelineWithEngine",
            "playAnimationWithEngine",
        ]),
        "@quajs/plugin-audio" => Some(&[
            "configureAudioChapterWithEngine",
            "playVoiceWithEngine",
            "playBGMWithEngine",
            "playSFXWithEngine",
            "playAmbientWithEngine",
            "setAudioGainWithEngine",
            "setAudioEqWithEngine",
            "setAudioAutomationWithEngine",
            "stopAudioWithEngine",
            "pauseAudioWithEngine",
            "resumeAudioWithEngine",
            "seekAudioWithEngine",
            "stopVoiceWithEngine",
            "stopBGMWithEngine",
            "stopSFXWithEngine",
            "stopAmbientWithEngine",
        ]),
        "@quajs/plugin-background" => Some(&[
            "setBackgroundWithEngine",
            "clearBackgroundWithEngine",
            "setVideoBackgroundWithEngine",
            "setLayeredBackgroundWithEngine",
            "addBackgroundLayerWithEngine",
            "removeBackgroundLayerWithEngine",
            "clearBackgroundLayersWithEngine",
            "transitionBackgroundWithEngine",
            "transitionBackgroundLayerWithEngine",
            "showCgOverlayWithEngine",
            "hideCgOverlayWithEngine",
        ]),
        "@quajs/plugin-backlog" => Some(&["setBacklogPolicyWithEngine"]),
        "@quajs/plugin-gallery" => {
            Some(&["unlockGalleryEntryWithEngine", "openGallerySceneWithEngine"])
        }
        "@quajs/plugin-inventory" => Some(&[
            "grantInventoryItemWithEngine",
            "consumeInventoryItemWithEngine",
            "setInventoryItemQuantityWithEngine",
        ]),
        "@quajs/story-graph" => Some(&[
            "setStoryMetadataWithEngine",
            "emitStoryEventWithEngine",
            "setStoryChapterSelectWithEngine",
        ]),
        _ => None,
    }
}

fn native_quickjs_bridge_helper_source(name: &str, exports: &[&str]) -> String {
    let mut source = String::from(
        r#"
const createNativeHelper = (moduleName, exportName) => async (engine, ...args) => {
  const bridge = globalThis.__quaNativeStepHelperCall;
  if (typeof bridge !== 'function') {
    throw new Error(`Native QuickJS helper ${moduleName}.${exportName} requires an active GameStep bridge.`);
  }
  return await bridge(moduleName, exportName, engine, args);
};
"#,
    );
    for export_name in exports {
        source.push_str(&format!(
            "export const {export_name} = createNativeHelper({name:?}, {export_name:?});\n"
        ));
    }
    source
}

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
    step_resume_handles: BTreeMap<String, QuickJsStepResumeHandle>,
    module_graph: NativeQuickJsModuleGraphRegistry,
    next_namespace_index: u64,
    next_step_run_index: u64,
    next_step_resume_index: u64,
    context: Context,
    runtime: Runtime,
}

struct QuickJsStepRunHandle {
    module_namespace_id: String,
    function: Persistent<Function<'static>>,
}

struct QuickJsStepResumeHandle {
    module_namespace_id: String,
    promise: Persistent<Promise<'static>>,
    commands: Persistent<Array<'static>>,
    wait_state: Persistent<Object<'static>>,
    translation_state: Persistent<Object<'static>>,
    pipeline_state: Persistent<Object<'static>>,
    helper_state: Persistent<Object<'static>>,
    unsupported_state: Persistent<Object<'static>>,
    last_command_index: usize,
}

struct QuickJsPendingStepRun {
    commands: Vec<QuickJsGameStepCommand>,
    pending_request: QuickJsPendingStepRequest,
    promise: Persistent<Promise<'static>>,
    commands_array: Persistent<Array<'static>>,
    wait_state: Persistent<Object<'static>>,
    translation_state: Persistent<Object<'static>>,
    pipeline_state: Persistent<Object<'static>>,
    helper_state: Persistent<Object<'static>>,
    unsupported_state: Persistent<Object<'static>>,
    last_command_index: usize,
}

enum QuickJsPendingStepRequest {
    Wait(QuickJsGameStepWaitRequest),
    Translation(QuickJsGameStepTranslationRequest),
    PipelineEmit(QuickJsGameStepPipelineEmitRequest),
    HelperCall(QuickJsGameStepHelperCallRequest),
}

impl QuickJsPendingStepRequest {
    fn resume_handle_id(&self) -> &str {
        match self {
            QuickJsPendingStepRequest::Wait(request) => request.resume_handle_id.as_str(),
            QuickJsPendingStepRequest::Translation(request) => request.resume_handle_id.as_str(),
            QuickJsPendingStepRequest::PipelineEmit(request) => request.resume_handle_id.as_str(),
            QuickJsPendingStepRequest::HelperCall(request) => request.resume_handle_id.as_str(),
        }
    }

    fn into_response(self, commands: Vec<QuickJsGameStepCommand>) -> QuickJsGameStepRunResponse {
        match self {
            QuickJsPendingStepRequest::Wait(request) => {
                QuickJsGameStepRunResponse::pending(commands, request)
            }
            QuickJsPendingStepRequest::Translation(request) => {
                QuickJsGameStepRunResponse::pending_translation(commands, request)
            }
            QuickJsPendingStepRequest::PipelineEmit(request) => {
                QuickJsGameStepRunResponse::pending_pipeline_emit(commands, request)
            }
            QuickJsPendingStepRequest::HelperCall(request) => {
                QuickJsGameStepRunResponse::pending_helper_call(commands, request)
            }
        }
    }
}

enum QuickJsStepRunBoundary {
    Complete(Vec<QuickJsGameStepCommand>),
    Pending(QuickJsPendingStepRun),
}

enum QuickJsStepResumeBoundary {
    Complete(Vec<QuickJsGameStepCommand>),
    Pending {
        commands: Vec<QuickJsGameStepCommand>,
        pending_request: QuickJsPendingStepRequest,
        last_command_index: usize,
    },
}

impl RquickJsModuleEvaluator {
    pub fn new() -> Result<Self, QuickJsEvaluationError> {
        let runtime = Runtime::new().map_err(backend_error)?;
        let module_graph = NativeQuickJsModuleGraphRegistry::default();
        runtime.set_loader(
            NativeQuickJsBuiltinHelperResolver {
                module_graph: module_graph.clone(),
            },
            NativeQuickJsBuiltinHelperLoader {
                module_graph: module_graph.clone(),
            },
        );
        let context = Context::full(&runtime).map_err(backend_error)?;
        Ok(Self {
            namespaces: BTreeMap::new(),
            step_run_handles: BTreeMap::new(),
            step_resume_handles: BTreeMap::new(),
            module_graph,
            next_namespace_index: 0,
            next_step_run_index: 0,
            next_step_resume_index: 0,
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

    pub fn step_resume_handle_count(&self) -> usize {
        self.step_resume_handles.len()
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

    fn next_step_resume_handle_id(&mut self) -> String {
        self.next_step_resume_index = self.next_step_resume_index.saturating_add(1);
        format!("quickjs:rquickjs:resume:{}", self.next_step_resume_index)
    }
}

impl QuickJsModuleEvaluator for RquickJsModuleEvaluator {
    fn evaluate_module(&mut self, request: &QuickJsEvaluationRequest) -> QuickJsEvaluationResult {
        validate_quickjs_evaluation_request(request)?;
        self.apply_limits(&request.limits);
        self.module_graph.set_for_request(request);
        let module_key = native_quickjs_package_module_key(
            request.module.package_id.as_str(),
            request.module.asset_name.as_str(),
        );
        let result: rquickjs::Result<Persistent<Object<'static>>> = self.context.with(|ctx| {
            let module = Module::declare(
                ctx.clone(),
                module_key.as_bytes(),
                request.module.code.as_bytes(),
            )?;
            let (module, promise) = module.eval()?;
            promise.finish::<()>()?;
            let namespace = module.namespace()?;
            Ok(Persistent::save(&ctx, namespace))
        });
        self.clear_interrupt_handler();
        self.module_graph.clear();

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
        let module_namespace_id = handle.module_namespace_id.clone();
        let resume_handle_id = self.next_step_resume_handle_id();

        let result: Result<QuickJsStepRunBoundary, QuickJsEvaluationError> =
            self.context.with(|ctx| {
                let function = function.restore(&ctx).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        "QuickJS GameStep run function could not be restored.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let ctx_object = step_context_object(ctx.clone(), request.ctx_json.as_deref())?;
                let commands = Array::new(ctx.clone()).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepContext,
                        "QuickJS GameStep command array could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let unsupported_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepContext,
                        "QuickJS GameStep unsupported-command marker could not be created."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let wait_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepContext,
                        "QuickJS GameStep wait state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let translation_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepContext,
                        "QuickJS GameStep translation state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let pipeline_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepContext,
                        "QuickJS GameStep pipeline state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let helper_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::InvalidStepContext,
                        "QuickJS GameStep helper-call state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                install_step_context_bridge(
                    ctx.clone(),
                    &ctx_object,
                    &commands,
                    &unsupported_state,
                    &wait_state,
                    &translation_state,
                    &pipeline_state,
                    &helper_state,
                )?;
                let value: Value = function
                    .call_arg(one_arg(ctx.clone(), Value::from_object(ctx_object))?)
                    .map_err(|error| {
                        step_run_error_from_unsupported_state(
                            &unsupported_state,
                            format!(
                                "QuickJS GameStep run handle \"{}\" call failed.",
                                request.run_handle_id
                            ),
                            Some(error.to_string()),
                        )
                    })?;
                if let Some(promise) = value.as_promise() {
                    match promise.finish::<()>() {
                        Ok(()) => {
                            return Ok(QuickJsStepRunBoundary::Complete(
                                step_commands_from_array(ctx.clone(), &commands)?,
                            ));
                        }
                        Err(Error::WouldBlock) => {
                            let last_command_index = commands.len();
                            let pending_request = pending_step_request_from_states(
                                &wait_state,
                                &translation_state,
                                &pipeline_state,
                                &helper_state,
                                &resume_handle_id,
                            )?;
                            return Ok(QuickJsStepRunBoundary::Pending(QuickJsPendingStepRun {
                                commands: step_commands_from_array_range(
                                    ctx.clone(),
                                    &commands,
                                    0,
                                )?,
                                pending_request,
                                promise: Persistent::save(&ctx, promise.clone()),
                                commands_array: Persistent::save(&ctx, commands.clone()),
                                wait_state: Persistent::save(&ctx, wait_state),
                                translation_state: Persistent::save(&ctx, translation_state),
                                pipeline_state: Persistent::save(&ctx, pipeline_state),
                                helper_state: Persistent::save(&ctx, helper_state),
                                unsupported_state: Persistent::save(&ctx, unsupported_state),
                                last_command_index,
                            }));
                        }
                        Err(error) => {
                            return Err(step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "QuickJS GameStep run handle \"{}\" promise failed.",
                                    request.run_handle_id
                                ),
                                Some(error.to_string()),
                            ));
                        }
                    }
                }
                if wait_state_is_active(&wait_state)?
                    || translation_state_is_active(&translation_state)?
                    || pipeline_state_is_active(&pipeline_state)?
                    || helper_state_is_active(&helper_state)?
                {
                    return Err(call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        format!(
                            "QuickJS GameStep run handle \"{}\" returned while a StepContext continuation is pending.",
                            request.run_handle_id
                        ),
                        Some(
                            "GameStep run functions must await or return ctx.engine.waitFor / ctx.t / ctx.pipeline.emit / native helper promises."
                                .to_string(),
                        ),
                    ));
                }
                Ok(QuickJsStepRunBoundary::Complete(step_commands_from_array(
                    ctx.clone(),
                    &commands,
                )?))
            });

        match result {
            Ok(QuickJsStepRunBoundary::Complete(commands)) => {
                Ok(QuickJsGameStepRunResponse::success(commands))
            }
            Ok(QuickJsStepRunBoundary::Pending(pending)) => {
                let resume_handle_id = pending.pending_request.resume_handle_id().to_string();
                self.step_resume_handles.insert(
                    resume_handle_id,
                    QuickJsStepResumeHandle {
                        module_namespace_id,
                        promise: pending.promise,
                        commands: pending.commands_array,
                        wait_state: pending.wait_state,
                        translation_state: pending.translation_state,
                        pipeline_state: pending.pipeline_state,
                        helper_state: pending.helper_state,
                        unsupported_state: pending.unsupported_state,
                        last_command_index: pending.last_command_index,
                    },
                );
                Ok(pending.pending_request.into_response(pending.commands))
            }
            Err(error) => Err(error),
        }
    }

    fn resume_game_step_run(
        &mut self,
        request: &QuickJsGameStepResumeRequest,
    ) -> QuickJsGameStepRunResult {
        super::validate_quickjs_game_step_resume_request(request)?;
        let resume_handle_id = request.resume_handle_id.clone();
        let Some(mut handle) = self.step_resume_handles.remove(&resume_handle_id) else {
            return Err(QuickJsEvaluationError {
                code: QuickJsEvaluationErrorCode::MissingResumeHandle,
                message: format!(
                    "QuickJS GameStep resume handle \"{}\" is not registered.",
                    request.resume_handle_id
                ),
                asset_name: None,
                detail: None,
            });
        };

        let result: Result<QuickJsStepResumeBoundary, QuickJsEvaluationError> =
            self.context.with(|ctx| {
                let promise = handle.promise.clone().restore(&ctx).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        "QuickJS GameStep pending promise could not be restored.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let commands = handle.commands.clone().restore(&ctx).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        "QuickJS GameStep command array could not be restored.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let wait_state = handle.wait_state.clone().restore(&ctx).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        "QuickJS GameStep wait state could not be restored.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let translation_state = handle.translation_state.clone().restore(&ctx).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        "QuickJS GameStep translation state could not be restored.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let pipeline_state = handle.pipeline_state.clone().restore(&ctx).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        "QuickJS GameStep pipeline state could not be restored.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let helper_state = handle.helper_state.clone().restore(&ctx).map_err(|error| {
                    call_error(
                        QuickJsEvaluationErrorCode::StepRunFailed,
                        "QuickJS GameStep helper-call state could not be restored.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let unsupported_state =
                    handle
                        .unsupported_state
                        .clone()
                        .restore(&ctx)
                        .map_err(|error| {
                            call_error(
                            QuickJsEvaluationErrorCode::StepRunFailed,
                            "QuickJS GameStep unsupported-command marker could not be restored."
                                .to_string(),
                            Some(error.to_string()),
                        )
                        })?;
                let payload = resume_payload_value(ctx.clone(), request.payload_json.as_deref())?;
                let accepted: bool = if wait_state_is_active(&wait_state)? {
                    let resume_wait: Function = ctx
                        .eval(NATIVE_QUICKJS_STEP_WAIT_RESUME_SOURCE)
                        .map_err(|error| {
                            call_error(
                                QuickJsEvaluationErrorCode::StepRunFailed,
                                "QuickJS StepContext wait resume script could not be compiled."
                                    .to_string(),
                                Some(error.to_string()),
                            )
                        })?;
                    let resume_result: Object = resume_wait
                        .call_arg(two_args(ctx.clone(), wait_state.clone(), payload)?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "QuickJS GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            QuickJsEvaluationErrorCode::StepRunFailed,
                            "QuickJS GameStep wait resume result did not include accepted.".to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else if translation_state_is_active(&translation_state)? {
                    let resume_translation: Function = ctx
                        .eval(NATIVE_QUICKJS_STEP_TRANSLATION_RESUME_SOURCE)
                        .map_err(|error| {
                            call_error(
                                QuickJsEvaluationErrorCode::StepRunFailed,
                                "QuickJS StepContext translation resume script could not be compiled."
                                    .to_string(),
                                Some(error.to_string()),
                            )
                        })?;
                    let resume_result: Object = resume_translation
                        .call_arg(two_args(ctx.clone(), translation_state.clone(), payload)?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "QuickJS GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            QuickJsEvaluationErrorCode::StepRunFailed,
                            "QuickJS GameStep translation resume result did not include accepted.".to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else if pipeline_state_is_active(&pipeline_state)? {
                    let resume_pipeline: Function = ctx
                        .eval(NATIVE_QUICKJS_STEP_PIPELINE_RESUME_SOURCE)
                        .map_err(|error| {
                            call_error(
                                QuickJsEvaluationErrorCode::StepRunFailed,
                                "QuickJS StepContext pipeline resume script could not be compiled."
                                    .to_string(),
                                Some(error.to_string()),
                            )
                        })?;
                    let resume_result: Object = resume_pipeline
                        .call_arg(one_arg(ctx.clone(), Value::from_object(pipeline_state.clone()))?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "QuickJS GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            QuickJsEvaluationErrorCode::StepRunFailed,
                            "QuickJS GameStep pipeline resume result did not include accepted."
                                .to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else if helper_state_is_active(&helper_state)? {
                    let resume_helper: Function = ctx
                        .eval(NATIVE_QUICKJS_STEP_HELPER_RESUME_SOURCE)
                        .map_err(|error| {
                            call_error(
                                QuickJsEvaluationErrorCode::StepRunFailed,
                                "QuickJS StepContext helper-call resume script could not be compiled."
                                    .to_string(),
                                Some(error.to_string()),
                            )
                        })?;
                    let resume_result: Object = resume_helper
                        .call_arg(two_args(ctx.clone(), helper_state.clone(), payload)?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "QuickJS GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            QuickJsEvaluationErrorCode::StepRunFailed,
                            "QuickJS GameStep helper-call resume result did not include accepted."
                                .to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else {
                    return Err(call_error(
                        QuickJsEvaluationErrorCode::MissingResumeHandle,
                        format!(
                            "QuickJS GameStep resume handle \"{}\" has no active continuation.",
                            request.resume_handle_id
                        ),
                        None,
                    ));
                };
                if !accepted {
                    let last_command_index = commands.len();
                    return Ok(QuickJsStepResumeBoundary::Pending {
                        commands: step_commands_from_array_range(
                            ctx.clone(),
                            &commands,
                            handle.last_command_index,
                        )?,
                        pending_request: pending_step_request_from_states(
                            &wait_state,
                            &translation_state,
                            &pipeline_state,
                            &helper_state,
                            &resume_handle_id,
                        )?,
                        last_command_index,
                    });
                }

                match promise.finish::<()>() {
                    Ok(()) => Ok(QuickJsStepResumeBoundary::Complete(
                        step_commands_from_array_range(
                            ctx.clone(),
                            &commands,
                            handle.last_command_index,
                        )?,
                    )),
                    Err(Error::WouldBlock) => {
                        let last_command_index = commands.len();
                        Ok(QuickJsStepResumeBoundary::Pending {
                            commands: step_commands_from_array_range(
                                ctx.clone(),
                                &commands,
                                handle.last_command_index,
                            )?,
                            pending_request: pending_step_request_from_states(
                                &wait_state,
                                &translation_state,
                                &pipeline_state,
                                &helper_state,
                                &resume_handle_id,
                            )?,
                            last_command_index,
                        })
                    }
                    Err(error) => Err(step_run_error_from_unsupported_state(
                        &unsupported_state,
                        format!(
                            "QuickJS GameStep resume handle \"{}\" promise failed.",
                            request.resume_handle_id
                        ),
                        Some(error.to_string()),
                    )),
                }
            });

        match result {
            Ok(QuickJsStepResumeBoundary::Complete(commands)) => {
                Ok(QuickJsGameStepRunResponse::success(commands))
            }
            Ok(QuickJsStepResumeBoundary::Pending {
                commands,
                pending_request,
                last_command_index,
            }) => {
                handle.last_command_index = last_command_index;
                self.step_resume_handles.insert(resume_handle_id, handle);
                Ok(pending_request.into_response(commands))
            }
            Err(error) => Err(error),
        }
    }

    fn release_module_namespace(&mut self, module_namespace_id: &str) {
        self.namespaces.remove(module_namespace_id);
        self.step_run_handles
            .retain(|_, handle| handle.module_namespace_id != module_namespace_id);
        self.step_resume_handles
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

fn step_context_object<'js>(
    ctx: rquickjs::Ctx<'js>,
    ctx_json: Option<&str>,
) -> Result<Object<'js>, QuickJsEvaluationError> {
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
            value.into_object().ok_or_else(|| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidStepContext,
                    "QuickJS GameStep run ctxJson must be a JSON object.".to_string(),
                    None,
                )
            })
        }
        None => Object::new(ctx.clone()).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                "QuickJS GameStep run context object could not be created.".to_string(),
                Some(error.to_string()),
            )
        }),
    }
}

fn install_step_context_bridge<'js>(
    ctx: rquickjs::Ctx<'js>,
    ctx_object: &Object<'js>,
    commands: &Array<'js>,
    unsupported_state: &Object<'js>,
    wait_state: &Object<'js>,
    translation_state: &Object<'js>,
    pipeline_state: &Object<'js>,
    helper_state: &Object<'js>,
) -> Result<(), QuickJsEvaluationError> {
    let install: Function = ctx
        .eval(NATIVE_QUICKJS_STEP_CONTEXT_BRIDGE_SOURCE)
        .map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                "QuickJS StepContext bridge script could not be compiled.".to_string(),
                Some(error.to_string()),
            )
        })?;
    let methods = step_engine_command_methods_array(ctx.clone())?;
    let _: Value = install
        .call_arg(eight_args(
            ctx,
            ctx_object.clone(),
            commands.clone(),
            unsupported_state.clone(),
            wait_state.clone(),
            translation_state.clone(),
            pipeline_state.clone(),
            helper_state.clone(),
            methods,
        )?)
        .map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                "QuickJS StepContext bridge script could not be installed.".to_string(),
                Some(error.to_string()),
            )
        })?;
    Ok(())
}

fn step_engine_command_methods_array<'js>(
    ctx: rquickjs::Ctx<'js>,
) -> Result<Array<'js>, QuickJsEvaluationError> {
    let methods = Array::new(ctx.clone()).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext engine command method array could not be created.".to_string(),
            Some(error.to_string()),
        )
    })?;
    for (index, method) in NATIVE_QUICKJS_GAME_STEP_ENGINE_COMMAND_METHODS
        .iter()
        .enumerate()
    {
        methods.set(index, *method).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                "QuickJS StepContext engine command method could not be passed to bridge script."
                    .to_string(),
                Some(error.to_string()),
            )
        })?;
    }
    Ok(methods)
}

fn step_commands_from_array<'js>(
    ctx: rquickjs::Ctx<'js>,
    commands: &Array<'js>,
) -> Result<Vec<QuickJsGameStepCommand>, QuickJsEvaluationError> {
    step_commands_from_array_range(ctx, commands, 0)
}

fn step_commands_from_array_range<'js>(
    ctx: rquickjs::Ctx<'js>,
    commands: &Array<'js>,
    start_index: usize,
) -> Result<Vec<QuickJsGameStepCommand>, QuickJsEvaluationError> {
    let mut output = Vec::with_capacity(commands.len());
    for index in start_index..commands.len() {
        let command: Object = commands.get(index).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                format!("QuickJS GameStep command at index {index} must be an object."),
                Some(error.to_string()),
            )
        })?;
        let target: String = command.get("target").map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                format!("QuickJS GameStep command at index {index} requires a target."),
                Some(error.to_string()),
            )
        })?;
        if target != "engine" {
            return Err(call_error(
                QuickJsEvaluationErrorCode::UnsupportedStepContextCommand,
                format!("QuickJS GameStep command target \"{target}\" is not supported."),
                None,
            ));
        }
        let method: String = command.get("method").map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                format!("QuickJS GameStep command at index {index} requires a method."),
                Some(error.to_string()),
            )
        })?;
        if !is_allowed_step_engine_command_method(&method) {
            return Err(call_error(
                QuickJsEvaluationErrorCode::UnsupportedStepContextCommand,
                format!("QuickJS GameStep engine command \"{method}\" is not allowlisted."),
                None,
            ));
        }
        let args_value: Value = command.get("argsJson").map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidStepContext,
                format!("QuickJS GameStep command \"{method}\" argsJson could not be read."),
                Some(error.to_string()),
            )
        })?;
        let args_json = if args_value.is_undefined() || args_value.is_null() {
            None
        } else {
            let args_json: String = command.get("argsJson").map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidStepContext,
                    format!("QuickJS GameStep command \"{method}\" argsJson must be a string."),
                    Some(error.to_string()),
                )
            })?;
            let parsed_args = ctx.json_parse(args_json.as_str()).map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidStepContext,
                    format!("QuickJS GameStep command \"{method}\" argsJson must be valid JSON."),
                    Some(error.to_string()),
                )
            })?;
            if !parsed_args.is_array() {
                return Err(call_error(
                    QuickJsEvaluationErrorCode::InvalidStepContext,
                    format!("QuickJS GameStep command \"{method}\" argsJson must be a JSON array."),
                    None,
                ));
            }
            Some(args_json)
        };
        output.push(QuickJsGameStepCommand {
            target,
            method,
            args_json,
        });
    }
    Ok(output)
}

fn wait_state_is_active(wait_state: &Object<'_>) -> Result<bool, QuickJsEvaluationError> {
    let active: Value = wait_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep wait state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    wait_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep wait state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn translation_state_is_active(
    translation_state: &Object<'_>,
) -> Result<bool, QuickJsEvaluationError> {
    let active: Value = translation_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep translation state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    translation_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep translation state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn pipeline_state_is_active(pipeline_state: &Object<'_>) -> Result<bool, QuickJsEvaluationError> {
    let active: Value = pipeline_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep pipeline state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    pipeline_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep pipeline state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn helper_state_is_active(helper_state: &Object<'_>) -> Result<bool, QuickJsEvaluationError> {
    let active: Value = helper_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep helper-call state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    helper_state.get("active").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep helper-call state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn pending_step_request_from_states(
    wait_state: &Object<'_>,
    translation_state: &Object<'_>,
    pipeline_state: &Object<'_>,
    helper_state: &Object<'_>,
    resume_handle_id: &str,
) -> Result<QuickJsPendingStepRequest, QuickJsEvaluationError> {
    let wait_active = wait_state_is_active(wait_state)?;
    let translation_active = translation_state_is_active(translation_state)?;
    let pipeline_active = pipeline_state_is_active(pipeline_state)?;
    let helper_active = helper_state_is_active(helper_state)?;
    match (wait_active, translation_active, pipeline_active, helper_active) {
        (true, false, false, false) => Ok(QuickJsPendingStepRequest::Wait(
            pending_wait_from_state(wait_state, resume_handle_id)?,
        )),
        (false, true, false, false) => Ok(QuickJsPendingStepRequest::Translation(
            pending_translation_from_state(translation_state, resume_handle_id)?,
        )),
        (false, false, true, false) => Ok(QuickJsPendingStepRequest::PipelineEmit(
            pending_pipeline_emit_from_state(pipeline_state, resume_handle_id)?,
        )),
        (false, false, false, true) => Ok(QuickJsPendingStepRequest::HelperCall(
            pending_helper_call_from_state(helper_state, resume_handle_id)?,
        )),
        (false, false, false, false) => Err(call_error(
            QuickJsEvaluationErrorCode::StepRunFailed,
            "QuickJS GameStep promise blocked without an active StepContext continuation."
                .to_string(),
            Some("Native QuickJS can only suspend GameStep runs at ctx.engine.waitFor, ctx.t, ctx.pipeline.emit, or a registered native helper call.".to_string()),
        )),
        _ => Err(call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS GameStep promise blocked with multiple active StepContext continuations."
                .to_string(),
            Some(
                "Native QuickJS can only suspend one StepContext continuation at a time."
                    .to_string(),
            ),
        )),
    }
}

fn pending_wait_from_state(
    wait_state: &Object<'_>,
    resume_handle_id: &str,
) -> Result<QuickJsGameStepWaitRequest, QuickJsEvaluationError> {
    if !wait_state_is_active(wait_state)? {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidWaitEvent,
            "QuickJS GameStep promise blocked without an active engine.waitFor.".to_string(),
            Some(
                "Native QuickJS can only suspend GameStep runs at ctx.engine.waitFor.".to_string(),
            ),
        ));
    }
    let event: String = wait_state.get("event").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidWaitEvent,
            "QuickJS GameStep wait state requires a pipeline event name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_quickjs_bridge_text(&event) {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidWaitEvent,
            "QuickJS GameStep wait event name is invalid.".to_string(),
            Some("Wait event names must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    Ok(QuickJsGameStepWaitRequest {
        resume_handle_id: resume_handle_id.to_string(),
        event,
    })
}

fn pending_translation_from_state(
    translation_state: &Object<'_>,
    resume_handle_id: &str,
) -> Result<QuickJsGameStepTranslationRequest, QuickJsEvaluationError> {
    if !translation_state_is_active(translation_state)? {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidTranslationRequest,
            "QuickJS GameStep promise blocked without an active ctx.t request.".to_string(),
            Some("Native QuickJS can only translate through ctx.t continuations.".to_string()),
        ));
    }
    let key: String = translation_state.get("key").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidTranslationRequest,
            "QuickJS GameStep translation state requires a translation key.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_quickjs_bridge_text(&key) {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidTranslationRequest,
            "QuickJS GameStep translation key is invalid.".to_string(),
            Some("Translation keys must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    let options_value: Value = translation_state.get("optionsJson").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidTranslationRequest,
            "QuickJS GameStep translation optionsJson could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    let options_json = if options_value.is_undefined() || options_value.is_null() {
        None
    } else {
        let options_json: String = translation_state.get("optionsJson").map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidTranslationRequest,
                "QuickJS GameStep translation optionsJson must be a string.".to_string(),
                Some(error.to_string()),
            )
        })?;
        let parsed_options: serde_json::Value = serde_json::from_str(options_json.as_str())
            .map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidTranslationRequest,
                    "QuickJS GameStep translation optionsJson must be valid JSON.".to_string(),
                    Some(error.to_string()),
                )
            })?;
        if !parsed_options.is_object() && !parsed_options.is_array() {
            return Err(call_error(
                QuickJsEvaluationErrorCode::InvalidTranslationRequest,
                "QuickJS GameStep translation optionsJson must be a JSON object or array."
                    .to_string(),
                None,
            ));
        }
        Some(options_json)
    };
    Ok(QuickJsGameStepTranslationRequest {
        resume_handle_id: resume_handle_id.to_string(),
        key,
        options_json,
    })
}

fn pending_pipeline_emit_from_state(
    pipeline_state: &Object<'_>,
    resume_handle_id: &str,
) -> Result<QuickJsGameStepPipelineEmitRequest, QuickJsEvaluationError> {
    if !pipeline_state_is_active(pipeline_state)? {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidPipelineRequest,
            "QuickJS GameStep promise blocked without an active ctx.pipeline.emit request."
                .to_string(),
            Some("Native QuickJS can only emit pipeline events through ctx.pipeline.emit continuations.".to_string()),
        ));
    }
    let event: String = pipeline_state.get("event").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidPipelineRequest,
            "QuickJS GameStep pipeline state requires an event name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_quickjs_bridge_text(&event) {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidPipelineRequest,
            "QuickJS GameStep pipeline event name is invalid.".to_string(),
            Some("Pipeline event names must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    let payload_value: Value = pipeline_state.get("payloadJson").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidPipelineRequest,
            "QuickJS GameStep pipeline payloadJson could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    let payload_json = if payload_value.is_undefined() || payload_value.is_null() {
        None
    } else {
        let payload_json: String = pipeline_state.get("payloadJson").map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidPipelineRequest,
                "QuickJS GameStep pipeline payloadJson must be a string.".to_string(),
                Some(error.to_string()),
            )
        })?;
        serde_json::from_str::<serde_json::Value>(payload_json.as_str()).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidPipelineRequest,
                "QuickJS GameStep pipeline payloadJson must be valid JSON.".to_string(),
                Some(error.to_string()),
            )
        })?;
        Some(payload_json)
    };
    Ok(QuickJsGameStepPipelineEmitRequest {
        resume_handle_id: resume_handle_id.to_string(),
        event,
        payload_json,
    })
}

fn pending_helper_call_from_state(
    helper_state: &Object<'_>,
    resume_handle_id: &str,
) -> Result<QuickJsGameStepHelperCallRequest, QuickJsEvaluationError> {
    if !helper_state_is_active(helper_state)? {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
            "QuickJS GameStep promise blocked without an active native helper call.".to_string(),
            Some("Native QuickJS can only bridge registered helper imports through native helper continuations.".to_string()),
        ));
    }
    let module: String = helper_state.get("module").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
            "QuickJS GameStep helper-call state requires a module name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_quickjs_bridge_text(&module) {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
            "QuickJS GameStep helper-call module name is invalid.".to_string(),
            Some("Helper module names must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    let export_name: String = helper_state.get("exportName").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
            "QuickJS GameStep helper-call state requires an export name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_quickjs_bridge_text(&export_name)
        || matches!(
            export_name.as_str(),
            "__proto__" | "prototype" | "constructor"
        )
    {
        return Err(call_error(
            QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
            "QuickJS GameStep helper-call export name is invalid.".to_string(),
            Some("Helper export names must be safe bridge text and must not be prototype-related names.".to_string()),
        ));
    }
    let args_value: Value = helper_state.get("argsJson").map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
            "QuickJS GameStep helper-call argsJson could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    let args_json = if args_value.is_undefined() || args_value.is_null() {
        None
    } else {
        let args_json: String = helper_state.get("argsJson").map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
                "QuickJS GameStep helper-call argsJson must be a string.".to_string(),
                Some(error.to_string()),
            )
        })?;
        let parsed_args: serde_json::Value =
            serde_json::from_str(args_json.as_str()).map_err(|error| {
                call_error(
                    QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
                    "QuickJS GameStep helper-call argsJson must be valid JSON.".to_string(),
                    Some(error.to_string()),
                )
            })?;
        if !parsed_args.is_array() {
            return Err(call_error(
                QuickJsEvaluationErrorCode::InvalidHelperCallRequest,
                "QuickJS GameStep helper-call argsJson must be a JSON array.".to_string(),
                None,
            ));
        }
        Some(args_json)
    };
    Ok(QuickJsGameStepHelperCallRequest {
        resume_handle_id: resume_handle_id.to_string(),
        module,
        export_name,
        args_json,
    })
}

fn is_safe_quickjs_bridge_text(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn is_allowed_step_engine_command_method(method: &str) -> bool {
    NATIVE_QUICKJS_GAME_STEP_ENGINE_COMMAND_METHODS
        .iter()
        .any(|allowed| *allowed == method)
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

fn eight_args<'js>(
    ctx: rquickjs::Ctx<'js>,
    first: Object<'js>,
    second: Array<'js>,
    third: Object<'js>,
    fourth: Object<'js>,
    fifth: Object<'js>,
    sixth: Object<'js>,
    seventh: Object<'js>,
    eighth: Array<'js>,
) -> Result<rquickjs::function::Args<'js>, QuickJsEvaluationError> {
    let mut args = rquickjs::function::Args::new(ctx, 8);
    args.push_arg(first).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext object could not be passed to bridge script.".to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(second).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext command array could not be passed to bridge script.".to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(third).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext unsupported-command marker could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(fourth).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext wait state could not be passed to bridge script.".to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(fifth).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext translation state could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(sixth).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext pipeline state could not be passed to bridge script.".to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(seventh).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext helper-call state could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(eighth).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidStepContext,
            "QuickJS StepContext engine command methods could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    Ok(args)
}

fn two_args<'js>(
    ctx: rquickjs::Ctx<'js>,
    first: Object<'js>,
    second: Value<'js>,
) -> Result<rquickjs::function::Args<'js>, QuickJsEvaluationError> {
    let mut args = rquickjs::function::Args::new(ctx, 2);
    args.push_arg(first).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::StepRunFailed,
            "QuickJS StepContext wait state could not be passed to resume script.".to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(second).map_err(|error| {
        call_error(
            QuickJsEvaluationErrorCode::InvalidResumePayload,
            "QuickJS GameStep resume payload could not be passed to QuickJS.".to_string(),
            Some(error.to_string()),
        )
    })?;
    Ok(args)
}

fn resume_payload_value<'js>(
    ctx: rquickjs::Ctx<'js>,
    payload_json: Option<&str>,
) -> Result<Value<'js>, QuickJsEvaluationError> {
    match payload_json {
        Some(payload_json) => ctx.json_parse(payload_json).map_err(|error| {
            call_error(
                QuickJsEvaluationErrorCode::InvalidResumePayload,
                "QuickJS GameStep resume payloadJson must be valid JSON.".to_string(),
                Some(error.to_string()),
            )
        }),
        None => Ok(Value::new_undefined(ctx)),
    }
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

fn step_run_error_from_unsupported_state<'js>(
    unsupported_state: &Object<'js>,
    message: String,
    detail: Option<String>,
) -> QuickJsEvaluationError {
    let unsupported_name = unsupported_state
        .get::<_, Value>("name")
        .ok()
        .and_then(|value| {
            if value.is_undefined() || value.is_null() {
                None
            } else {
                unsupported_state.get::<_, String>("name").ok()
            }
        });
    if let Some(name) = unsupported_name {
        return call_error(
            QuickJsEvaluationErrorCode::UnsupportedStepContextCommand,
            format!("QuickJS GameStep run reached unsupported StepContext command {name}."),
            Some(format!(
                "Native QuickJS StepContext {name} requires a native continuation bridge.{}",
                detail
                    .map(|value| format!(" QuickJS detail: {value}"))
                    .unwrap_or_default()
            )),
        );
    }
    call_error(QuickJsEvaluationErrorCode::StepRunFailed, message, detail)
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
    fn evaluates_compiled_quascript_with_builtin_character_helpers() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                import { resolveQuaText } from '@quajs/engine';
                import { speakWithEngine } from '@quajs/character';

                export default function opening(scope = {}) {
                    return [{
                        uuid: 'intro.speak',
                        async run(ctx) {
                            const text = await resolveQuaText(ctx, ['Hi ', scope.playerName]);
                            await speakWithEngine(ctx.engine, 'alice', text, {
                                wait: false,
                                avatar: 'alice.png',
                                speaker: 'Alice'
                            });
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: Some("{\"playerName\":\"Mira\"}".to_string()),
            })
            .unwrap()
            .steps
            .unwrap();

        let run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.speak\"}".to_string()),
            })
            .unwrap();

        let commands = run.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].target, "engine");
        assert_eq!(commands[0].method, "showDialogue");
        let args: serde_json::Value =
            serde_json::from_str(commands[0].args_json.as_deref().unwrap()).unwrap();
        assert_eq!(args[0]["characterId"], "alice");
        assert_eq!(args[0]["characterName"], "alice");
        assert_eq!(args[0]["text"], "Hi Mira");
        assert_eq!(args[0]["mode"], "say");
        assert_eq!(args[0]["speaker"], "Alice");
        assert_eq!(args[0]["avatar"]["type"], "images");
        assert_eq!(args[0]["avatar"]["name"], "alice.png");
    }

    #[test]
    fn builtin_character_helpers_suspend_on_wait_for() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                import { narrateWithEngine } from '@quajs/character';

                export default function opening() {
                    return [{
                        uuid: 'intro.narrate',
                        async run(ctx) {
                            await narrateWithEngine(ctx.engine, 'Hello from native QuickJS.');
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.narrate\"}".to_string()),
            })
            .unwrap();

        assert!(run.ok);
        assert_eq!(run.commands.unwrap()[0].method, "showDialogue");
        let pending = run.pending_wait.unwrap();
        assert_eq!(pending.event, "user/advance");
        assert!(pending
            .resume_handle_id
            .starts_with("quickjs:rquickjs:resume:"));
    }

    #[test]
    fn rejects_non_builtin_module_imports_without_host_resolution() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let error = evaluator
            .evaluate_module(&request_for_code(
                "scripts/unsafe-import.js",
                "import { readFile } from 'node:fs'; export const unsafe = readFile;",
            ))
            .unwrap_err();

        assert_eq!(error.code, QuickJsEvaluationErrorCode::EvaluationFailed);
        assert_eq!(
            error.asset_name,
            Some("scripts/unsafe-import.js".to_string())
        );
        assert!(error.detail.as_deref().unwrap_or_default().len() > 0);
        assert_eq!(evaluator.namespace_count(), 0);
    }

    #[test]
    fn builtin_helper_imports_can_be_reused_across_modules() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let first = evaluator
            .evaluate_module(&request_for_code(
                "scripts/first.js",
                "import { RenderToLogicEvents } from '@quajs/engine'; export function value() { return RenderToLogicEvents.USER_ADVANCE + ':one'; }",
            ))
            .unwrap()
            .module_namespace_id
            .unwrap();
        let second = evaluator
            .evaluate_module(&request_for_code(
                "scripts/second.js",
                "import { RenderToLogicEvents } from '@quajs/engine'; export function value() { return RenderToLogicEvents.USER_ADVANCE + ':two'; }",
            ))
            .unwrap()
            .module_namespace_id
            .unwrap();

        assert_eq!(
            exported_call_string(&mut evaluator, &first, "value"),
            "user/advance:one"
        );
        assert_eq!(
            exported_call_string(&mut evaluator, &second, "value"),
            "user/advance:two"
        );
    }

    #[test]
    fn evaluates_package_local_module_graph_imports() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let mut request = request_for_code(
            "scripts/opening.js",
            r#"
            import { buildTitle } from './helpers/title.js?cache=1#runtime';
            export function title(name) { return buildTitle(name); }
            "#,
        );
        request.module_graph.push(QuickJsRuntimeModuleRecord {
            asset_name: "scripts/helpers/title.js?cache=1#runtime".to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: QuickJsRuntimeModuleKind::Script,
            code: "export function buildTitle(name) { return `Opening:${name}`; }".to_string(),
            bytes: b"export function buildTitle(name) { return `Opening:${name}`; }".to_vec(),
        });

        let module_namespace_id = evaluator
            .evaluate_module(&request)
            .unwrap()
            .module_namespace_id
            .unwrap();
        let call = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "title".to_string(),
                args_json: Some("[\"Mira\"]".to_string()),
            })
            .unwrap();

        assert_eq!(call.value_json, Some("\"Opening:Mira\"".to_string()));
    }

    #[test]
    fn rejects_package_local_imports_not_declared_in_module_graph() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let error = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                "import { buildTitle } from './helpers/title.js'; export const title = buildTitle('Mira');",
            ))
            .unwrap_err();

        assert_eq!(error.code, QuickJsEvaluationErrorCode::EvaluationFailed);
        assert_eq!(error.asset_name, Some("scripts/opening.js".to_string()));
        assert!(error.detail.as_deref().unwrap_or_default().len() > 0);
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
        assert_eq!(run.commands, Some(Vec::new()));

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
    fn game_step_run_captures_allowlisted_engine_commands() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                export default function opening() {
                    return [{
                        uuid: 'intro.choices',
                        async run(ctx) {
                            await ctx.engine.showChoices([{ id: 'go', text: 'Go' }]);
                            await ctx.engine.clearChoices();
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.choices\"}".to_string()),
            })
            .unwrap();

        let commands = run.commands.unwrap();
        assert_eq!(commands.len(), 2);
        assert_eq!(commands[0].target, "engine");
        assert_eq!(commands[0].method, "showChoices");
        assert_eq!(
            commands[0].args_json,
            Some("[[{\"id\":\"go\",\"text\":\"Go\"}]]".to_string())
        );
        assert_eq!(commands[1].target, "engine");
        assert_eq!(commands[1].method, "clearChoices");
        assert_eq!(commands[1].args_json, Some("[]".to_string()));
    }

    #[test]
    fn game_step_wait_for_suspends_and_resumes_same_promise() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                let selected = null;
                export default function opening() {
                    return [{
                        uuid: 'intro.wait',
                        async run(ctx) {
                            await ctx.engine.showChoices([{ id: 'go', text: 'Go' }]);
                            selected = await ctx.engine.waitFor('user/choice_select', payload => payload.choiceId === 'go');
                            await ctx.engine.clearChoices();
                        }
                    }];
                }
                export function getSelected() { return selected; }
                "#,
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

        let pending_run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.wait\"}".to_string()),
            })
            .unwrap();

        assert_eq!(pending_run.commands.as_ref().unwrap().len(), 1);
        assert_eq!(
            pending_run.commands.as_ref().unwrap()[0].method,
            "showChoices"
        );
        let pending_wait = pending_run.pending_wait.unwrap();
        assert_eq!(pending_wait.event, "user/choice_select");
        assert_eq!(evaluator.step_resume_handle_count(), 1);

        let still_pending = evaluator
            .resume_game_step_run(&QuickJsGameStepResumeRequest {
                resume_handle_id: pending_wait.resume_handle_id.clone(),
                payload_json: Some("{\"choiceId\":\"stay\"}".to_string()),
            })
            .unwrap();

        assert!(still_pending.commands.unwrap().is_empty());
        assert_eq!(
            still_pending
                .pending_wait
                .as_ref()
                .unwrap()
                .resume_handle_id,
            pending_wait.resume_handle_id.as_str()
        );
        assert_eq!(evaluator.step_resume_handle_count(), 1);

        let completed = evaluator
            .resume_game_step_run(&QuickJsGameStepResumeRequest {
                resume_handle_id: pending_wait.resume_handle_id.clone(),
                payload_json: Some("{\"choiceId\":\"go\"}".to_string()),
            })
            .unwrap();

        assert!(completed.pending_wait.is_none());
        let commands = completed.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].method, "clearChoices");
        assert_eq!(evaluator.step_resume_handle_count(), 0);
        let selected = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "getSelected".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(
            selected.value_json,
            Some("{\"choiceId\":\"go\"}".to_string())
        );
    }

    #[test]
    fn game_step_translation_suspends_and_resumes_same_promise() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/translated-opening.js",
                r#"
                let translated = null;
                export default function opening() {
                    return [{
                        uuid: 'intro.translate',
                        async run(ctx) {
                            const text = await ctx.t('runtime.greeting', { values: { name: 'Mira' } });
                            translated = text;
                            await ctx.engine.showDialogue({ text });
                        }
                    }];
                }
                export function getTranslated() { return translated; }
                "#,
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

        let pending_run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.translate\"}".to_string()),
            })
            .unwrap();

        assert!(pending_run.commands.as_ref().unwrap().is_empty());
        assert!(pending_run.pending_wait.is_none());
        let pending_translation = pending_run.pending_translation.unwrap();
        assert_eq!(pending_translation.key, "runtime.greeting");
        assert_eq!(
            pending_translation.options_json,
            Some("{\"values\":{\"name\":\"Mira\"}}".to_string())
        );
        assert_eq!(evaluator.step_resume_handle_count(), 1);

        let completed = evaluator
            .resume_game_step_run(&QuickJsGameStepResumeRequest {
                resume_handle_id: pending_translation.resume_handle_id.clone(),
                payload_json: Some("\"Hello, Mira\"".to_string()),
            })
            .unwrap();

        assert!(completed.pending_wait.is_none());
        assert!(completed.pending_translation.is_none());
        let commands = completed.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].method, "showDialogue");
        assert_eq!(
            commands[0].args_json,
            Some("[{\"text\":\"Hello, Mira\"}]".to_string())
        );
        assert_eq!(evaluator.step_resume_handle_count(), 0);
        let translated = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "getTranslated".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(translated.value_json, Some("\"Hello, Mira\"".to_string()));
    }

    #[test]
    fn game_step_translation_rejects_unsafe_requests_and_resume_payloads() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/unsafe-translation.js",
                r#"
                export function unsafeKey() {
                    return [{
                        uuid: 'intro.bad-key',
                        async run(ctx) { await ctx.t(42); }
                    }];
                }
                export function unsafeOptions() {
                    return [{
                        uuid: 'intro.bad-options',
                        async run(ctx) { await ctx.t('runtime.greeting', 'Mira'); }
                    }];
                }
                export function pendingTranslation() {
                    return [{
                        uuid: 'intro.bad-resume',
                        async run(ctx) { await ctx.t('runtime.greeting'); }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let unsafe_key_step = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "unsafeKey".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_key = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: unsafe_key_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-key\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(unsafe_key.code, QuickJsEvaluationErrorCode::StepRunFailed);
        assert!(unsafe_key.message.contains("promise failed"));

        let unsafe_options_step = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "unsafeOptions".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_options = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: unsafe_options_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-options\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(
            unsafe_options.code,
            QuickJsEvaluationErrorCode::StepRunFailed
        );
        assert!(unsafe_options.message.contains("promise failed"));

        let pending_step = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "pendingTranslation".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let pending_run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: pending_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-resume\"}".to_string()),
            })
            .unwrap();
        let pending_translation = pending_run.pending_translation.unwrap();
        let bad_resume = evaluator
            .resume_game_step_run(&QuickJsGameStepResumeRequest {
                resume_handle_id: pending_translation.resume_handle_id,
                payload_json: Some("{\"text\":\"Hello\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(bad_resume.code, QuickJsEvaluationErrorCode::StepRunFailed);
        assert!(bad_resume.message.contains("resume handle"));
    }

    #[test]
    fn game_step_pipeline_emit_suspends_and_resumes_same_promise() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/pipeline-opening.js",
                r#"
                let emitted = false;
                export default function opening() {
                    return [{
                        uuid: 'intro.pipeline',
                        async run(ctx) {
                            await ctx.pipeline.emit('plugin/custom_event', { value: 42 });
                            emitted = true;
                            await ctx.engine.clearChoices();
                        }
                    }];
                }
                export function getEmitted() { return emitted; }
                "#,
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

        let pending_run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.pipeline\"}".to_string()),
            })
            .unwrap();

        assert!(pending_run.commands.as_ref().unwrap().is_empty());
        assert!(pending_run.pending_wait.is_none());
        assert!(pending_run.pending_translation.is_none());
        let pending_pipeline = pending_run.pending_pipeline_emit.unwrap();
        assert_eq!(pending_pipeline.event, "plugin/custom_event");
        assert_eq!(
            pending_pipeline.payload_json,
            Some("{\"value\":42}".to_string())
        );
        assert_eq!(evaluator.step_resume_handle_count(), 1);

        let completed = evaluator
            .resume_game_step_run(&QuickJsGameStepResumeRequest {
                resume_handle_id: pending_pipeline.resume_handle_id.clone(),
                payload_json: None,
            })
            .unwrap();

        assert!(completed.pending_wait.is_none());
        assert!(completed.pending_translation.is_none());
        assert!(completed.pending_pipeline_emit.is_none());
        let commands = completed.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].method, "clearChoices");
        assert_eq!(evaluator.step_resume_handle_count(), 0);
        let emitted = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "getEmitted".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(emitted.value_json, Some("true".to_string()));
    }

    #[test]
    fn game_step_pipeline_emit_rejects_unsafe_events_and_payloads() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/unsafe-pipeline.js",
                r#"
                export function unsafeEvent() {
                    return [{
                        uuid: 'intro.bad-event',
                        async run(ctx) { await ctx.pipeline.emit(' bad/event', { ok: true }); }
                    }];
                }
                export function unsafePayload() {
                    return [{
                        uuid: 'intro.bad-payload',
                        async run(ctx) { await ctx.pipeline.emit('plugin/custom_event', { bad: undefined }); }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let unsafe_event_step = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "unsafeEvent".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_event = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: unsafe_event_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-event\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(unsafe_event.code, QuickJsEvaluationErrorCode::StepRunFailed);
        assert!(unsafe_event.message.contains("promise failed"));

        let unsafe_payload_step = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "unsafePayload".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_payload = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: unsafe_payload_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-payload\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(
            unsafe_payload.code,
            QuickJsEvaluationErrorCode::StepRunFailed
        );
        assert!(unsafe_payload.message.contains("promise failed"));
    }

    #[test]
    fn game_step_helper_import_suspends_and_resumes_same_promise() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/helper-opening.js",
                r#"
                import { setBackgroundWithEngine } from '@quajs/plugin-background';

                let helperResult = null;
                export default function opening() {
                    return [{
                        uuid: 'intro.helper',
                        async run(ctx) {
                            helperResult = await setBackgroundWithEngine(ctx.engine, 'bg/opening.png', {
                                transition: { type: 'fade' }
                            });
                            await ctx.engine.showDialogue({ text: helperResult });
                        }
                    }];
                }
                export function getHelperResult() { return helperResult; }
                "#,
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

        let pending_run = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.helper\"}".to_string()),
            })
            .unwrap();

        assert!(pending_run.commands.as_ref().unwrap().is_empty());
        assert!(pending_run.pending_wait.is_none());
        assert!(pending_run.pending_translation.is_none());
        assert!(pending_run.pending_pipeline_emit.is_none());
        let pending_helper = pending_run.pending_helper_call.unwrap();
        assert_eq!(pending_helper.module, "@quajs/plugin-background");
        assert_eq!(pending_helper.export_name, "setBackgroundWithEngine");
        assert_eq!(
            pending_helper.args_json,
            Some("[\"bg/opening.png\",{\"transition\":{\"type\":\"fade\"}}]".to_string())
        );
        assert_eq!(evaluator.step_resume_handle_count(), 1);

        let completed = evaluator
            .resume_game_step_run(&QuickJsGameStepResumeRequest {
                resume_handle_id: pending_helper.resume_handle_id.clone(),
                payload_json: Some("\"background-applied\"".to_string()),
            })
            .unwrap();

        assert!(completed.pending_helper_call.is_none());
        let commands = completed.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].method, "showDialogue");
        assert_eq!(
            commands[0].args_json,
            Some("[{\"text\":\"background-applied\"}]".to_string())
        );
        assert_eq!(evaluator.step_resume_handle_count(), 0);
        let helper_result = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id,
                export_name: "getHelperResult".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(
            helper_result.value_json,
            Some("\"background-applied\"".to_string())
        );
    }

    #[test]
    fn game_step_helper_import_rejects_unsafe_arguments() {
        let mut evaluator = RquickJsModuleEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/unsafe-helper.js",
                r#"
                import { setBackgroundWithEngine } from '@quajs/plugin-background';

                export default function opening() {
                    return [{
                        uuid: 'intro.bad-helper',
                        async run(ctx) {
                            await setBackgroundWithEngine(ctx.engine, undefined);
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&QuickJsGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let error = evaluator
            .call_game_step_run(&QuickJsGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.bad-helper\"}".to_string()),
            })
            .unwrap_err();

        assert_eq!(error.code, QuickJsEvaluationErrorCode::StepRunFailed);
        assert!(error.message.contains("promise failed"));
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
        assert_eq!(evaluator.step_resume_handle_count(), 0);
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

    fn exported_call_string(
        evaluator: &mut RquickJsModuleEvaluator,
        module_namespace_id: &str,
        export_name: &str,
    ) -> String {
        let call = evaluator
            .call_module_export(&QuickJsModuleExportCallRequest {
                module_namespace_id: module_namespace_id.to_string(),
                export_name: export_name.to_string(),
                args_json: None,
            })
            .unwrap();
        serde_json::from_str::<String>(call.value_json.as_deref().unwrap()).unwrap()
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
            module_graph: Vec::new(),
            limits: QuickJsSandboxLimits::default(),
        }
    }
}
