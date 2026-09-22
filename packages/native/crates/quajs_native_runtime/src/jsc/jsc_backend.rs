use std::collections::BTreeMap;
use std::time::Duration;

use super::modules::evaluate_module;
use super::value::{self as js, Array, Context, Error, FromJs, Function, Object, Promise, Value};

use super::{
    validate_jsc_evaluation_request, validate_jsc_game_step_factory_call_request,
    validate_jsc_game_step_run_request, validate_jsc_module_export_call_request,
    validate_jsc_pipeline_listener_dispatch_request, JscEvaluationError, JscEvaluationErrorCode,
    JscEvaluationRequest, JscEvaluationResponse, JscEvaluationResult, JscGameStepCommand,
    JscGameStepDescriptor, JscGameStepFactoryCallRequest, JscGameStepFactoryCallResponse,
    JscGameStepFactoryCallResult, JscGameStepHelperCallRequest, JscGameStepPipelineEmitRequest,
    JscGameStepResumeRequest, JscGameStepRunRequest, JscGameStepRunResponse, JscGameStepRunResult,
    JscGameStepTranslationRequest, JscGameStepWaitRequest, JscModuleEvaluator,
    JscModuleExportCallRequest, JscModuleExportCallResponse, JscModuleExportCallResult,
    JscPipelineListenerDispatchRequest, JscPipelineListenerDispatchResponse,
    JscPipelineListenerDispatchResult, JscPipelineMessage, JscPipelineSubscriptionChange,
    JscPipelineSubscriptionOperation, JscRendererIntentDispatchResult, JscSandboxLimits,
};

/// Installed as a global before the bridge prelude runs, so `console.*` inside
/// JavaScriptCore forwards to the host `log` facade instead of being discarded.
const NATIVE_JSC_CONSOLE_WRITE: &str = "__quaNativeConsoleWrite";

const NATIVE_JSC_RENDERER_BRIDGE_SOURCE: &str = r#"
(() => {
  {
    // `__quaNativeConsoleWrite(level, message)` is installed from Rust and
    // routes into the host logger. Engine and game `console.*` calls used to be
    // bound to no-ops here, which silently discarded every JS-side diagnostic.
    const write = globalThis.__quaNativeConsoleWrite;
    const format = (values) => {
      let text = '';
      for (let index = 0; index < values.length; index += 1) {
        if (index > 0) {
          text += ' ';
        }
        text += stringify(values[index]);
      }
      return text;
    };
    const stringify = (value) => {
      if (typeof value === 'string') {
        return value;
      }
      if (value instanceof Error) {
        // JavaScriptCore `error.stack` holds only frames, with no leading
        // "Name: message" line the way browsers do. Always build the
        // description first so the reason cannot be lost, then append frames.
        const description = `${value.name || 'Error'}: ${value.message}`;
        return value.stack ? `${description}\n${value.stack}` : description;
      }
      if (typeof value === 'bigint') {
        return `${value}n`;
      }
      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
      }
      if (typeof value === 'undefined') {
        return 'undefined';
      }
      if (value === null) {
        return 'null';
      }
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value) ?? String(value);
        }
        catch {
          return String(value);
        }
      }
      return String(value);
    };
    const emit = typeof write === 'function'
      ? level => (...values) => {
          try {
            write(level, format(values));
          }
          catch {
            // Never let a logging failure break story execution.
          }
        }
      : () => () => {};
    Object.defineProperty(globalThis, 'console', {
      value: Object.freeze({
        debug: emit('debug'),
        error: emit('error'),
        info: emit('info'),
        log: emit('info'),
        trace: emit('trace'),
        warn: emit('warn'),
      }),
      enumerable: false,
      configurable: false,
      writable: false
    });
  }
  // QuaEngine uses AbortController to cancel in-flight story steps. JavaScriptCore is
  // intentionally not a browser environment, so provide only the small
  // AbortSignal surface the engine needs instead of importing Web APIs.
  if (typeof globalThis.AbortController !== 'function') {
    class QuaAbortSignal {
      constructor() {
        this.aborted = false;
        this.reason = undefined;
        this._listeners = [];
      }
      addEventListener(type, listener) {
        if (type === 'abort' && typeof listener === 'function') {
          this._listeners.push(listener);
        }
      }
      removeEventListener(type, listener) {
        if (type === 'abort') {
          this._listeners = this._listeners.filter(candidate => candidate !== listener);
        }
      }
    }
    class QuaAbortController {
      constructor() {
        this.signal = new QuaAbortSignal();
      }
      abort(reason) {
        if (this.signal.aborted) {
          return;
        }
        this.signal.aborted = true;
        this.signal.reason = reason;
        for (const listener of this.signal._listeners.slice()) {
          listener.call(this.signal, { type: 'abort', target: this.signal });
        }
      }
    }
    Object.defineProperty(globalThis, 'AbortSignal', {
      value: QuaAbortSignal,
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(globalThis, 'AbortController', {
      value: QuaAbortController,
      enumerable: false,
      configurable: true,
      writable: true
    });
  }
  if (typeof globalThis.setTimeout !== 'function') {
    let nextTimerId = 1;
    const timers = new Map();
    Object.defineProperty(globalThis, 'setTimeout', {
      value(callback, delay = 0, ...args) {
        if (typeof callback !== 'function') {
          throw new TypeError('setTimeout callback must be a function.');
        }
        const id = nextTimerId++;
        const normalizedDelay = Number.isFinite(Number(delay))
          ? Math.max(0, Number(delay))
          : 0;
        timers.set(id, {
          callback,
          args,
          dueAt: Date.now() + normalizedDelay
        });
        return id;
      },
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(globalThis, 'clearTimeout', {
      value(id) {
        timers.delete(id);
      },
      enumerable: false,
      configurable: true,
      writable: true
    });
    Object.defineProperty(globalThis, '__quaNativePumpTimers', {
      value() {
        const now = Date.now();
        const due = Array.from(timers.entries())
          .filter(([, timer]) => timer.dueAt <= now)
          .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0]);
        for (const [id, timer] of due) {
          if (!timers.delete(id)) {
            continue;
          }
          timer.callback(...timer.args);
        }
      },
      enumerable: false,
      configurable: false,
      writable: false
    });
    Object.defineProperty(globalThis, '__quaNativeNextTimerDelay', {
      value() {
        let deadline = Infinity;
        for (const timer of timers.values()) deadline = Math.min(deadline, timer.dueAt);
        return deadline === Infinity ? -1 : Math.max(0, deadline - Date.now());
      },
      configurable: false,
      writable: false
    });
  }
  const state = { listener: undefined };
  const bridge = Object.freeze({
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('Native renderer intent bridge subscribe requires a function.');
      }
      state.listener = listener;
      let active = true;
      return () => {
        if (active && state.listener === listener) {
          state.listener = undefined;
        }
        active = false;
      };
    },
    dispatch(intent) {
      if (typeof state.listener !== 'function') {
        return false;
      }
      const pending = state.listener(intent);
      Promise.resolve(pending).catch(error => {
        state.lastError = error instanceof Error ? error.message : String(error);
      });
      return true;
    }
  });
  Object.defineProperty(globalThis, '__quaNativeRendererBridge', {
    value: bridge,
    enumerable: false,
    configurable: false,
    writable: false
  });
  let pipelineMessages = [];
  const pipelineBridge = Object.freeze({
    emit(event, payload) {
      if (typeof event !== 'string' || event.length === 0) {
        throw new TypeError('Native pipeline bridge requires an event name.');
      }
      const payloadJson = payload === undefined ? '{}' : JSON.stringify(payload);
      if (payloadJson === undefined) {
        throw new TypeError(`Native pipeline event ${event} payload is not JSON-serializable.`);
      }
      pipelineMessages.push({ event, payloadJson });
    },
    drain() {
      const messages = pipelineMessages;
      pipelineMessages = [];
      return messages;
    }
  });
  Object.defineProperty(globalThis, '__quaNativePipelineBridge', {
    value: pipelineBridge,
    enumerable: false,
    configurable: false,
    writable: false
  });
})()
"#;

pub const JSC_BACKEND_VERSION: &str = "javascriptcore-c-api-1";

const NATIVE_JSC_GAME_STEP_ENGINE_COMMAND_METHODS: &[&str] = &[
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
    "saveToSlot",
    "loadFromSlot",
    "quickSave",
    "quickLoad",
    "autoSave",
    "createRollbackAnchor",
    "markRollbackBoundary",
    "fixRollback",
    "startAuto",
    "stopAuto",
    "startSkip",
    "stopSkip",
    "startFastForward",
    "stopFastForward",
];

const NATIVE_JSC_STEP_CONTEXT_BRIDGE_SOURCE: &str = r#"
((ctx, commands, unsupportedState, waitState, translationState, pipelineState, helperState, subscriptionState, methods, moduleNamespaceId) => {
  const engine = Object.create(null);
  const pipeline = Object.create(null);
  const serializeArgs = (method, args) => JSON.stringify(args, (_key, value) => {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
      throw new TypeError(`Native JavaScriptCore StepContext command ${method} arguments must be JSON-serializable.`);
    }
    return value;
  });
  const record = method => (...args) => {
    const argsJson = serializeArgs(method, args);
    if (argsJson === undefined) {
      throw new TypeError(`Native JavaScriptCore StepContext command ${method} arguments must be JSON-serializable.`);
    }
    (subscriptionState.activeCommands || commands).push({ target: 'engine', method, argsJson });
  };
  const unsupported = name => () => {
    unsupportedState.name = name;
    throw new Error(`Native JavaScriptCore StepContext ${name} requires a native continuation bridge.`);
  };
  const assertWaitEvent = event => {
    if (typeof event !== 'string' || event.trim() !== event || event.length === 0 || event.length > 256 || /[\u0000-\u001F\u007F]/.test(event)) {
      throw new TypeError('Native JavaScriptCore StepContext engine.waitFor requires a safe pipeline event name.');
    }
  };
  const assertTranslationKey = key => {
    if (typeof key !== 'string' || key.trim() !== key || key.length === 0 || key.length > 256 || /[\u0000-\u001F\u007F]/.test(key)) {
      throw new TypeError('Native JavaScriptCore StepContext t requires a safe translation key.');
    }
  };
  const assertPipelineEvent = event => {
    if (typeof event !== 'string' || event.trim() !== event || event.length === 0 || event.length > 256 || /[\u0000-\u001F\u007F]/.test(event)) {
      throw new TypeError('Native JavaScriptCore StepContext pipeline.emit requires a safe event name.');
    }
  };
  const assertPipelineListener = listener => {
    if (typeof listener !== 'function') {
      throw new TypeError('Native JavaScriptCore StepContext pipeline listener must be a function.');
    }
  };
  const pipelineRegistry = (() => {
    const existing = globalThis.__quaNativePipelineSubscriptions;
    if (existing && Array.isArray(existing.records) && typeof existing.nextIndex === 'number') {
      return existing;
    }
    const created = { nextIndex: 0, records: [] };
    Object.defineProperty(globalThis, '__quaNativePipelineSubscriptions', {
      value: created,
      enumerable: false,
      configurable: true
    });
    return created;
  })();
  if (!Array.isArray(subscriptionState.changes)) {
    subscriptionState.changes = [];
  }
  const findSubscriptionIndex = (event, listener) => pipelineRegistry.records.findIndex(record => (
    record && record.event === event && record.listener === listener
  ));
  const subscribePipeline = (event, listener) => {
    assertPipelineEvent(event);
    assertPipelineListener(listener);
    if (findSubscriptionIndex(event, listener) >= 0) {
      return;
    }
    pipelineRegistry.nextIndex += 1;
    const subscriptionId = `${moduleNamespaceId}:pipeline:${pipelineRegistry.nextIndex}`;
    const record = { event, listener, subscriptionId, moduleNamespaceId };
    pipelineRegistry.records.push(record);
    subscriptionState.changes.push({
      op: 'subscribe',
      subscriptionId,
      moduleNamespaceId,
      event,
      listener
    });
  };
  const unsubscribePipeline = (event, listener) => {
    assertPipelineEvent(event);
    assertPipelineListener(listener);
    const index = findSubscriptionIndex(event, listener);
    if (index < 0) {
      return;
    }
    const [record] = pipelineRegistry.records.splice(index, 1);
    subscriptionState.changes.push({
      op: 'unsubscribe',
      subscriptionId: record.subscriptionId,
      moduleNamespaceId: record.moduleNamespaceId,
      event: record.event
    });
  };
  const assertHelperText = (value, label) => {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > 256 || /[\u0000-\u001F\u007F]/.test(value)) {
      throw new TypeError(`Native JavaScriptCore StepContext helper call requires a safe ${label}.`);
    }
  };
  const assertNoPendingContinuation = name => {
    if (waitState.active || translationState.active || pipelineState.active || helperState.active) {
      throw new Error(`Native JavaScriptCore StepContext can only suspend one ${name} continuation at a time.`);
    }
  };
  const waitFor = (event, matcher) => {
    assertWaitEvent(event);
    if (matcher !== undefined && typeof matcher !== 'function') {
      throw new TypeError('Native JavaScriptCore StepContext engine.waitFor matcher must be a function when provided.');
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
          throw new TypeError('Native JavaScriptCore StepContext t options must be JSON-serializable.');
        }
        return value;
      });
      if (optionsJson === undefined || (!optionsJson.startsWith('{') && !optionsJson.startsWith('['))) {
        throw new TypeError('Native JavaScriptCore StepContext t options must be a JSON object or array.');
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
          throw new TypeError('Native JavaScriptCore StepContext pipeline.emit payload must be JSON-serializable.');
        }
        return value;
      });
      if (payloadJson === undefined) {
        throw new TypeError('Native JavaScriptCore StepContext pipeline.emit payload must be JSON-serializable.');
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
      throw new TypeError(`Native JavaScriptCore helper export ${exportName} is blocked.`);
    }
    if (!engineArg || typeof engineArg !== 'object') {
      throw new TypeError(`Native JavaScriptCore helper ${moduleName}.${exportName} requires ctx.engine as its first argument.`);
    }
    let argsJson = JSON.stringify(args, (_key, value) => {
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
        throw new TypeError(`Native JavaScriptCore helper ${moduleName}.${exportName} arguments must be JSON-serializable.`);
      }
      return value;
    });
    if (argsJson === undefined || !argsJson.startsWith('[')) {
      throw new TypeError(`Native JavaScriptCore helper ${moduleName}.${exportName} arguments must serialize to a JSON array.`);
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
  Object.defineProperty(pipeline, 'on', { value: subscribePipeline, enumerable: true });
  Object.defineProperty(pipeline, 'off', { value: unsubscribePipeline, enumerable: true });
  Object.freeze(engine);
  Object.freeze(pipeline);
  Object.defineProperty(ctx, 'engine', { value: engine, enumerable: true, configurable: true });
  Object.defineProperty(ctx, 'pipeline', { value: pipeline, enumerable: true, configurable: true });
  Object.defineProperty(ctx, 't', { value: translate, enumerable: true, configurable: true });
  Object.defineProperty(globalThis, '__quaNativeStepHelperCall', { value: callHelper, enumerable: false, configurable: true });
  return ctx;
})
"#;

const NATIVE_JSC_PIPELINE_RELEASE_NAMESPACE_SOURCE: &str = r#"
((moduleNamespaceId) => {
  const registry = globalThis.__quaNativePipelineSubscriptions;
  if (!registry || !Array.isArray(registry.records)) {
    return;
  }
  registry.records = registry.records.filter(record => record && record.moduleNamespaceId !== moduleNamespaceId);
})
"#;

const NATIVE_JSC_STEP_WAIT_RESUME_SOURCE: &str = r#"
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

const NATIVE_JSC_STEP_TRANSLATION_RESUME_SOURCE: &str = r#"
((translationState, payload) => {
  if (!translationState.active) {
    return { accepted: false };
  }
  if (typeof payload !== 'string') {
    throw new TypeError('Native JavaScriptCore StepContext t resume payload must be a string.');
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

const NATIVE_JSC_STEP_PIPELINE_RESUME_SOURCE: &str = r#"
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

const NATIVE_JSC_STEP_HELPER_RESUME_SOURCE: &str = r#"
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

const NATIVE_JSC_ENGINE_HELPERS_SOURCE: &str = r#"
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

function assertString(value, label) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }
}

function objectOptions(options) {
  if (options === undefined) {
    return {};
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('QuaEngine story helper options must be an object when provided.');
  }
  return options;
}

export function node(id, options = {}) {
  assertString(id, 'node id');
  return { kind: 'node', id, ...objectOptions(options) };
}

export function label(id, options = {}) {
  assertString(id, 'label id');
  return { kind: 'label', id, ...objectOptions(options) };
}

export function scene(sceneId, options = {}) {
  assertString(sceneId, 'scene id');
  return { kind: 'scene', sceneId, ...objectOptions(options) };
}

export function script(moduleId, options = {}) {
  assertString(moduleId, 'script module id');
  return { kind: 'script', moduleId, ...objectOptions(options) };
}

export function checkpoint(id) {
  assertString(id, 'checkpoint id');
  return { kind: 'checkpoint', id };
}

export function packageNode(packageId, nodeId, options = {}) {
  assertString(packageId, 'package id');
  assertString(nodeId, 'package node id');
  return { kind: 'package-node', packageId, nodeId, ...objectOptions(options) };
}

export function image(name, options = {}) {
  assertString(name, 'image name');
  return { type: 'images', name, ...objectOptions(options) };
}
"#;

fn native_jsc_builtin_helper_source(name: &str) -> Option<String> {
    match name {
        "@quajs/engine" => Some(NATIVE_JSC_ENGINE_HELPERS_SOURCE.to_string()),
        _ => native_jsc_bridge_helper_exports(name)
            .map(|exports| native_jsc_bridge_helper_source(name, exports)),
    }
}

fn native_jsc_bridge_helper_exports(name: &str) -> Option<&'static [&'static str]> {
    match name {
        "@quajs/character" => Some(&[
            "speakWithEngine",
            "narrateWithEngine",
            "showWithEngine",
            "hideWithEngine",
            "hideAllCharactersWithEngine",
            "moveWithEngine",
            "expressionWithEngine",
            "spriteWithEngine",
        ]),
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

fn native_jsc_bridge_helper_source(name: &str, exports: &[&str]) -> String {
    let mut source = String::from(
        r#"
const createNativeHelper = (moduleName, exportName) => async (engine, ...args) => {
  const bridge = globalThis.__quaNativeStepHelperCall;
  if (typeof bridge !== 'function') {
    throw new Error(`Native JavaScriptCore helper ${moduleName}.${exportName} requires an active GameStep bridge.`);
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

pub fn jsc_runtime_backend_version() -> &'static str {
    // The adapter ABI is versioned here; the actual system framework version is
    // resolved by the native host on Apple platforms.
    js::runtime_version()
}

pub struct JavaScriptCoreEvaluator {
    // Compile the immutable bridge closures once per JS context. Per-step
    // command/continuation objects remain fresh and package-owned.
    bridge_functions: BTreeMap<&'static str, Function>,
    bridge_methods: Array,
    namespaces: BTreeMap<String, Object>,
    execution_limits: BTreeMap<String, u64>,
    step_run_handles: BTreeMap<String, JscStepRunHandle>,
    step_resume_handles: BTreeMap<String, JscStepResumeHandle>,
    pipeline_listener_handles: BTreeMap<String, JscPipelineListenerHandle>,
    next_namespace_index: u64,
    next_step_run_index: u64,
    next_step_resume_index: u64,
    context: Context,
}

struct JscStepRunHandle {
    module_namespace_id: String,
    function: Function,
}

struct JscStepResumeHandle {
    module_namespace_id: String,
    promise: Promise,
    commands: Array,
    wait_state: Object,
    translation_state: Object,
    pipeline_state: Object,
    helper_state: Object,
    subscription_state: Object,
    unsupported_state: Object,
    last_command_index: usize,
    last_subscription_change_index: usize,
}

#[derive(Clone)]
struct JscPipelineListenerHandle {
    module_namespace_id: String,
    function: Function,
    wait_state: Object,
    translation_state: Object,
    pipeline_state: Object,
    helper_state: Object,
    subscription_state: Object,
    unsupported_state: Object,
    last_command_index: usize,
    last_subscription_change_index: usize,
}

struct JscPendingStepRun {
    commands: Vec<JscGameStepCommand>,
    pending_request: JscPendingStepRequest,
    promise: Promise,
    commands_array: Array,
    wait_state: Object,
    translation_state: Object,
    pipeline_state: Object,
    helper_state: Object,
    subscription_state: Object,
    unsupported_state: Object,
    last_command_index: usize,
    last_subscription_change_index: usize,
    pipeline_subscriptions: Vec<JscPipelineSubscriptionChange>,
    subscription_updates: Vec<JscPipelineSubscriptionUpdate>,
}

enum JscPendingStepRequest {
    Wait(JscGameStepWaitRequest),
    Translation(JscGameStepTranslationRequest),
    PipelineEmit(JscGameStepPipelineEmitRequest),
    HelperCall(JscGameStepHelperCallRequest),
}

impl JscPendingStepRequest {
    fn resume_handle_id(&self) -> &str {
        match self {
            JscPendingStepRequest::Wait(request) => request.resume_handle_id.as_str(),
            JscPendingStepRequest::Translation(request) => request.resume_handle_id.as_str(),
            JscPendingStepRequest::PipelineEmit(request) => request.resume_handle_id.as_str(),
            JscPendingStepRequest::HelperCall(request) => request.resume_handle_id.as_str(),
        }
    }

    fn into_response(self, commands: Vec<JscGameStepCommand>) -> JscGameStepRunResponse {
        match self {
            JscPendingStepRequest::Wait(request) => {
                JscGameStepRunResponse::pending(commands, request)
            }
            JscPendingStepRequest::Translation(request) => {
                JscGameStepRunResponse::pending_translation(commands, request)
            }
            JscPendingStepRequest::PipelineEmit(request) => {
                JscGameStepRunResponse::pending_pipeline_emit(commands, request)
            }
            JscPendingStepRequest::HelperCall(request) => {
                JscGameStepRunResponse::pending_helper_call(commands, request)
            }
        }
    }
}

enum JscStepRunBoundary {
    Complete {
        commands: Vec<JscGameStepCommand>,
        pipeline_subscriptions: Vec<JscPipelineSubscriptionChange>,
        subscription_updates: Vec<JscPipelineSubscriptionUpdate>,
    },
    Pending(JscPendingStepRun),
}

enum JscStepResumeBoundary {
    Complete {
        commands: Vec<JscGameStepCommand>,
        pipeline_subscriptions: Vec<JscPipelineSubscriptionChange>,
        subscription_updates: Vec<JscPipelineSubscriptionUpdate>,
    },
    Pending {
        commands: Vec<JscGameStepCommand>,
        pipeline_subscriptions: Vec<JscPipelineSubscriptionChange>,
        subscription_updates: Vec<JscPipelineSubscriptionUpdate>,
        pending_request: JscPendingStepRequest,
        last_command_index: usize,
        last_subscription_change_index: usize,
    },
}

struct JscPipelineListenerDispatchBoundary {
    commands: Vec<JscGameStepCommand>,
    pipeline_subscriptions: Vec<JscPipelineSubscriptionChange>,
    subscription_updates: Vec<JscPipelineSubscriptionUpdate>,
    last_command_index: usize,
    last_subscription_change_index: usize,
}

struct JscPipelineSubscriptionExtraction {
    changes: Vec<JscPipelineSubscriptionChange>,
    updates: Vec<JscPipelineSubscriptionUpdate>,
    next_change_index: usize,
}

enum JscPipelineSubscriptionUpdate {
    Subscribe {
        subscription_id: String,
        handle: JscPipelineListenerHandle,
    },
    Unsubscribe {
        subscription_id: String,
    },
}

/// Bridges JavaScriptCore `console.*` to the `log` facade. Without this the prelude's
/// console is a set of no-ops and every diagnostic the engine or game script
/// writes is silently discarded, which makes native-only failures very hard to
/// diagnose. Levels map straight through so `QUA_NATIVE_LOG` filters JS logs
/// the same way it filters Rust ones.
fn install_native_console_writer(ctx: &Context) -> Result<(), Error> {
    ctx.install_console_writer(NATIVE_JSC_CONSOLE_WRITE)
}

impl JavaScriptCoreEvaluator {
    pub fn new() -> Result<Self, JscEvaluationError> {
        let context = Context::new().map_err(backend_error)?;
        context
            .with(|ctx| {
                install_native_console_writer(&ctx)?;
                ctx.eval::<(), _>(NATIVE_JSC_RENDERER_BRIDGE_SOURCE)
            })
            .map_err(backend_error)?;
        let bridge_functions = context
            .with(|ctx| {
                [
                    ("install", NATIVE_JSC_STEP_CONTEXT_BRIDGE_SOURCE),
                    ("wait", NATIVE_JSC_STEP_WAIT_RESUME_SOURCE),
                    ("translation", NATIVE_JSC_STEP_TRANSLATION_RESUME_SOURCE),
                    ("pipeline", NATIVE_JSC_STEP_PIPELINE_RESUME_SOURCE),
                    ("helper", NATIVE_JSC_STEP_HELPER_RESUME_SOURCE),
                    ("release", NATIVE_JSC_PIPELINE_RELEASE_NAMESPACE_SOURCE),
                ]
                .into_iter()
                .map(|(key, source)| {
                    ctx.eval::<Function, _>(source)
                        .map(|function| (key, function))
                })
                .collect::<js::Result<BTreeMap<_, _>>>()
            })
            .map_err(backend_error)?;
        let bridge_methods = context.with(step_engine_command_methods_array)?;
        Ok(Self {
            bridge_functions,
            bridge_methods,
            namespaces: BTreeMap::new(),
            execution_limits: BTreeMap::new(),
            step_run_handles: BTreeMap::new(),
            step_resume_handles: BTreeMap::new(),
            pipeline_listener_handles: BTreeMap::new(),
            next_namespace_index: 0,
            next_step_run_index: 0,
            next_step_resume_index: 0,
            context,
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

    pub fn pipeline_listener_handle_count(&self) -> usize {
        self.pipeline_listener_handles.len()
    }

    pub fn drain_native_pipeline_messages(
        &mut self,
    ) -> Result<Vec<JscPipelineMessage>, JscEvaluationError> {
        self.context
            .with(|ctx| -> js::Result<Vec<JscPipelineMessage>> {
                let bridge: Object = ctx.globals().get("__quaNativePipelineBridge")?;
                let drain: Function = bridge.get("drain")?;
                let messages: Array = drain.call(())?;
                messages
                    .iter::<Object>()
                    .map(|message| {
                        let message = message?;
                        Ok(JscPipelineMessage {
                            event: message.get("event")?,
                            payload_json: message.get("payloadJson")?,
                        })
                    })
                    .collect()
            })
            .map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::EvaluationFailed,
                    "Native JavaScriptCore pipeline bridge could not be drained.".to_string(),
                    Some(error.to_string()),
                )
            })
    }

    /// Next engine task deadline. None permits the resident thread to park
    /// until a renderer intent arrives; queued promise jobs must run promptly.
    pub fn native_job_delay(&self) -> Result<Option<Duration>, JscEvaluationError> {
        self.context
            .with(|ctx| -> js::Result<Option<Duration>> {
                let next: Function = ctx.globals().get("__quaNativeNextTimerDelay")?;
                let millis: f64 = next.call(())?;
                Ok(if millis < 0.0 {
                    None
                } else {
                    // Bound Duration conversion for large JS delays.
                    Some(Duration::from_secs_f64((millis / 1000.0).min(86400.0)))
                })
            })
            .map_err(backend_error)
    }

    pub fn pump_native_jobs(&mut self) -> Result<(), JscEvaluationError> {
        self.apply_timer_limit();
        self.context.with(|ctx| {
            let pump: Function = ctx
                .globals()
                .get("__quaNativePumpTimers")
                .map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::EvaluationFailed,
                        "Native JavaScriptCore timer pump is unavailable.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
            pump.call::<_, ()>(()).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::EvaluationFailed,
                    "Native JavaScriptCore timer callback failed.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            Ok(())
        })
    }

    fn apply_pipeline_subscription_updates(&mut self, updates: Vec<JscPipelineSubscriptionUpdate>) {
        for update in updates {
            match update {
                JscPipelineSubscriptionUpdate::Subscribe {
                    subscription_id,
                    handle,
                } => {
                    self.pipeline_listener_handles
                        .insert(subscription_id, handle);
                }
                JscPipelineSubscriptionUpdate::Unsubscribe { subscription_id } => {
                    self.pipeline_listener_handles.remove(&subscription_id);
                }
            }
        }
    }

    fn apply_limits(&self, limits: &JscSandboxLimits) {
        self.context
            .set_execution_time_limit(limits.max_execution_time_ms);
    }

    fn apply_namespace_limit(&self, id: &str) {
        if let Some(millis) = self.execution_limits.get(id) {
            self.context.set_execution_time_limit(*millis);
        }
    }

    fn apply_timer_limit(&self) {
        self.context.set_execution_time_limit(
            self.execution_limits
                .values()
                .copied()
                .min()
                .unwrap_or(1000),
        );
    }

    fn clear_interrupt_handler(&self) {
        self.context.clear_execution_time_limit();
    }

    fn next_namespace_id(&mut self) -> String {
        self.next_namespace_index = self.next_namespace_index.saturating_add(1);
        format!("jsc:{}", self.next_namespace_index)
    }

    fn next_step_run_handle_id(&mut self) -> String {
        self.next_step_run_index = self.next_step_run_index.saturating_add(1);
        format!("jsc:step:{}", self.next_step_run_index)
    }

    fn next_step_resume_handle_id(&mut self) -> String {
        self.next_step_resume_index = self.next_step_resume_index.saturating_add(1);
        format!("jsc:resume:{}", self.next_step_resume_index)
    }

    fn release_pipeline_registry_namespace(&self, module_namespace_id: &str) {
        let _ = self.context.with(|_ctx| -> js::Result<()> {
            let release: Function = self.bridge_functions["release"].clone();
            release.call::<_, ()>((module_namespace_id,))
        });
    }
}

impl JscModuleEvaluator for JavaScriptCoreEvaluator {
    fn evaluate_module(&mut self, request: &JscEvaluationRequest) -> JscEvaluationResult {
        validate_jsc_evaluation_request(request)?;
        self.apply_limits(&request.limits);
        let result = evaluate_module(&self.context, request, native_jsc_builtin_helper_source);
        self.clear_interrupt_handler();

        match result {
            Ok(namespace) => {
                let module_namespace_id = self.next_namespace_id();
                self.execution_limits.insert(
                    module_namespace_id.clone(),
                    request.limits.max_execution_time_ms,
                );
                self.namespaces
                    .insert(module_namespace_id.clone(), namespace);
                Ok(JscEvaluationResponse::success(module_namespace_id))
            }
            Err(error) => Err(JscEvaluationError {
                code: JscEvaluationErrorCode::EvaluationFailed,
                message: format!(
                    "JavaScriptCore failed to evaluate runtime module \"{}\".",
                    request.module.asset_name
                ),
                asset_name: Some(request.module.asset_name.clone()),
                detail: Some(error.to_string()),
            }),
        }
    }

    fn call_module_export(
        &mut self,
        request: &JscModuleExportCallRequest,
    ) -> JscModuleExportCallResult {
        validate_jsc_module_export_call_request(request)?;
        self.apply_namespace_limit(&request.module_namespace_id);
        let Some(namespace) = self.namespaces.get(&request.module_namespace_id).cloned() else {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::MissingModuleNamespace,
                message: format!(
                    "JavaScriptCore module namespace \"{}\" is not registered.",
                    request.module_namespace_id
                ),
                asset_name: None,
                detail: None,
            });
        };

        let result: Result<Option<String>, JscEvaluationError> = self.context.with(|ctx| {
            let pump: Function = ctx
                .globals()
                .get("__quaNativePumpTimers")
                .map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::EvaluationFailed,
                        "Native JavaScriptCore timer pump is unavailable.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
            pump.call::<_, ()>(()).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::EvaluationFailed,
                    "Native JavaScriptCore timer callback failed.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            let namespace = namespace;
            let export_value: Value =
                namespace
                    .get(request.export_name.as_str())
                    .map_err(|error| {
                        call_error(
                            JscEvaluationErrorCode::EvaluationFailed,
                            format!(
                                "JavaScriptCore module export \"{}\" could not be read.",
                                request.export_name
                            ),
                            Some(error.to_string()),
                        )
                    })?;
            if export_value.is_undefined() || export_value.is_null() {
                return Err(call_error(
                    JscEvaluationErrorCode::MissingExport,
                    format!(
                        "JavaScriptCore module namespace \"{}\" does not export \"{}\".",
                        request.module_namespace_id, request.export_name
                    ),
                    None,
                ));
            }
            if !export_value.is_function() {
                return Err(call_error(
                    JscEvaluationErrorCode::ExportNotCallable,
                    format!(
                        "JavaScriptCore module export \"{}\" is not callable.",
                        request.export_name
                    ),
                    None,
                ));
            }

            let function = export_value.into_function().ok_or_else(|| {
                call_error(
                    JscEvaluationErrorCode::ExportNotCallable,
                    format!(
                        "JavaScriptCore module export \"{}\" is not callable.",
                        request.export_name
                    ),
                    None,
                )
            })?;
            let args_json = request.args_json.as_deref().unwrap_or("[]");
            let args_value = ctx.json_parse(args_json).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidArguments,
                    "JavaScriptCore module export argsJson must be valid JSON.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            let args_array = args_value.into_array().ok_or_else(|| {
                call_error(
                    JscEvaluationErrorCode::InvalidArguments,
                    "JavaScriptCore module export argsJson must be a JSON array.".to_string(),
                    None,
                )
            })?;
            let value: Value = function
                .call_arg(args_from_json_array(ctx.clone(), &args_array)?)
                .map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::EvaluationFailed,
                        format!(
                            "JavaScriptCore module export \"{}\" call failed.",
                            request.export_name
                        ),
                        Some(error.to_string()),
                    )
                })?;
            let value = if let Some(promise) = value.as_promise() {
                promise.finish::<Value>().map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::EvaluationFailed,
                        format!(
                            "JavaScriptCore module export \"{}\" promise failed.",
                            request.export_name
                        ),
                        Some(error.to_string()),
                    )
                })?
            } else {
                value
            };
            let value_json = ctx
                .json_stringify(value)
                .map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::UnsupportedReturnValue,
                        "JavaScriptCore module export returned a value that cannot be serialized to JSON."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?
                .map(|value| value.to_string())
                .transpose()
                .map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::UnsupportedReturnValue,
                        "JavaScriptCore module export returned a string that cannot be copied to Rust."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?;
            Ok(value_json)
        });

        match result {
            Ok(value_json) => Ok(JscModuleExportCallResponse::success(value_json)),
            Err(error) => Err(error),
        }
    }

    fn call_game_step_factory(
        &mut self,
        request: &JscGameStepFactoryCallRequest,
    ) -> JscGameStepFactoryCallResult {
        validate_jsc_game_step_factory_call_request(request)?;
        self.apply_namespace_limit(&request.module_namespace_id);
        let Some(namespace) = self.namespaces.get(&request.module_namespace_id).cloned() else {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::MissingModuleNamespace,
                message: format!(
                    "JavaScriptCore module namespace \"{}\" is not registered.",
                    request.module_namespace_id
                ),
                asset_name: None,
                detail: None,
            });
        };

        let result: Result<
            Vec<(JscGameStepDescriptor, Function)>,
            JscEvaluationError,
        > = self.context.with(|ctx| {
            let namespace = namespace;
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
                        JscEvaluationErrorCode::EvaluationFailed,
                        format!(
                            "JavaScriptCore GameStep factory export \"{}\" call failed.",
                            request.export_name
                        ),
                        Some(error.to_string()),
                    )
                })?;
            let steps_array = game_step_factory_result_array(steps_value)?;

            let mut handles = Vec::new();
            for index in 0..steps_array.len() {
                let step_object: Object = steps_array.get(index).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepDescriptor,
                        format!("JavaScriptCore GameStep descriptor at index {index} is not an object."),
                        Some(error.to_string()),
                    )
                })?;
                let uuid: String = step_object.get("uuid").map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepDescriptor,
                        format!(
                            "JavaScriptCore GameStep descriptor at index {index} requires a string uuid."
                        ),
                        Some(error.to_string()),
                    )
                })?;
                if uuid.trim().is_empty()
                    || uuid.trim() != uuid
                    || uuid.chars().any(char::is_control)
                {
                    return Err(call_error(
                        JscEvaluationErrorCode::InvalidStepDescriptor,
                        format!(
                            "JavaScriptCore GameStep descriptor at index {index} has an invalid uuid."
                        ),
                        None,
                    ));
                }

                let run_value: Value = step_object.get("run").map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepDescriptor,
                        format!("JavaScriptCore GameStep descriptor \"{uuid}\" requires a run function."),
                        Some(error.to_string()),
                    )
                })?;
                let run_function = run_value.into_function().ok_or_else(|| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepDescriptor,
                        format!(
                            "JavaScriptCore GameStep descriptor \"{uuid}\" run property is not callable."
                        ),
                        None,
                    )
                })?;
                let metadata_json = step_metadata_json(&ctx, &step_object)?;
                let descriptor = JscGameStepDescriptor {
                    uuid,
                    run_handle_id: String::new(),
                    metadata_json,
                };
                handles.push((descriptor, run_function));
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
                        JscStepRunHandle {
                            module_namespace_id: request.module_namespace_id.clone(),
                            function,
                        },
                    );
                    descriptors.push(descriptor);
                }
                Ok(JscGameStepFactoryCallResponse::success(descriptors))
            }
            Err(error) => Err(error),
        }
    }

    fn call_game_step_run(&mut self, request: &JscGameStepRunRequest) -> JscGameStepRunResult {
        validate_jsc_game_step_run_request(request)?;
        let Some(handle) = self.step_run_handles.get(&request.run_handle_id) else {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::MissingRunHandle,
                message: format!(
                    "JavaScriptCore GameStep run handle \"{}\" is not registered.",
                    request.run_handle_id
                ),
                asset_name: None,
                detail: None,
            });
        };
        let function = handle.function.clone();
        let module_namespace_id = handle.module_namespace_id.clone();
        self.apply_namespace_limit(&module_namespace_id);
        let resume_handle_id = self.next_step_resume_handle_id();

        let result: Result<JscStepRunBoundary, JscEvaluationError> =
            self.context.with(|ctx| {
                let ctx_object = step_context_object(ctx.clone(), request.ctx_json.as_deref())?;
                let commands = Array::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore GameStep command array could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let unsupported_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore GameStep unsupported-command marker could not be created."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let wait_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore GameStep wait state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let translation_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore GameStep translation state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let pipeline_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore GameStep pipeline state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let helper_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore GameStep helper-call state could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let subscription_state = Object::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore GameStep pipeline subscription state could not be created."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?;
                install_step_context_bridge(
                    self.bridge_functions["install"].clone(),
                    self.bridge_methods.clone(),
                    ctx.clone(),
                    &ctx_object,
                    &commands,
                    &unsupported_state,
                    &wait_state,
                    &translation_state,
                    &pipeline_state,
                    &helper_state,
                    &subscription_state,
                    &module_namespace_id,
                )?;
                let value: Value = function
                    .call_arg(one_arg(ctx.clone(), Value::from_object(ctx_object))?)
                    .map_err(|error| {
                        step_run_error_from_unsupported_state(
                            &unsupported_state,
                            format!(
                                "JavaScriptCore GameStep run handle \"{}\" call failed.",
                                request.run_handle_id
                            ),
                            Some(error.to_string()),
                        )
                    })?;
                if let Some(promise) = value.as_promise() {
                    match promise.finish::<()>() {
                        Ok(()) => {
                            let commands_output = step_commands_from_array(ctx.clone(), &commands)?;
                            let extraction = pipeline_subscription_changes_from_state(
                                ctx.clone(),
                                &subscription_state,
                                &wait_state,
                                &translation_state,
                                &pipeline_state,
                                &helper_state,
                                &unsupported_state,
                                &module_namespace_id,
                                commands.len(),
                                0,
                            )?;
                            return Ok(JscStepRunBoundary::Complete {
                                commands: commands_output,
                                pipeline_subscriptions: extraction.changes,
                                subscription_updates: extraction.updates,
                            });
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
                            let extraction = pipeline_subscription_changes_from_state(
                                ctx.clone(),
                                &subscription_state,
                                &wait_state,
                                &translation_state,
                                &pipeline_state,
                                &helper_state,
                                &unsupported_state,
                                &module_namespace_id,
                                last_command_index,
                                0,
                            )?;
                            return Ok(JscStepRunBoundary::Pending(JscPendingStepRun {
                                commands: step_commands_from_array_range(
                                    ctx.clone(),
                                    &commands,
                                    0,
                                )?,
                                pending_request,
                                promise: promise.clone(),
                                commands_array: commands.clone(),
                                wait_state: wait_state,
                                translation_state: translation_state,
                                pipeline_state: pipeline_state,
                                helper_state: helper_state,
                                subscription_state: subscription_state,
                                unsupported_state: unsupported_state,
                                last_command_index,
                                last_subscription_change_index: extraction.next_change_index,
                                pipeline_subscriptions: extraction.changes,
                                subscription_updates: extraction.updates,
                            }));
                        }
                        Err(error) => {
                            return Err(step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "JavaScriptCore GameStep run handle \"{}\" promise failed.",
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
                        JscEvaluationErrorCode::StepRunFailed,
                        format!(
                            "JavaScriptCore GameStep run handle \"{}\" returned while a StepContext continuation is pending.",
                            request.run_handle_id
                        ),
                        Some(
                            "GameStep run functions must await or return ctx.engine.waitFor / ctx.t / ctx.pipeline.emit / native helper promises."
                                .to_string(),
                        ),
                    ));
                }
                let commands_output = step_commands_from_array(ctx.clone(), &commands)?;
                let extraction = pipeline_subscription_changes_from_state(
                    ctx.clone(),
                    &subscription_state,
                    &wait_state,
                    &translation_state,
                    &pipeline_state,
                    &helper_state,
                    &unsupported_state,
                    &module_namespace_id,
                    commands.len(),
                    0,
                )?;
                Ok(JscStepRunBoundary::Complete {
                    commands: commands_output,
                    pipeline_subscriptions: extraction.changes,
                    subscription_updates: extraction.updates,
                })
            });

        match result {
            Ok(JscStepRunBoundary::Complete {
                commands,
                pipeline_subscriptions,
                subscription_updates,
            }) => {
                self.apply_pipeline_subscription_updates(subscription_updates);
                Ok(JscGameStepRunResponse::success(commands)
                    .with_pipeline_subscriptions(pipeline_subscriptions))
            }
            Ok(JscStepRunBoundary::Pending(pending)) => {
                let resume_handle_id = pending.pending_request.resume_handle_id().to_string();
                self.apply_pipeline_subscription_updates(pending.subscription_updates);
                self.step_resume_handles.insert(
                    resume_handle_id,
                    JscStepResumeHandle {
                        module_namespace_id,
                        promise: pending.promise,
                        commands: pending.commands_array,
                        wait_state: pending.wait_state,
                        translation_state: pending.translation_state,
                        pipeline_state: pending.pipeline_state,
                        helper_state: pending.helper_state,
                        subscription_state: pending.subscription_state,
                        unsupported_state: pending.unsupported_state,
                        last_command_index: pending.last_command_index,
                        last_subscription_change_index: pending.last_subscription_change_index,
                    },
                );
                Ok(pending
                    .pending_request
                    .into_response(pending.commands)
                    .with_pipeline_subscriptions(pending.pipeline_subscriptions))
            }
            Err(error) => Err(error),
        }
    }

    fn resume_game_step_run(&mut self, request: &JscGameStepResumeRequest) -> JscGameStepRunResult {
        super::validate_jsc_game_step_resume_request(request)?;
        let resume_handle_id = request.resume_handle_id.clone();
        let Some(mut handle) = self.step_resume_handles.remove(&resume_handle_id) else {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::MissingResumeHandle,
                message: format!(
                    "JavaScriptCore GameStep resume handle \"{}\" is not registered.",
                    request.resume_handle_id
                ),
                asset_name: None,
                detail: None,
            });
        };

        self.apply_namespace_limit(&handle.module_namespace_id);
        let result: Result<JscStepResumeBoundary, JscEvaluationError> =
            self.context.with(|ctx| {
                let promise = handle.promise.clone();
                let commands = handle.commands.clone();
                let wait_state = handle.wait_state.clone();
                let translation_state = handle.translation_state.clone();
                let pipeline_state = handle.pipeline_state.clone();
                let helper_state = handle.helper_state.clone();
                let subscription_state =
                    handle
                        .subscription_state
                        .clone()
                        ;
                let unsupported_state =
                    handle
                        .unsupported_state
                        .clone()
                        ;
                let payload = resume_payload_value(ctx.clone(), request.payload_json.as_deref())?;
                let accepted: bool = if wait_state_is_active(&wait_state)? {
                    let resume_wait: Function = self.bridge_functions["wait"].clone()
                        ;
                    let resume_result: Object = resume_wait
                        .call_arg(two_args(ctx.clone(), wait_state.clone(), payload)?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "JavaScriptCore GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            JscEvaluationErrorCode::StepRunFailed,
                            "JavaScriptCore GameStep wait resume result did not include accepted.".to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else if translation_state_is_active(&translation_state)? {
                    let resume_translation: Function = self.bridge_functions["translation"].clone()
                        ;
                    let resume_result: Object = resume_translation
                        .call_arg(two_args(ctx.clone(), translation_state.clone(), payload)?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "JavaScriptCore GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            JscEvaluationErrorCode::StepRunFailed,
                            "JavaScriptCore GameStep translation resume result did not include accepted.".to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else if pipeline_state_is_active(&pipeline_state)? {
                    let resume_pipeline: Function = self.bridge_functions["pipeline"].clone()
                        ;
                    let resume_result: Object = resume_pipeline
                        .call_arg(one_arg(ctx.clone(), Value::from_object(pipeline_state.clone()))?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "JavaScriptCore GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            JscEvaluationErrorCode::StepRunFailed,
                            "JavaScriptCore GameStep pipeline resume result did not include accepted."
                                .to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else if helper_state_is_active(&helper_state)? {
                    let resume_helper: Function = self.bridge_functions["helper"].clone()
                        ;
                    let resume_result: Object = resume_helper
                        .call_arg(two_args(ctx.clone(), helper_state.clone(), payload)?)
                        .map_err(|error| {
                            step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "JavaScriptCore GameStep resume handle \"{}\" failed.",
                                    request.resume_handle_id
                                ),
                                Some(error.to_string()),
                            )
                        })?;
                    resume_result.get("accepted").map_err(|error| {
                        call_error(
                            JscEvaluationErrorCode::StepRunFailed,
                            "JavaScriptCore GameStep helper-call resume result did not include accepted."
                                .to_string(),
                            Some(error.to_string()),
                        )
                    })?
                } else {
                    return Err(call_error(
                        JscEvaluationErrorCode::MissingResumeHandle,
                        format!(
                            "JavaScriptCore GameStep resume handle \"{}\" has no active continuation.",
                            request.resume_handle_id
                        ),
                        None,
                    ));
                };
                if !accepted {
                    let last_command_index = commands.len();
                    let extraction = pipeline_subscription_changes_from_state(
                        ctx.clone(),
                        &subscription_state,
                        &wait_state,
                        &translation_state,
                        &pipeline_state,
                        &helper_state,
                        &unsupported_state,
                        &handle.module_namespace_id,
                        last_command_index,
                        handle.last_subscription_change_index,
                    )?;
                    return Ok(JscStepResumeBoundary::Pending {
                        commands: step_commands_from_array_range(
                            ctx.clone(),
                            &commands,
                            handle.last_command_index,
                        )?,
                        pipeline_subscriptions: extraction.changes,
                        subscription_updates: extraction.updates,
                        pending_request: pending_step_request_from_states(
                            &wait_state,
                            &translation_state,
                            &pipeline_state,
                            &helper_state,
                            &resume_handle_id,
                        )?,
                        last_command_index,
                        last_subscription_change_index: extraction.next_change_index,
                    });
                }

                match promise.finish::<()>() {
                    Ok(()) => {
                        let commands_output = step_commands_from_array_range(
                            ctx.clone(),
                            &commands,
                            handle.last_command_index,
                        )?;
                        let extraction = pipeline_subscription_changes_from_state(
                            ctx.clone(),
                            &subscription_state,
                            &wait_state,
                            &translation_state,
                            &pipeline_state,
                            &helper_state,
                            &unsupported_state,
                            &handle.module_namespace_id,
                            commands.len(),
                            handle.last_subscription_change_index,
                        )?;
                        Ok(JscStepResumeBoundary::Complete {
                            commands: commands_output,
                            pipeline_subscriptions: extraction.changes,
                            subscription_updates: extraction.updates,
                        })
                    }
                    Err(Error::WouldBlock) => {
                        let last_command_index = commands.len();
                        let extraction = pipeline_subscription_changes_from_state(
                            ctx.clone(),
                            &subscription_state,
                            &wait_state,
                            &translation_state,
                            &pipeline_state,
                            &helper_state,
                            &unsupported_state,
                            &handle.module_namespace_id,
                            last_command_index,
                            handle.last_subscription_change_index,
                        )?;
                        Ok(JscStepResumeBoundary::Pending {
                            commands: step_commands_from_array_range(
                                ctx.clone(),
                                &commands,
                                handle.last_command_index,
                            )?,
                            pipeline_subscriptions: extraction.changes,
                            subscription_updates: extraction.updates,
                            pending_request: pending_step_request_from_states(
                                &wait_state,
                                &translation_state,
                                &pipeline_state,
                                &helper_state,
                                &resume_handle_id,
                            )?,
                            last_command_index,
                            last_subscription_change_index: extraction.next_change_index,
                        })
                    }
                    Err(error) => Err(step_run_error_from_unsupported_state(
                        &unsupported_state,
                        format!(
                            "JavaScriptCore GameStep resume handle \"{}\" promise failed.",
                            request.resume_handle_id
                        ),
                        Some(error.to_string()),
                    )),
                }
            });

        match result {
            Ok(JscStepResumeBoundary::Complete {
                commands,
                pipeline_subscriptions,
                subscription_updates,
            }) => {
                self.apply_pipeline_subscription_updates(subscription_updates);
                Ok(JscGameStepRunResponse::success(commands)
                    .with_pipeline_subscriptions(pipeline_subscriptions))
            }
            Ok(JscStepResumeBoundary::Pending {
                commands,
                pipeline_subscriptions,
                subscription_updates,
                pending_request,
                last_command_index,
                last_subscription_change_index,
            }) => {
                self.apply_pipeline_subscription_updates(subscription_updates);
                handle.last_command_index = last_command_index;
                handle.last_subscription_change_index = last_subscription_change_index;
                self.step_resume_handles.insert(resume_handle_id, handle);
                Ok(pending_request
                    .into_response(commands)
                    .with_pipeline_subscriptions(pipeline_subscriptions))
            }
            Err(error) => Err(error),
        }
    }

    fn dispatch_pipeline_listener(
        &mut self,
        request: &JscPipelineListenerDispatchRequest,
    ) -> JscPipelineListenerDispatchResult {
        validate_jsc_pipeline_listener_dispatch_request(request)?;
        let Some(handle) = self
            .pipeline_listener_handles
            .get(&request.subscription_id)
            .cloned()
        else {
            return Err(JscEvaluationError {
                code: JscEvaluationErrorCode::InvalidPipelineRequest,
                message: format!(
                    "JavaScriptCore pipeline listener subscription \"{}\" is not registered.",
                    request.subscription_id
                ),
                asset_name: None,
                detail: None,
            });
        };

        self.apply_namespace_limit(&handle.module_namespace_id);
        let result: Result<JscPipelineListenerDispatchBoundary, JscEvaluationError> =
            self.context.with(|ctx| {
                let function = handle.function.clone();
                let dispatch_commands = Array::new(ctx.clone()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidStepContext,
                        "JavaScriptCore pipeline listener command array could not be created.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
                let wait_state = handle.wait_state.clone();
                let translation_state =
                    handle
                        .translation_state
                        .clone()
                        ;
                let pipeline_state = handle.pipeline_state.clone();
                let helper_state = handle.helper_state.clone();
                let subscription_state =
                    handle
                        .subscription_state
                        .clone()
                        ;
                let unsupported_state =
                    handle
                        .unsupported_state
                        .clone()
                        ;
                let context_value = ctx.json_parse(request.context_json.as_str()).map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidPipelineRequest,
                        "JavaScriptCore pipeline listener dispatch contextJson must be valid JSON."
                            .to_string(),
                        Some(error.to_string()),
                    )
                })?;
                subscription_state
                    .set("activeCommands", dispatch_commands.clone())
                    .map_err(|error| {
                        call_error(
                            JscEvaluationErrorCode::InvalidStepContext,
                            "JavaScriptCore pipeline listener active command array could not be installed."
                                .to_string(),
                            Some(error.to_string()),
                        )
                    })?;
                let pending_before = (
                    wait_state_is_active(&wait_state)?,
                    translation_state_is_active(&translation_state)?,
                    pipeline_state_is_active(&pipeline_state)?,
                    helper_state_is_active(&helper_state)?,
                );
                let call_result: Result<Value, JscEvaluationError> = function
                    .call_arg(one_arg(ctx.clone(), context_value)?)
                    .map_err(|error| {
                        step_run_error_from_unsupported_state(
                            &unsupported_state,
                            format!(
                                "JavaScriptCore pipeline listener subscription \"{}\" call failed.",
                                request.subscription_id
                            ),
                            Some(error.to_string()),
                        )
                    });
                let value = match call_result {
                    Ok(value) => value,
                    Err(error) => {
                        clear_pipeline_listener_active_commands(ctx.clone(), &subscription_state)?;
                        return Err(error);
                    }
                };
                if let Some(promise) = value.as_promise() {
                    let finish_result = promise.finish::<()>();
                    clear_pipeline_listener_active_commands(ctx.clone(), &subscription_state)?;
                    match finish_result {
                        Ok(()) => {}
                        Err(Error::WouldBlock) => {
                            return Err(call_error(
                                JscEvaluationErrorCode::UnsupportedStepContextCommand,
                                format!(
                                    "JavaScriptCore pipeline listener subscription \"{}\" returned a pending continuation.",
                                    request.subscription_id
                                ),
                                Some(
                                    "Native JavaScriptCore pipeline listener callbacks may run async code that settles immediately, but ctx.engine.waitFor, ctx.t, ctx.pipeline.emit, and helper-call continuations are not supported inside long-lived listeners."
                                        .to_string(),
                                ),
                            ));
                        }
                        Err(error) => {
                            return Err(step_run_error_from_unsupported_state(
                                &unsupported_state,
                                format!(
                                    "JavaScriptCore pipeline listener subscription \"{}\" promise failed.",
                                    request.subscription_id
                                ),
                                Some(error.to_string()),
                            ));
                        }
                    }
                }
                else {
                    clear_pipeline_listener_active_commands(ctx.clone(), &subscription_state)?;
                }
                let pending_after = (
                    wait_state_is_active(&wait_state)?,
                    translation_state_is_active(&translation_state)?,
                    pipeline_state_is_active(&pipeline_state)?,
                    helper_state_is_active(&helper_state)?,
                );
                if (pending_after.0 && !pending_before.0)
                    || (pending_after.1 && !pending_before.1)
                    || (pending_after.2 && !pending_before.2)
                    || (pending_after.3 && !pending_before.3)
                {
                    return Err(call_error(
                        JscEvaluationErrorCode::UnsupportedStepContextCommand,
                        format!(
                            "JavaScriptCore pipeline listener subscription \"{}\" started a pending StepContext continuation.",
                            request.subscription_id
                        ),
                        Some(
                            "Long-lived native JavaScriptCore pipeline listeners cannot suspend on ctx.engine.waitFor, ctx.t, ctx.pipeline.emit, or native helper calls."
                                .to_string(),
                        ),
                    ));
                }

                let commands_output = step_commands_from_array(ctx.clone(), &dispatch_commands)?;
                let last_command_index = dispatch_commands.len();
                let extraction = pipeline_subscription_changes_from_state(
                    ctx.clone(),
                    &subscription_state,
                    &wait_state,
                    &translation_state,
                    &pipeline_state,
                    &helper_state,
                    &unsupported_state,
                    &handle.module_namespace_id,
                    last_command_index,
                    handle.last_subscription_change_index,
                )?;
                Ok(JscPipelineListenerDispatchBoundary {
                    commands: commands_output,
                    pipeline_subscriptions: extraction.changes,
                    subscription_updates: extraction.updates,
                    last_command_index,
                    last_subscription_change_index: extraction.next_change_index,
                })
            });

        match result {
            Ok(boundary) => {
                self.apply_pipeline_subscription_updates(boundary.subscription_updates);
                if let Some(existing) = self
                    .pipeline_listener_handles
                    .get_mut(&request.subscription_id)
                {
                    existing.last_command_index = boundary.last_command_index;
                    existing.last_subscription_change_index =
                        boundary.last_subscription_change_index;
                }
                Ok(JscPipelineListenerDispatchResponse::success(
                    boundary.commands,
                    boundary.pipeline_subscriptions,
                ))
            }
            Err(error) => Err(error),
        }
    }

    fn dispatch_renderer_intent(
        &mut self,
        intent: &crate::host::NativeRendererIntent,
    ) -> JscRendererIntentDispatchResult {
        let intent_json = serde_json::to_string(intent).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                "Native renderer intent could not be serialized for JavaScriptCore.".to_string(),
                Some(error.to_string()),
            )
        })?;
        self.context.with(|ctx| {
            let bridge: Object =
                ctx.globals()
                    .get("__quaNativeRendererBridge")
                    .map_err(|error| {
                        call_error(
                            JscEvaluationErrorCode::InvalidPipelineRequest,
                            "Native renderer intent bridge is not installed in JavaScriptCore."
                                .to_string(),
                            Some(error.to_string()),
                        )
                    })?;
            let dispatch: Function = bridge.get("dispatch").map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidPipelineRequest,
                    "Native renderer intent bridge dispatch function is unavailable.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            let intent_value = ctx.json_parse(intent_json).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidPipelineRequest,
                    "Native renderer intent JSON could not be parsed in JavaScriptCore."
                        .to_string(),
                    Some(error.to_string()),
                )
            })?;
            let value: Value = dispatch
                .call_arg(one_arg(ctx.clone(), intent_value)?)
                .map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::StepRunFailed,
                        "Native renderer intent JavaScriptCore callback failed.".to_string(),
                        Some(error.to_string()),
                    )
                })?;
            if let Some(promise) = value.as_promise() {
                return promise.finish::<bool>().map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::StepRunFailed,
                        "Native renderer intent JavaScriptCore callback promise failed."
                            .to_string(),
                        Some(error.to_string()),
                    )
                });
            }
            bool::from_js(&ctx, value).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::StepRunFailed,
                    "Native renderer intent JavaScriptCore callback returned an invalid result."
                        .to_string(),
                    Some(error.to_string()),
                )
            })
        })
    }

    fn release_module_namespace(&mut self, module_namespace_id: &str) {
        self.release_pipeline_registry_namespace(module_namespace_id);
        self.namespaces.remove(module_namespace_id);
        self.execution_limits.remove(module_namespace_id);
        self.step_run_handles
            .retain(|_, handle| handle.module_namespace_id != module_namespace_id);
        self.step_resume_handles
            .retain(|_, handle| handle.module_namespace_id != module_namespace_id);
        self.pipeline_listener_handles
            .retain(|_, handle| handle.module_namespace_id != module_namespace_id);
    }
}

fn backend_error(error: js::Error) -> JscEvaluationError {
    JscEvaluationError {
        code: JscEvaluationErrorCode::UnsupportedRuntime,
        message: "JavaScriptCore evaluator backend could not be initialized.".to_string(),
        asset_name: None,
        detail: Some(error.to_string()),
    }
}

fn args_from_json_array(ctx: Context, array: &Array) -> Result<js::Args, JscEvaluationError> {
    let mut args = js::Args::new(ctx.clone(), array.len());
    for index in 0..array.len() {
        let value: Value = array.get(index).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidArguments,
                "JavaScriptCore module export argsJson contains a value that cannot be read."
                    .to_string(),
                Some(error.to_string()),
            )
        })?;
        args.push_arg(value).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidArguments,
                "JavaScriptCore module export argsJson contains a value that cannot be passed."
                    .to_string(),
                Some(error.to_string()),
            )
        })?;
    }
    Ok(args)
}

fn factory_args_from_scope_json(
    ctx: Context,
    scope_json: Option<&str>,
) -> Result<js::Args, JscEvaluationError> {
    let mut args = js::Args::new(ctx.clone(), if scope_json.is_some() { 1 } else { 0 });
    if let Some(scope_json) = scope_json {
        let value = ctx.json_parse(scope_json).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidScope,
                "JavaScriptCore GameStep factory scopeJson must be valid JSON.".to_string(),
                Some(error.to_string()),
            )
        })?;
        if !value.is_object() || value.is_array() {
            return Err(call_error(
                JscEvaluationErrorCode::InvalidScope,
                "JavaScriptCore GameStep factory scopeJson must be a JSON object.".to_string(),
                None,
            ));
        }
        args.push_arg(value).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidScope,
                "JavaScriptCore GameStep factory scopeJson could not be passed to JavaScriptCore."
                    .to_string(),
                Some(error.to_string()),
            )
        })?;
    }
    Ok(args)
}

fn game_step_factory_result_array(value: Value) -> Result<Array, JscEvaluationError> {
    let resolved = if let Some(promise) = value.as_promise() {
        promise.finish::<Value>().map_err(|error| match error {
            Error::WouldBlock => call_error(
                JscEvaluationErrorCode::InvalidStepFactoryResult,
                "JavaScriptCore GameStep factory Promise did not settle.".to_string(),
                Some(
                    "Native JavaScriptCore script factories may be async only when their Promise resolves inside JavaScriptCore without a host continuation."
                        .to_string(),
                ),
            ),
            _ => call_error(
                JscEvaluationErrorCode::InvalidStepFactoryResult,
                "JavaScriptCore GameStep factory Promise rejected or could not be resolved.".to_string(),
                Some(error.to_string()),
            ),
        })?
    } else {
        value
    };

    resolved.into_array().ok_or_else(|| {
        call_error(
            JscEvaluationErrorCode::InvalidStepFactoryResult,
            "JavaScriptCore GameStep factory must return a GameStep array.".to_string(),
            None,
        )
    })
}

fn step_context_object(ctx: Context, ctx_json: Option<&str>) -> Result<Object, JscEvaluationError> {
    match ctx_json {
        Some(ctx_json) => {
            let value = ctx.json_parse(ctx_json).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidStepContext,
                    "JavaScriptCore GameStep run ctxJson must be valid JSON.".to_string(),
                    Some(error.to_string()),
                )
            })?;
            if !value.is_object() || value.is_array() {
                return Err(call_error(
                    JscEvaluationErrorCode::InvalidStepContext,
                    "JavaScriptCore GameStep run ctxJson must be a JSON object.".to_string(),
                    None,
                ));
            }
            value.into_object().ok_or_else(|| {
                call_error(
                    JscEvaluationErrorCode::InvalidStepContext,
                    "JavaScriptCore GameStep run ctxJson must be a JSON object.".to_string(),
                    None,
                )
            })
        }
        None => Object::new(ctx.clone()).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                "JavaScriptCore GameStep run context object could not be created.".to_string(),
                Some(error.to_string()),
            )
        }),
    }
}

fn install_step_context_bridge(
    install: Function,
    methods: Array,
    ctx: Context,
    ctx_object: &Object,
    commands: &Array,
    unsupported_state: &Object,
    wait_state: &Object,
    translation_state: &Object,
    pipeline_state: &Object,
    helper_state: &Object,
    subscription_state: &Object,
    module_namespace_id: &str,
) -> Result<(), JscEvaluationError> {
    let _: Value = install
        .call_arg(ten_args(
            ctx,
            ctx_object.clone(),
            commands.clone(),
            unsupported_state.clone(),
            wait_state.clone(),
            translation_state.clone(),
            pipeline_state.clone(),
            helper_state.clone(),
            subscription_state.clone(),
            methods,
            module_namespace_id,
        )?)
        .map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                "JavaScriptCore StepContext bridge script could not be installed.".to_string(),
                Some(error.to_string()),
            )
        })?;
    Ok(())
}

fn step_engine_command_methods_array(ctx: Context) -> Result<Array, JscEvaluationError> {
    let methods = Array::new(ctx.clone()).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext engine command method array could not be created."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    for (index, method) in NATIVE_JSC_GAME_STEP_ENGINE_COMMAND_METHODS
        .iter()
        .enumerate()
    {
        methods.set(index, *method).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                "JavaScriptCore StepContext engine command method could not be passed to bridge script."
                    .to_string(),
                Some(error.to_string()),
            )
        })?;
    }
    Ok(methods)
}

fn step_commands_from_array(
    ctx: Context,
    commands: &Array,
) -> Result<Vec<JscGameStepCommand>, JscEvaluationError> {
    step_commands_from_array_range(ctx, commands, 0)
}

fn step_commands_from_array_range(
    ctx: Context,
    commands: &Array,
    start_index: usize,
) -> Result<Vec<JscGameStepCommand>, JscEvaluationError> {
    let mut output = Vec::with_capacity(commands.len());
    for index in start_index..commands.len() {
        let command: Object = commands.get(index).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                format!("JavaScriptCore GameStep command at index {index} must be an object."),
                Some(error.to_string()),
            )
        })?;
        let target: String = command.get("target").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                format!("JavaScriptCore GameStep command at index {index} requires a target."),
                Some(error.to_string()),
            )
        })?;
        if target != "engine" {
            return Err(call_error(
                JscEvaluationErrorCode::UnsupportedStepContextCommand,
                format!("JavaScriptCore GameStep command target \"{target}\" is not supported."),
                None,
            ));
        }
        let method: String = command.get("method").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                format!("JavaScriptCore GameStep command at index {index} requires a method."),
                Some(error.to_string()),
            )
        })?;
        if !is_allowed_step_engine_command_method(&method) {
            return Err(call_error(
                JscEvaluationErrorCode::UnsupportedStepContextCommand,
                format!("JavaScriptCore GameStep engine command \"{method}\" is not allowlisted."),
                None,
            ));
        }
        let args_value: Value = command.get("argsJson").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                format!("JavaScriptCore GameStep command \"{method}\" argsJson could not be read."),
                Some(error.to_string()),
            )
        })?;
        let args_json = if args_value.is_undefined() || args_value.is_null() {
            None
        } else {
            let args_json: String = command.get("argsJson").map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidStepContext,
                    format!(
                        "JavaScriptCore GameStep command \"{method}\" argsJson must be a string."
                    ),
                    Some(error.to_string()),
                )
            })?;
            let parsed_args = ctx.json_parse(args_json.as_str()).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidStepContext,
                    format!(
                        "JavaScriptCore GameStep command \"{method}\" argsJson must be valid JSON."
                    ),
                    Some(error.to_string()),
                )
            })?;
            if !parsed_args.is_array() {
                return Err(call_error(
                    JscEvaluationErrorCode::InvalidStepContext,
                    format!("JavaScriptCore GameStep command \"{method}\" argsJson must be a JSON array."),
                    None,
                ));
            }
            Some(args_json)
        };
        output.push(JscGameStepCommand {
            target,
            method,
            args_json,
        });
    }
    Ok(output)
}

fn pipeline_subscription_changes_from_state(
    _ctx: Context,
    subscription_state: &Object,
    wait_state: &Object,
    translation_state: &Object,
    pipeline_state: &Object,
    helper_state: &Object,
    unsupported_state: &Object,
    module_namespace_id: &str,
    last_command_index: usize,
    start_index: usize,
) -> Result<JscPipelineSubscriptionExtraction, JscEvaluationError> {
    let changes_value: Value = subscription_state.get("changes").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidPipelineRequest,
            "JavaScriptCore pipeline subscription change list could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if changes_value.is_undefined() || changes_value.is_null() {
        return Ok(JscPipelineSubscriptionExtraction {
            changes: Vec::new(),
            updates: Vec::new(),
            next_change_index: start_index,
        });
    }
    let changes_array = changes_value.into_array().ok_or_else(|| {
        call_error(
            JscEvaluationErrorCode::InvalidPipelineRequest,
            "JavaScriptCore pipeline subscription changes must be stored as an array.".to_string(),
            None,
        )
    })?;
    let next_change_index = changes_array.len();
    let mut changes = Vec::new();
    let mut updates = Vec::new();
    for index in start_index..next_change_index {
        let change: Object = changes_array.get(index).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                format!("JavaScriptCore pipeline subscription change at index {index} must be an object."),
                Some(error.to_string()),
            )
        })?;
        let op_text: String = change.get("op").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                format!(
                    "JavaScriptCore pipeline subscription change at index {index} requires an op."
                ),
                Some(error.to_string()),
            )
        })?;
        let op = match op_text.as_str() {
            "subscribe" => JscPipelineSubscriptionOperation::Subscribe,
            "unsubscribe" => JscPipelineSubscriptionOperation::Unsubscribe,
            _ => {
                return Err(call_error(
                    JscEvaluationErrorCode::InvalidPipelineRequest,
                    format!(
                        "JavaScriptCore pipeline subscription change at index {index} has invalid op \"{op_text}\"."
                    ),
                    None,
                ));
            }
        };
        let subscription_id: String = change.get("subscriptionId").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                format!(
                    "JavaScriptCore pipeline subscription change at index {index} requires a subscriptionId."
                ),
                Some(error.to_string()),
            )
        })?;
        let change_module_namespace_id: String = change.get("moduleNamespaceId").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                format!(
                    "JavaScriptCore pipeline subscription change at index {index} requires a moduleNamespaceId."
                ),
                Some(error.to_string()),
            )
        })?;
        let event: String = change.get("event").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                format!("JavaScriptCore pipeline subscription change at index {index} requires an event."),
                Some(error.to_string()),
            )
        })?;
        if !is_safe_jsc_bridge_text(&subscription_id)
            || !is_safe_jsc_bridge_text(&change_module_namespace_id)
            || !is_safe_jsc_bridge_text(&event)
        {
            return Err(call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                format!(
                    "JavaScriptCore pipeline subscription change at index {index} contains unsafe bridge text."
                ),
                Some(
                    "Subscription ids, module namespace ids, and event names must be trimmed, non-empty, control-character-free, and at most 256 bytes."
                        .to_string(),
                ),
            ));
        }
        if matches!(op, JscPipelineSubscriptionOperation::Subscribe)
            && change_module_namespace_id != module_namespace_id
        {
            return Err(call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                format!(
                    "JavaScriptCore pipeline subscription change at index {index} does not belong to the active module namespace."
                ),
                None,
            ));
        }
        let wire_change = JscPipelineSubscriptionChange {
            op,
            subscription_id: subscription_id.clone(),
            module_namespace_id: change_module_namespace_id.clone(),
            event: event.clone(),
        };
        match op {
            JscPipelineSubscriptionOperation::Subscribe => {
                let listener_value: Value = change.get("listener").map_err(|error| {
                    call_error(
                        JscEvaluationErrorCode::InvalidPipelineRequest,
                        format!(
                            "JavaScriptCore pipeline subscription change at index {index} requires a listener function."
                        ),
                        Some(error.to_string()),
                    )
                })?;
                let listener = listener_value.into_function().ok_or_else(|| {
                    call_error(
                        JscEvaluationErrorCode::InvalidPipelineRequest,
                        format!(
                            "JavaScriptCore pipeline subscription change at index {index} listener is not callable."
                        ),
                        None,
                    )
                })?;
                updates.push(JscPipelineSubscriptionUpdate::Subscribe {
                    subscription_id: subscription_id.clone(),
                    handle: JscPipelineListenerHandle {
                        module_namespace_id: change_module_namespace_id,
                        function: listener,
                        wait_state: wait_state.clone(),
                        translation_state: translation_state.clone(),
                        pipeline_state: pipeline_state.clone(),
                        helper_state: helper_state.clone(),
                        subscription_state: subscription_state.clone(),
                        unsupported_state: unsupported_state.clone(),
                        last_command_index,
                        last_subscription_change_index: next_change_index,
                    },
                });
            }
            JscPipelineSubscriptionOperation::Unsubscribe => {
                updates.push(JscPipelineSubscriptionUpdate::Unsubscribe {
                    subscription_id: subscription_id.clone(),
                });
            }
        }
        changes.push(wire_change);
    }
    Ok(JscPipelineSubscriptionExtraction {
        changes,
        updates,
        next_change_index,
    })
}

fn clear_pipeline_listener_active_commands(
    ctx: Context,
    subscription_state: &Object,
) -> Result<(), JscEvaluationError> {
    subscription_state
        .set("activeCommands", Value::new_undefined(ctx))
        .map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepContext,
                "JavaScriptCore pipeline listener active command array could not be cleared."
                    .to_string(),
                Some(error.to_string()),
            )
        })
}

fn wait_state_is_active(wait_state: &Object) -> Result<bool, JscEvaluationError> {
    let active: Value = wait_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep wait state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    wait_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep wait state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn translation_state_is_active(translation_state: &Object) -> Result<bool, JscEvaluationError> {
    let active: Value = translation_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep translation state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    translation_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep translation state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn pipeline_state_is_active(pipeline_state: &Object) -> Result<bool, JscEvaluationError> {
    let active: Value = pipeline_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep pipeline state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    pipeline_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep pipeline state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn helper_state_is_active(helper_state: &Object) -> Result<bool, JscEvaluationError> {
    let active: Value = helper_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep helper-call state active flag could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if active.is_undefined() || active.is_null() {
        return Ok(false);
    }
    helper_state.get("active").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep helper-call state active flag must be a boolean.".to_string(),
            Some(error.to_string()),
        )
    })
}

fn pending_step_request_from_states(
    wait_state: &Object,
    translation_state: &Object,
    pipeline_state: &Object,
    helper_state: &Object,
    resume_handle_id: &str,
) -> Result<JscPendingStepRequest, JscEvaluationError> {
    let wait_active = wait_state_is_active(wait_state)?;
    let translation_active = translation_state_is_active(translation_state)?;
    let pipeline_active = pipeline_state_is_active(pipeline_state)?;
    let helper_active = helper_state_is_active(helper_state)?;
    match (wait_active, translation_active, pipeline_active, helper_active) {
        (true, false, false, false) => Ok(JscPendingStepRequest::Wait(
            pending_wait_from_state(wait_state, resume_handle_id)?,
        )),
        (false, true, false, false) => Ok(JscPendingStepRequest::Translation(
            pending_translation_from_state(translation_state, resume_handle_id)?,
        )),
        (false, false, true, false) => Ok(JscPendingStepRequest::PipelineEmit(
            pending_pipeline_emit_from_state(pipeline_state, resume_handle_id)?,
        )),
        (false, false, false, true) => Ok(JscPendingStepRequest::HelperCall(
            pending_helper_call_from_state(helper_state, resume_handle_id)?,
        )),
        (false, false, false, false) => Err(call_error(
            JscEvaluationErrorCode::StepRunFailed,
            "JavaScriptCore GameStep promise blocked without an active StepContext continuation."
                .to_string(),
            Some("Native JavaScriptCore can only suspend GameStep runs at ctx.engine.waitFor, ctx.t, ctx.pipeline.emit, or a registered native helper call.".to_string()),
        )),
        _ => Err(call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep promise blocked with multiple active StepContext continuations."
                .to_string(),
            Some(
                "Native JavaScriptCore can only suspend one StepContext continuation at a time."
                    .to_string(),
            ),
        )),
    }
}

fn pending_wait_from_state(
    wait_state: &Object,
    resume_handle_id: &str,
) -> Result<JscGameStepWaitRequest, JscEvaluationError> {
    if !wait_state_is_active(wait_state)? {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidWaitEvent,
            "JavaScriptCore GameStep promise blocked without an active engine.waitFor.".to_string(),
            Some(
                "Native JavaScriptCore can only suspend GameStep runs at ctx.engine.waitFor."
                    .to_string(),
            ),
        ));
    }
    let event: String = wait_state.get("event").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidWaitEvent,
            "JavaScriptCore GameStep wait state requires a pipeline event name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_jsc_bridge_text(&event) {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidWaitEvent,
            "JavaScriptCore GameStep wait event name is invalid.".to_string(),
            Some("Wait event names must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    Ok(JscGameStepWaitRequest {
        resume_handle_id: resume_handle_id.to_string(),
        event,
    })
}

fn pending_translation_from_state(
    translation_state: &Object,
    resume_handle_id: &str,
) -> Result<JscGameStepTranslationRequest, JscEvaluationError> {
    if !translation_state_is_active(translation_state)? {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidTranslationRequest,
            "JavaScriptCore GameStep promise blocked without an active ctx.t request.".to_string(),
            Some(
                "Native JavaScriptCore can only translate through ctx.t continuations.".to_string(),
            ),
        ));
    }
    let key: String = translation_state.get("key").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidTranslationRequest,
            "JavaScriptCore GameStep translation state requires a translation key.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_jsc_bridge_text(&key) {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidTranslationRequest,
            "JavaScriptCore GameStep translation key is invalid.".to_string(),
            Some("Translation keys must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    let options_value: Value = translation_state.get("optionsJson").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidTranslationRequest,
            "JavaScriptCore GameStep translation optionsJson could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    let options_json = if options_value.is_undefined() || options_value.is_null() {
        None
    } else {
        let options_json: String = translation_state.get("optionsJson").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidTranslationRequest,
                "JavaScriptCore GameStep translation optionsJson must be a string.".to_string(),
                Some(error.to_string()),
            )
        })?;
        let parsed_options: serde_json::Value = serde_json::from_str(options_json.as_str())
            .map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidTranslationRequest,
                    "JavaScriptCore GameStep translation optionsJson must be valid JSON."
                        .to_string(),
                    Some(error.to_string()),
                )
            })?;
        if !parsed_options.is_object() && !parsed_options.is_array() {
            return Err(call_error(
                JscEvaluationErrorCode::InvalidTranslationRequest,
                "JavaScriptCore GameStep translation optionsJson must be a JSON object or array."
                    .to_string(),
                None,
            ));
        }
        Some(options_json)
    };
    Ok(JscGameStepTranslationRequest {
        resume_handle_id: resume_handle_id.to_string(),
        key,
        options_json,
    })
}

fn pending_pipeline_emit_from_state(
    pipeline_state: &Object,
    resume_handle_id: &str,
) -> Result<JscGameStepPipelineEmitRequest, JscEvaluationError> {
    if !pipeline_state_is_active(pipeline_state)? {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidPipelineRequest,
            "JavaScriptCore GameStep promise blocked without an active ctx.pipeline.emit request."
                .to_string(),
            Some("Native JavaScriptCore can only emit pipeline events through ctx.pipeline.emit continuations.".to_string()),
        ));
    }
    let event: String = pipeline_state.get("event").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidPipelineRequest,
            "JavaScriptCore GameStep pipeline state requires an event name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_jsc_bridge_text(&event) {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidPipelineRequest,
            "JavaScriptCore GameStep pipeline event name is invalid.".to_string(),
            Some("Pipeline event names must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    let payload_value: Value = pipeline_state.get("payloadJson").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidPipelineRequest,
            "JavaScriptCore GameStep pipeline payloadJson could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    let payload_json = if payload_value.is_undefined() || payload_value.is_null() {
        None
    } else {
        let payload_json: String = pipeline_state.get("payloadJson").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                "JavaScriptCore GameStep pipeline payloadJson must be a string.".to_string(),
                Some(error.to_string()),
            )
        })?;
        serde_json::from_str::<serde_json::Value>(payload_json.as_str()).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidPipelineRequest,
                "JavaScriptCore GameStep pipeline payloadJson must be valid JSON.".to_string(),
                Some(error.to_string()),
            )
        })?;
        Some(payload_json)
    };
    Ok(JscGameStepPipelineEmitRequest {
        resume_handle_id: resume_handle_id.to_string(),
        event,
        payload_json,
    })
}

fn pending_helper_call_from_state(
    helper_state: &Object,
    resume_handle_id: &str,
) -> Result<JscGameStepHelperCallRequest, JscEvaluationError> {
    if !helper_state_is_active(helper_state)? {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidHelperCallRequest,
            "JavaScriptCore GameStep promise blocked without an active native helper call.".to_string(),
            Some("Native JavaScriptCore can only bridge registered helper imports through native helper continuations.".to_string()),
        ));
    }
    let module: String = helper_state.get("module").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidHelperCallRequest,
            "JavaScriptCore GameStep helper-call state requires a module name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_jsc_bridge_text(&module) {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidHelperCallRequest,
            "JavaScriptCore GameStep helper-call module name is invalid.".to_string(),
            Some("Helper module names must be trimmed, non-empty, control-character-free, and at most 256 bytes.".to_string()),
        ));
    }
    let export_name: String = helper_state.get("exportName").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidHelperCallRequest,
            "JavaScriptCore GameStep helper-call state requires an export name.".to_string(),
            Some(error.to_string()),
        )
    })?;
    if !is_safe_jsc_bridge_text(&export_name)
        || matches!(
            export_name.as_str(),
            "__proto__" | "prototype" | "constructor"
        )
    {
        return Err(call_error(
            JscEvaluationErrorCode::InvalidHelperCallRequest,
            "JavaScriptCore GameStep helper-call export name is invalid.".to_string(),
            Some("Helper export names must be safe bridge text and must not be prototype-related names.".to_string()),
        ));
    }
    let args_value: Value = helper_state.get("argsJson").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidHelperCallRequest,
            "JavaScriptCore GameStep helper-call argsJson could not be read.".to_string(),
            Some(error.to_string()),
        )
    })?;
    let args_json = if args_value.is_undefined() || args_value.is_null() {
        None
    } else {
        let args_json: String = helper_state.get("argsJson").map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidHelperCallRequest,
                "JavaScriptCore GameStep helper-call argsJson must be a string.".to_string(),
                Some(error.to_string()),
            )
        })?;
        let parsed_args: serde_json::Value =
            serde_json::from_str(args_json.as_str()).map_err(|error| {
                call_error(
                    JscEvaluationErrorCode::InvalidHelperCallRequest,
                    "JavaScriptCore GameStep helper-call argsJson must be valid JSON.".to_string(),
                    Some(error.to_string()),
                )
            })?;
        if !parsed_args.is_array() {
            return Err(call_error(
                JscEvaluationErrorCode::InvalidHelperCallRequest,
                "JavaScriptCore GameStep helper-call argsJson must be a JSON array.".to_string(),
                None,
            ));
        }
        Some(args_json)
    };
    Ok(JscGameStepHelperCallRequest {
        resume_handle_id: resume_handle_id.to_string(),
        module,
        export_name,
        args_json,
    })
}

fn is_safe_jsc_bridge_text(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn is_allowed_step_engine_command_method(method: &str) -> bool {
    NATIVE_JSC_GAME_STEP_ENGINE_COMMAND_METHODS
        .iter()
        .any(|allowed| *allowed == method)
}

fn one_arg(ctx: Context, value: Value) -> Result<js::Args, JscEvaluationError> {
    let mut args = js::Args::new(ctx, 1);
    args.push_arg(value).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore GameStep run context could not be passed.".to_string(),
            Some(error.to_string()),
        )
    })?;
    Ok(args)
}

fn ten_args(
    ctx: Context,
    first: Object,
    second: Array,
    third: Object,
    fourth: Object,
    fifth: Object,
    sixth: Object,
    seventh: Object,
    eighth: Object,
    ninth: Array,
    tenth: &str,
) -> Result<js::Args, JscEvaluationError> {
    let mut args = js::Args::new(ctx, 10);
    args.push_arg(first).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext object could not be passed to bridge script.".to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(second).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext command array could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(third).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext unsupported-command marker could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(fourth).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext wait state could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(fifth).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext translation state could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(sixth).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext pipeline state could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(seventh).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext helper-call state could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(eighth).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext pipeline subscription state could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(ninth).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext engine command methods could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(tenth).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepContext,
            "JavaScriptCore StepContext module namespace id could not be passed to bridge script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    Ok(args)
}

fn two_args(ctx: Context, first: Object, second: Value) -> Result<js::Args, JscEvaluationError> {
    let mut args = js::Args::new(ctx, 2);
    args.push_arg(first).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::StepRunFailed,
            "JavaScriptCore StepContext wait state could not be passed to resume script."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    args.push_arg(second).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidResumePayload,
            "JavaScriptCore GameStep resume payload could not be passed to JavaScriptCore."
                .to_string(),
            Some(error.to_string()),
        )
    })?;
    Ok(args)
}

fn resume_payload_value(
    ctx: Context,
    payload_json: Option<&str>,
) -> Result<Value, JscEvaluationError> {
    match payload_json {
        Some(payload_json) => ctx.json_parse(payload_json).map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidResumePayload,
                "JavaScriptCore GameStep resume payloadJson must be valid JSON.".to_string(),
                Some(error.to_string()),
            )
        }),
        None => Ok(Value::new_undefined(ctx)),
    }
}

fn read_callable_export(
    namespace: &Object,
    module_namespace_id: &str,
    export_name: &str,
) -> Result<Function, JscEvaluationError> {
    let export_value: Value = namespace.get(export_name).map_err(|error| {
        call_error(
            JscEvaluationErrorCode::EvaluationFailed,
            format!("JavaScriptCore module export \"{export_name}\" could not be read."),
            Some(error.to_string()),
        )
    })?;
    if export_value.is_undefined() || export_value.is_null() {
        return Err(call_error(
            JscEvaluationErrorCode::MissingExport,
            format!("JavaScriptCore module namespace \"{module_namespace_id}\" does not export \"{export_name}\"."),
            None,
        ));
    }
    export_value.into_function().ok_or_else(|| {
        call_error(
            JscEvaluationErrorCode::ExportNotCallable,
            format!("JavaScriptCore module export \"{export_name}\" is not callable."),
            None,
        )
    })
}

fn step_metadata_json(
    ctx: &Context,
    step_object: &Object,
) -> Result<Option<String>, JscEvaluationError> {
    let metadata: Value = step_object.get("metadata").map_err(|error| {
        call_error(
            JscEvaluationErrorCode::InvalidStepDescriptor,
            "JavaScriptCore GameStep metadata could not be read.".to_string(),
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
                JscEvaluationErrorCode::InvalidStepDescriptor,
                "JavaScriptCore GameStep metadata could not be serialized to JSON.".to_string(),
                Some(error.to_string()),
            )
        })?
        .ok_or_else(|| {
            call_error(
                JscEvaluationErrorCode::InvalidStepDescriptor,
                "JavaScriptCore GameStep metadata must be JSON-serializable.".to_string(),
                None,
            )
        })?
        .to_string()
        .map_err(|error| {
            call_error(
                JscEvaluationErrorCode::InvalidStepDescriptor,
                "JavaScriptCore GameStep metadata string could not be copied to Rust.".to_string(),
                Some(error.to_string()),
            )
        })?;
    Ok(Some(value))
}

fn call_error(
    code: JscEvaluationErrorCode,
    message: String,
    detail: Option<String>,
) -> JscEvaluationError {
    JscEvaluationError {
        code,
        message,
        asset_name: None,
        detail,
    }
}

fn step_run_error_from_unsupported_state(
    unsupported_state: &Object,
    message: String,
    detail: Option<String>,
) -> JscEvaluationError {
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
            JscEvaluationErrorCode::UnsupportedStepContextCommand,
            format!("JavaScriptCore GameStep run reached unsupported StepContext command {name}."),
            Some(format!(
                "Native JavaScriptCore StepContext {name} requires a native continuation bridge.{}",
                detail
                    .map(|value| format!(" JavaScriptCore detail: {value}"))
                    .unwrap_or_default()
            )),
        );
    }
    call_error(JscEvaluationErrorCode::StepRunFailed, message, detail)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jsc::{
        evaluate_jsc_module_with_registry, JscModuleNamespaceRegistry, JscRuntimeModuleKind,
        JscRuntimeModuleRecord,
    };

    #[test]
    fn reports_real_jsc_version_when_backend_feature_is_enabled() {
        let version = jsc_runtime_backend_version();

        assert!(version.starts_with("javascriptcore-"));
        assert!(version.contains(JSC_BACKEND_VERSION));
    }

    #[test]
    fn jsc_modules_preserve_live_bindings_cycles_and_top_level_await() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let mut request = request_for_code(
            "scripts/main.js",
            r#"
            import { count, increment, readCycle } from './counter.js';
            export function cycleValue() { return 'cycle'; }
            await Promise.resolve();
            export function read() { increment(); return [count, readCycle()]; }
        "#,
        );
        let mut dependency = request_for_code(
            "scripts/counter.js",
            r#"
            import { cycleValue } from './main.js';
            export let count = 0;
            export function increment() { count += 1; }
            export function readCycle() { return cycleValue(); }
        "#,
        )
        .module;
        dependency.package_id = request.module.package_id.clone();
        request.module_graph.push(dependency);
        let id = evaluator
            .evaluate_module(&request)
            .unwrap()
            .module_namespace_id
            .unwrap();
        for count in 1..=2 {
            let response = evaluator
                .call_module_export(&JscModuleExportCallRequest {
                    module_namespace_id: id.clone(),
                    export_name: "read".into(),
                    args_json: None,
                })
                .unwrap();
            assert_eq!(response.value_json.unwrap(), format!("[{count},\"cycle\"]"));
        }
    }

    #[test]
    fn jsc_dynamic_imports_use_only_the_declared_graph_and_hide_loader_state() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let mut request = request_for_code(
            "scripts/main.js",
            r#"
            export async function read() {
                const module = await import('./dynamic.js');
                return [module.value, typeof records, typeof resolve, typeof register, typeof evaluate];
            }
            export async function escape() { return import('../../outside.js'); }
            export async function missing() { return import('./undeclared.js'); }
            export function reregister() { System.register([], () => ({})); }
        "#,
        );
        request.module_graph.push(
            request_for_code("scripts/dynamic.js", "export const value = 'declared';").module,
        );
        let id = evaluator
            .evaluate_module(&request)
            .unwrap()
            .module_namespace_id
            .unwrap();
        let call = |name: &str| JscModuleExportCallRequest {
            module_namespace_id: id.clone(),
            export_name: name.into(),
            args_json: None,
        };
        assert_eq!(
            evaluator
                .call_module_export(&call("read"))
                .unwrap()
                .value_json
                .unwrap(),
            r#"["declared","undefined","undefined","undefined","undefined"]"#
        );
        for name in ["escape", "missing", "reregister"] {
            assert!(
                evaluator.call_module_export(&call(name)).is_err(),
                "{name} must be rejected"
            );
        }
    }

    #[test]
    fn jsc_package_re_evaluation_does_not_reuse_released_module_code() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        for value in ["first", "replacement"] {
            let request = request_for_code(
                "scripts/same.js",
                &format!("export const value = {value:?};"),
            );
            let id = evaluator
                .evaluate_module(&request)
                .unwrap()
                .module_namespace_id
                .unwrap();
            assert_eq!(exported_string(&evaluator, &id, "value"), value);
            evaluator.release_module_namespace(&id);
            assert_eq!(evaluator.namespace_count(), 0);
        }
    }

    #[test]
    fn jsc_limits_also_interrupt_export_calls_and_context_recovers() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let mut request = request_for_code(
            "scripts/timeout.js",
            r#"
            export function loop() { for (;;) {} }
            export function alive() { return 'alive'; }
        "#,
        );
        request.limits.max_execution_time_ms = 10;
        let id = evaluator
            .evaluate_module(&request)
            .unwrap()
            .module_namespace_id
            .unwrap();
        let started = std::time::Instant::now();
        assert!(evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: id.clone(),
                export_name: "loop".into(),
                args_json: None,
            })
            .is_err());
        assert!(started.elapsed() < Duration::from_secs(2));
        assert_eq!(exported_call_string(&mut evaluator, &id, "alive"), "alive");
    }

    #[test]
    fn jsc_values_keep_unicode_and_embedded_nul_and_reject_cross_context_use() {
        let ctx = Context::new().unwrap();
        let value = ctx.json_parse(r#""凛\u0000🎵""#).unwrap();
        assert_eq!(String::from_js(&ctx, value.clone()).unwrap(), "凛\0🎵");
        assert!(Context::new()
            .unwrap()
            .globals()
            .set("foreign", value)
            .is_err());
    }

    #[test]
    fn installs_a_callable_native_console_writer_global() {
        let context = Context::new().unwrap();

        context.with(|ctx| {
            install_native_console_writer(&ctx).unwrap();
            let installed: bool = ctx
                .eval(format!(
                    "typeof globalThis.{NATIVE_JSC_CONSOLE_WRITE} === 'function'"
                ))
                .unwrap();
            assert!(installed, "native console writer must be installed");
            // Reaches the `log` facade; with no logger registered this is a
            // no-op, so the assertion is that the call does not throw.
            ctx.eval::<(), _>(format!(
                "globalThis.{NATIVE_JSC_CONSOLE_WRITE}('warn', 'native console smoke')"
            ))
            .unwrap();
        });
    }

    #[test]
    fn console_shim_forwards_every_level_and_formats_arguments() {
        let context = Context::new().unwrap();

        let captured = context.with(|ctx| {
            // Stand in for the Rust writer so the assertion covers the JS shim's
            // level mapping and argument formatting.
            ctx.eval::<(), _>(
                r#"
                globalThis.__captured = [];
                globalThis.__quaNativeConsoleWrite = (level, message) => {
                  globalThis.__captured.push(level + '|' + message);
                };
                "#,
            )
            .unwrap();
            ctx.eval::<(), _>(NATIVE_JSC_RENDERER_BRIDGE_SOURCE)
                .unwrap();
            ctx.eval::<(), _>(
                r#"
                console.log('plain', 1, true);
                console.info('info');
                console.warn('warn');
                console.error(new Error('boom'));
                console.debug('debug');
                console.trace('trace');
                console.log({ a: 1 }, null, undefined);
                "#,
            )
            .unwrap();
            ctx.eval::<Vec<String>, _>("globalThis.__captured").unwrap()
        });

        assert_eq!(captured[0], "info|plain 1 true");
        assert_eq!(captured[1], "info|info");
        assert_eq!(captured[2], "warn|warn");
        assert!(
            captured[3].starts_with("error|") && captured[3].contains("boom"),
            "errors must forward their message: {}",
            captured[3]
        );
        assert_eq!(captured[4], "debug|debug");
        assert_eq!(captured[5], "trace|trace");
        assert_eq!(captured[6], r#"info|{"a":1} null undefined"#);
    }

    #[test]
    fn bridge_helper_exports_cover_official_decorator_modules() {
        let expected = [
            (
                "@quajs/character",
                &[
                    "speakWithEngine",
                    "narrateWithEngine",
                    "showWithEngine",
                    "hideWithEngine",
                    "hideAllCharactersWithEngine",
                    "moveWithEngine",
                    "expressionWithEngine",
                    "spriteWithEngine",
                ][..],
            ),
            (
                "@quajs/character/animation",
                &[
                    "playCharacterEnterWithEngine",
                    "playCharacterFadeWithEngine",
                    "playCharacterExitWithEngine",
                ][..],
            ),
            (
                "@quajs/plugin-achievement",
                &[
                    "unlockAchievementWithEngine",
                    "openAchievementBoardWithEngine",
                ][..],
            ),
            (
                "@quajs/plugin-animation",
                &[
                    "registerAnimationWithEngine",
                    "playTimelineWithEngine",
                    "playAnimationWithEngine",
                ][..],
            ),
            (
                "@quajs/plugin-audio",
                &[
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
                ][..],
            ),
            (
                "@quajs/plugin-background",
                &[
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
                ][..],
            ),
            ("@quajs/plugin-backlog", &["setBacklogPolicyWithEngine"][..]),
            (
                "@quajs/plugin-gallery",
                &["unlockGalleryEntryWithEngine", "openGallerySceneWithEngine"][..],
            ),
            (
                "@quajs/plugin-inventory",
                &[
                    "grantInventoryItemWithEngine",
                    "consumeInventoryItemWithEngine",
                    "setInventoryItemQuantityWithEngine",
                ][..],
            ),
            (
                "@quajs/story-graph",
                &[
                    "setStoryMetadataWithEngine",
                    "emitStoryEventWithEngine",
                    "setStoryChapterSelectWithEngine",
                ][..],
            ),
        ];

        for (module, exports) in expected {
            let actual = native_jsc_bridge_helper_exports(module)
                .unwrap_or_else(|| panic!("{module} helper exports are registered"));

            for export in exports {
                assert!(
                    actual.contains(export),
                    "{module} should expose {export} through the native JavaScriptCore helper bridge",
                );
            }
        }

        assert!(native_jsc_bridge_helper_exports("@quajs/plugin-settings").is_none());
    }

    #[test]
    fn evaluates_es_module_and_keeps_namespace_handle_until_release() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let request = request_for_code(
            "scripts/opening.js",
            "export const title = 'Opening'; export default function opening() { return title; }",
        );

        let response = evaluator.evaluate_module(&request).unwrap();

        assert!(response.ok);
        let namespace_id = response.module_namespace_id.unwrap();
        assert!(namespace_id.starts_with("jsc:"));
        assert!(evaluator.contains_module_namespace(&namespace_id));
        assert_eq!(
            exported_string(&evaluator, &namespace_id, "title"),
            "Opening"
        );

        evaluator.release_module_namespace(&namespace_id);

        assert!(!evaluator.contains_module_namespace(&namespace_id));
    }

    #[test]
    fn installs_minimal_abort_controller_for_engine_modules() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/abort-controller.js",
                r#"
                const controller = new AbortController();
                export function state() {
                    const before = controller.signal.aborted;
                    controller.abort('cancelled');
                    return {
                        before,
                        after: controller.signal.aborted,
                        reason: controller.signal.reason,
                    };
                }
                "#,
            ))
            .unwrap();
        let namespace_id = response.module_namespace_id.unwrap();
        let call = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: namespace_id,
                export_name: "state".to_string(),
                args_json: Some("[]".to_string()),
            })
            .unwrap();
        assert_eq!(
            call.value_json,
            Some(r#"{"before":false,"after":true,"reason":"cancelled"}"#.to_string())
        );
    }

    #[test]
    fn drains_logic_to_renderer_pipeline_messages_without_render_exports() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        evaluator
            .evaluate_module(&request_for_code(
                "scripts/native-pipeline.js",
                r#"
                globalThis.__quaNativePipelineBridge.emit('view/update', {
                    view: { dialogue: { visible: true, text: 'hello' } }
                });
                export const ready = true;
                "#,
            ))
            .unwrap();

        let messages = evaluator.drain_native_pipeline_messages().unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].event, "view/update");
        assert_eq!(
            messages[0].payload_json,
            r#"{"view":{"dialogue":{"visible":true,"text":"hello"}}}"#
        );
        assert!(evaluator
            .drain_native_pipeline_messages()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn job_deadlines_park_idle_and_preserve_timer_cancellation_and_microtasks() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        assert_eq!(evaluator.native_job_delay().unwrap(), None);
        evaluator.context.with(|ctx| {
            ctx.eval::<(), _>("globalThis.events = []; globalThis.pendingTimer = setTimeout(() => events.push('late'), 60000)").unwrap();
        });
        let delay = evaluator.native_job_delay().unwrap().unwrap();
        assert!(delay.as_secs() >= 59 && delay.as_secs() <= 60);
        evaluator.context.with(|ctx| {
            ctx.eval::<(), _>("clearTimeout(pendingTimer); Promise.resolve().then(() => setTimeout(() => events.push('ready'), 0))").unwrap();
        });
        assert_eq!(evaluator.native_job_delay().unwrap(), Some(Duration::ZERO));
        evaluator.pump_native_jobs().unwrap();
        // JSC already drained the Promise before the first timer pump.
        assert_eq!(evaluator.native_job_delay().unwrap(), None);
        evaluator.context.with(|ctx| {
            assert_eq!(
                ctx.eval::<String, _>("JSON.stringify(events)").unwrap(),
                r#"["ready"]"#
            );
        });
    }

    #[test]
    fn pipeline_payload_is_snapshotted_once_and_drained_in_order() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        evaluator.context.with(|ctx| {
            ctx.eval::<(), _>(
                r#"
                const payload = { text: 'quote"\n日本語' };
                __quaNativePipelineBridge.emit('view/update', payload);
                payload.text = 'changed';
                __quaNativePipelineBridge.emit('scene/change', payload);
            "#,
            )
            .unwrap();
        });
        let messages = evaluator.drain_native_pipeline_messages().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].event, "view/update");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&messages[0].payload_json).unwrap()["text"],
            "quote\"\n日本語"
        );
        assert_eq!(messages[1].event, "scene/change");
        assert!(evaluator
            .drain_native_pipeline_messages()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn installs_cancellable_pumped_timer_for_engine_modules() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/timer.js",
                r#"
                const events = [];
                export function schedule() {
                    const cancelled = setTimeout(() => events.push('cancelled'), 0);
                    clearTimeout(cancelled);
                    setTimeout(() => events.push('fired'), 0);
                    return events;
                }
                export function state() {
                    return events;
                }
                "#,
            ))
            .unwrap();
        let namespace_id = response.module_namespace_id.unwrap();
        let scheduled = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: namespace_id.clone(),
                export_name: "schedule".to_string(),
                args_json: Some("[]".to_string()),
            })
            .unwrap();
        assert_eq!(scheduled.value_json, Some("[]".to_string()));
        let call = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: namespace_id,
                export_name: "state".to_string(),
                args_json: Some("[]".to_string()),
            })
            .unwrap();
        assert_eq!(call.value_json, Some(r#"["fired"]"#.to_string()));
    }

    #[test]
    fn dispatches_committed_renderer_intents_to_the_jsc_bridge_subscriber() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        assert!(!evaluator
            .dispatch_renderer_intent(&crate::host::NativeRendererIntent {
                r#type: "ui/intent".to_string(),
                payload_json: None,
            })
            .unwrap());

        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/native-renderer-bridge.js",
                r#"
                const received = [];
                globalThis.__quaNativeRendererBridge.subscribe(async intent => {
                    received.push(intent);
                });
                export function lastIntent() {
                    return received[received.length - 1];
                }
                "#,
            ))
            .unwrap();
        let namespace_id = response.module_namespace_id.unwrap();

        assert!(evaluator
            .dispatch_renderer_intent(&crate::host::NativeRendererIntent {
                r#type: "ui/intent".to_string(),
                payload_json: Some("{\"action\":\"settings-update\"}".to_string()),
            })
            .unwrap());

        let call = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: namespace_id,
                export_name: "lastIntent".to_string(),
                args_json: Some("[]".to_string()),
            })
            .unwrap();
        assert_eq!(
            call.value_json,
            Some(
                "{\"type\":\"ui/intent\",\"payloadJson\":\"{\\\"action\\\":\\\"settings-update\\\"}\"}"
                    .to_string()
            )
        );
    }

    #[test]
    fn bridges_compiled_quascript_character_helpers_to_the_real_host_package() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                import { resolveQuaText } from '@quajs/engine';
                import { speakWithEngine, hideAllCharactersWithEngine } from '@quajs/character';

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
                            await hideAllCharactersWithEngine(ctx.engine);
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: Some("{\"playerName\":\"Mira\"}".to_string()),
            })
            .unwrap()
            .steps
            .unwrap();

        let run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.speak\"}".to_string()),
            })
            .unwrap();

        assert!(run.commands.unwrap().is_empty());
        let pending = run.pending_helper_call.unwrap();
        assert_eq!(pending.module, "@quajs/character");
        assert_eq!(pending.export_name, "speakWithEngine");
        let args: serde_json::Value =
            serde_json::from_str(pending.args_json.as_deref().unwrap()).unwrap();
        assert_eq!(args[0], "alice");
        assert_eq!(args[1], "Hi Mira");
        assert_eq!(args[2]["wait"], false);
        assert_eq!(args[2]["speaker"], "Alice");
        assert_eq!(args[2]["avatar"], "alice.png");

        let hiding = evaluator
            .resume_game_step_run(&JscGameStepResumeRequest {
                resume_handle_id: pending.resume_handle_id,
                payload_json: None,
            })
            .unwrap();
        assert!(hiding.commands.unwrap().is_empty());
        let pending = hiding.pending_helper_call.unwrap();
        assert_eq!(pending.module, "@quajs/character");
        assert_eq!(pending.export_name, "hideAllCharactersWithEngine");
        assert_eq!(pending.args_json.as_deref(), Some("[]"));

        let completed = evaluator
            .resume_game_step_run(&JscGameStepResumeRequest {
                resume_handle_id: pending.resume_handle_id,
                payload_json: None,
            })
            .unwrap();
        assert!(completed.pending_helper_call.is_none());
        assert!(completed.commands.unwrap().is_empty());
    }

    #[test]
    fn game_step_factory_accepts_async_resolved_step_arrays() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/async-factory.js",
                r#"
                export default async function opening(scope = {}) {
                    const suffix = await Promise.resolve(scope.suffix || 'native');
                    return [{
                        uuid: 'intro.async-factory',
                        metadata: {
                            point: { nodeId: 'async-' + suffix }
                        },
                        run(ctx) {
                            ctx.engine.showDialogue({
                                text: 'Async factory resolved for ' + suffix,
                                mode: 'narration'
                            });
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: Some("{\"suffix\":\"jsc\"}".to_string()),
            })
            .unwrap()
            .steps
            .unwrap();

        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].uuid, "intro.async-factory");
        assert_eq!(
            steps[0].metadata_json.as_deref(),
            Some("{\"point\":{\"nodeId\":\"async-jsc\"}}")
        );

        let run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.async-factory\"}".to_string()),
            })
            .unwrap();
        let commands = run.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].method, "showDialogue");
        let args: serde_json::Value =
            serde_json::from_str(commands[0].args_json.as_deref().unwrap()).unwrap();
        assert_eq!(args[0]["text"], "Async factory resolved for jsc");
        assert_eq!(args[0]["mode"], "narration");
    }

    #[test]
    fn evaluates_compiled_quascript_with_engine_story_helpers() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/choice.js",
                r#"
                import { checkpoint, image, label, node, packageNode, scene, script } from '@quajs/engine';

                export default function opening() {
                    return [{
                        uuid: 'intro.choice',
                        async run(ctx) {
                            await ctx.engine.showChoices([{
                                id: 'go-library',
                                text: 'Go library',
                                target: node('library', {
                                    sceneId: 'opening',
                                    requiredRuntimePackages: ['runtime.library']
                                }),
                                enabled: true,
                                presentation: {
                                    thumbnail: image('story/library.png', { alt: 'Library' })
                                },
                                metadata: {
                                    jumpTarget: scene('dorm', { entry: 'nightReturn', state: { from: 'library' } }),
                                    labelTarget: label('after-library'),
                                    scriptTarget: script('bonus', { nodeId: 'after' }),
                                    packageTarget: packageNode('runtime.extra', 'node-1'),
                                    checkpointTarget: checkpoint('save-1')
                                }
                            }]);
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.choice\"}".to_string()),
            })
            .unwrap();

        let commands = run.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].method, "showChoices");
        let args: serde_json::Value =
            serde_json::from_str(commands[0].args_json.as_deref().unwrap()).unwrap();
        let choice = &args[0][0];
        assert_eq!(choice["target"]["kind"], "node");
        assert_eq!(choice["target"]["id"], "library");
        assert_eq!(choice["target"]["sceneId"], "opening");
        assert_eq!(
            choice["target"]["requiredRuntimePackages"][0],
            "runtime.library"
        );
        assert_eq!(choice["presentation"]["thumbnail"]["type"], "images");
        assert_eq!(
            choice["presentation"]["thumbnail"]["name"],
            "story/library.png"
        );
        assert_eq!(choice["presentation"]["thumbnail"]["alt"], "Library");
        assert_eq!(choice["metadata"]["jumpTarget"]["kind"], "scene");
        assert_eq!(choice["metadata"]["jumpTarget"]["sceneId"], "dorm");
        assert_eq!(choice["metadata"]["jumpTarget"]["entry"], "nightReturn");
        assert_eq!(choice["metadata"]["labelTarget"]["kind"], "label");
        assert_eq!(choice["metadata"]["scriptTarget"]["kind"], "script");
        assert_eq!(choice["metadata"]["packageTarget"]["kind"], "package-node");
        assert_eq!(choice["metadata"]["checkpointTarget"]["kind"], "checkpoint");
    }

    #[test]
    fn character_waiting_semantics_are_delegated_to_the_real_host_package() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                import { narrateWithEngine } from '@quajs/character';

                export default function opening() {
                    return [{
                        uuid: 'intro.narrate',
                        async run(ctx) {
                            await narrateWithEngine(ctx.engine, 'Hello from native JavaScriptCore.');
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.narrate\"}".to_string()),
            })
            .unwrap();

        assert!(run.ok);
        assert!(run.commands.unwrap().is_empty());
        assert!(run.pending_wait.is_none());
        let pending = run.pending_helper_call.unwrap();
        assert_eq!(pending.module, "@quajs/character");
        assert_eq!(pending.export_name, "narrateWithEngine");
        assert_eq!(
            pending.args_json,
            Some("[\"Hello from native JavaScriptCore.\"]".to_string())
        );
    }

    #[test]
    fn rejects_non_builtin_module_imports_without_host_resolution() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let error = evaluator
            .evaluate_module(&request_for_code(
                "scripts/unsafe-import.js",
                "import { readFile } from 'node:fs'; export const unsafe = readFile;",
            ))
            .unwrap_err();

        assert_eq!(error.code, JscEvaluationErrorCode::EvaluationFailed);
        assert_eq!(
            error.asset_name,
            Some("scripts/unsafe-import.js".to_string())
        );
        assert!(error.detail.as_deref().unwrap_or_default().len() > 0);
        assert_eq!(evaluator.namespace_count(), 0);
    }

    #[test]
    fn builtin_helper_imports_can_be_reused_across_modules() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let mut request = request_for_code(
            "scripts/opening.js",
            r#"
            import { buildTitle } from './helpers/title.js?cache=1#runtime';
            export function title(name) { return buildTitle(name); }
            "#,
        );
        request.module_graph.push(JscRuntimeModuleRecord {
            asset_name: "scripts/helpers/title.js?cache=1#runtime".to_string(),
            bundle_name: "runtime.chapter.native-ui".to_string(),
            package_id: "runtime.chapter.native-ui".to_string(),
            kind: JscRuntimeModuleKind::Script,
            code: "export function buildTitle(name) { return `Opening:${name}`; }".to_string(),
            bytes: b"export function buildTitle(name) { return `Opening:${name}`; }".to_vec(),
        });

        let module_namespace_id = evaluator
            .evaluate_module(&request)
            .unwrap()
            .module_namespace_id
            .unwrap();
        let call = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id,
                export_name: "title".to_string(),
                args_json: Some("[\"Mira\"]".to_string()),
            })
            .unwrap();

        assert_eq!(call.value_json, Some("\"Opening:Mira\"".to_string()));
    }

    #[test]
    fn rejects_package_local_imports_not_declared_in_module_graph() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let error = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                "import { buildTitle } from './helpers/title.js'; export const title = buildTitle('Mira');",
            ))
            .unwrap_err();

        assert_eq!(error.code, JscEvaluationErrorCode::EvaluationFailed);
        assert_eq!(error.asset_name, Some("scripts/opening.js".to_string()));
        assert!(error.detail.as_deref().unwrap_or_default().len() > 0);
    }

    #[test]
    fn returns_structured_error_for_invalid_js_module() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let error = evaluator
            .evaluate_module(&request_for_code("scripts/broken.js", "export const = ;"))
            .unwrap_err();

        assert_eq!(error.code, JscEvaluationErrorCode::EvaluationFailed);
        assert_eq!(error.asset_name, Some("scripts/broken.js".to_string()));
        assert!(error.detail.unwrap().len() > 0);
    }

    #[test]
    fn honors_interrupt_limit_for_long_running_modules() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let mut request = request_for_code(
            "scripts/loop.js",
            "while (true) {} export const unreachable = true;",
        );
        request.limits.max_execution_time_ms = 10;

        let error = evaluator.evaluate_module(&request).unwrap_err();

        assert_eq!(error.code, JscEvaluationErrorCode::EvaluationFailed);
        assert_eq!(error.asset_name, Some("scripts/loop.js".to_string()));
    }

    #[test]
    fn registry_release_drops_persistent_namespace_handles() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let mut registry = JscModuleNamespaceRegistry::new();
        let request = request_for_code("scripts/opening.js", "export const ok = true;");
        let response = evaluate_jsc_module_with_registry(&mut evaluator, &mut registry, &request);
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
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let request = request_for_code(
            "scripts/math.js",
            "export function add(a, b) { return { value: a + b }; }",
        );
        let response = evaluator.evaluate_module(&request).unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let call = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id,
                export_name: "add".to_string(),
                args_json: Some("[2,3]".to_string()),
            })
            .unwrap();

        assert!(call.ok);
        assert_eq!(call.value_json, Some("{\"value\":5}".to_string()));
    }

    #[test]
    fn resolves_async_json_safe_module_exports() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/async.js",
                "export async function value() { await Promise.resolve(); return { ready: true }; }",
            ))
            .unwrap();
        let call = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: response.module_namespace_id.unwrap(),
                export_name: "value".to_string(),
                args_json: Some("[]".to_string()),
            })
            .unwrap();
        assert_eq!(call.value_json, Some("{\"ready\":true}".to_string()));
    }

    #[test]
    fn rejects_missing_and_non_callable_exports() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/constants.js",
                "export const value = 42;",
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let missing = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "missing".to_string(),
                args_json: None,
            })
            .unwrap_err();
        assert_eq!(missing.code, JscEvaluationErrorCode::MissingExport);

        let non_callable = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id,
                export_name: "value".to_string(),
                args_json: None,
            })
            .unwrap_err();
        assert_eq!(non_callable.code, JscEvaluationErrorCode::ExportNotCallable);
    }

    #[test]
    fn rejects_invalid_export_call_arguments() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/echo.js",
                "export function echo(value) { return value; }",
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();

        let error = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id,
                export_name: "echo".to_string(),
                args_json: Some("{\"not\":\"array\"}".to_string()),
            })
            .unwrap_err();

        assert_eq!(error.code, JscEvaluationErrorCode::InvalidArguments);
    }

    #[test]
    fn creates_game_step_descriptors_and_runs_step_handles() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
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
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some(
                    "{\"stepId\":\"intro.1\",\"previousStepId\":\"intro.0\"}".to_string(),
                ),
            })
            .unwrap();
        assert!(run.ok);
        assert_eq!(run.commands, Some(Vec::new()));

        let last_run = evaluator
            .call_module_export(&JscModuleExportCallRequest {
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
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                r#"
                export default function opening() {
                    return [{
                        uuid: 'intro.choices',
                        async run(ctx) {
                            await ctx.engine.showChoices([{ id: 'go', text: 'Go' }]);
                            await ctx.engine.quickSave({ name: 'Before choice' });
                            await ctx.engine.markRollbackBoundary('no-rollback');
                            await ctx.engine.clearChoices();
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.choices\"}".to_string()),
            })
            .unwrap();

        let commands = run.commands.unwrap();
        assert_eq!(commands.len(), 4);
        assert_eq!(commands[0].target, "engine");
        assert_eq!(commands[0].method, "showChoices");
        assert_eq!(
            commands[0].args_json,
            Some("[[{\"id\":\"go\",\"text\":\"Go\"}]]".to_string())
        );
        assert_eq!(commands[1].target, "engine");
        assert_eq!(commands[1].method, "quickSave");
        assert_eq!(
            commands[1].args_json,
            Some("[{\"name\":\"Before choice\"}]".to_string())
        );
        assert_eq!(commands[2].target, "engine");
        assert_eq!(commands[2].method, "markRollbackBoundary");
        assert_eq!(commands[2].args_json, Some("[\"no-rollback\"]".to_string()));
        assert_eq!(commands[3].target, "engine");
        assert_eq!(commands[3].method, "clearChoices");
        assert_eq!(commands[3].args_json, Some("[]".to_string()));
    }

    #[test]
    fn game_step_wait_for_suspends_and_resumes_same_promise() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let pending_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
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
            .resume_game_step_run(&JscGameStepResumeRequest {
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
            .resume_game_step_run(&JscGameStepResumeRequest {
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
            .call_module_export(&JscModuleExportCallRequest {
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
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let pending_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
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
            .resume_game_step_run(&JscGameStepResumeRequest {
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
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id,
                export_name: "getTranslated".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(translated.value_json, Some("\"Hello, Mira\"".to_string()));
    }

    #[test]
    fn game_step_translation_rejects_unsafe_requests_and_resume_payloads() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "unsafeKey".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_key = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: unsafe_key_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-key\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(unsafe_key.code, JscEvaluationErrorCode::StepRunFailed);
        assert!(unsafe_key.message.contains("promise failed"));

        let unsafe_options_step = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "unsafeOptions".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_options = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: unsafe_options_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-options\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(unsafe_options.code, JscEvaluationErrorCode::StepRunFailed);
        assert!(unsafe_options.message.contains("promise failed"));

        let pending_step = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "pendingTranslation".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let pending_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: pending_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-resume\"}".to_string()),
            })
            .unwrap();
        let pending_translation = pending_run.pending_translation.unwrap();
        let bad_resume = evaluator
            .resume_game_step_run(&JscGameStepResumeRequest {
                resume_handle_id: pending_translation.resume_handle_id,
                payload_json: Some("{\"text\":\"Hello\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(bad_resume.code, JscEvaluationErrorCode::StepRunFailed);
        assert!(bad_resume.message.contains("resume handle"));
    }

    #[test]
    fn game_step_pipeline_emit_suspends_and_resumes_same_promise() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let pending_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
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
            .resume_game_step_run(&JscGameStepResumeRequest {
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
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id,
                export_name: "getEmitted".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(emitted.value_json, Some("true".to_string()));
    }

    #[test]
    fn game_step_pipeline_emit_rejects_unsafe_events_and_payloads() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "unsafeEvent".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_event = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: unsafe_event_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-event\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(unsafe_event.code, JscEvaluationErrorCode::StepRunFailed);
        assert!(unsafe_event.message.contains("promise failed"));

        let unsafe_payload_step = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "unsafePayload".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);
        let unsafe_payload = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: unsafe_payload_step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.bad-payload\"}".to_string()),
            })
            .unwrap_err();
        assert_eq!(unsafe_payload.code, JscEvaluationErrorCode::StepRunFailed);
        assert!(unsafe_payload.message.contains("promise failed"));
    }

    #[test]
    fn game_step_pipeline_on_dispatches_listener_and_off_releases_it() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/listener.js",
                r#"
                let handler = null;
                let lastValue = null;

                export default function opening() {
                    return [{
                        uuid: 'intro.listen',
                        async run(ctx) {
                            handler = context => {
                                lastValue = context.event.payload.value;
                                ctx.engine.showDialogue({ text: String(lastValue), mode: 'narration' });
                            };
                            ctx.pipeline.on('plugin/custom_event', handler);
                        }
                    }, {
                        uuid: 'intro.unlisten',
                        async run(ctx) {
                            ctx.pipeline.off('plugin/custom_event', handler);
                        }
                    }];
                }

                export function getLastValue() { return lastValue; }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let subscribe_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.listen\"}".to_string()),
            })
            .unwrap();

        assert!(subscribe_run.ok);
        assert_eq!(subscribe_run.commands, Some(Vec::new()));
        let subscriptions = subscribe_run.pipeline_subscriptions.unwrap();
        assert_eq!(subscriptions.len(), 1);
        assert_eq!(
            subscriptions[0].op,
            JscPipelineSubscriptionOperation::Subscribe
        );
        assert_eq!(
            subscriptions[0].module_namespace_id.as_str(),
            module_namespace_id.as_str()
        );
        assert_eq!(subscriptions[0].event.as_str(), "plugin/custom_event");
        let subscription_id = subscriptions[0].subscription_id.clone();
        assert_eq!(evaluator.pipeline_listener_handle_count(), 1);

        let dispatch = evaluator
            .dispatch_pipeline_listener(&JscPipelineListenerDispatchRequest {
                subscription_id: subscription_id.clone(),
                context_json: "{\"event\":{\"type\":\"plugin/custom_event\",\"payload\":{\"value\":42},\"timestamp\":1,\"id\":\"evt-1\"}}"
                    .to_string(),
            })
            .unwrap();

        assert!(dispatch.ok);
        let commands = dispatch.commands.unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].method, "showDialogue");
        assert_eq!(
            commands[0].args_json,
            Some("[{\"text\":\"42\",\"mode\":\"narration\"}]".to_string())
        );
        let last_value = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "getLastValue".to_string(),
                args_json: None,
            })
            .unwrap();
        assert_eq!(last_value.value_json, Some("42".to_string()));

        let unsubscribe_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[1].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.unlisten\"}".to_string()),
            })
            .unwrap();

        let unsubscribe = unsubscribe_run.pipeline_subscriptions.unwrap();
        assert_eq!(unsubscribe.len(), 1);
        assert_eq!(
            unsubscribe[0].op,
            JscPipelineSubscriptionOperation::Unsubscribe
        );
        assert_eq!(
            unsubscribe[0].subscription_id.as_str(),
            subscription_id.as_str()
        );
        assert_eq!(evaluator.pipeline_listener_handle_count(), 0);
        let missing_dispatch = evaluator
            .dispatch_pipeline_listener(&JscPipelineListenerDispatchRequest {
                subscription_id,
                context_json: "{\"event\":{\"type\":\"plugin/custom_event\"}}".to_string(),
            })
            .unwrap_err();
        assert_eq!(
            missing_dispatch.code,
            JscEvaluationErrorCode::InvalidPipelineRequest
        );
    }

    #[test]
    fn game_step_pipeline_listener_can_unsubscribe_while_its_owner_waits() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/listener-owner-wait.js",
                r#"
                export default function opening() {
                    return [{
                        uuid: 'intro.listen-and-wait',
                        async run(ctx) {
                            const listener = () => {
                                ctx.pipeline.off('plugin/custom_event', listener);
                            };
                            ctx.pipeline.on('plugin/custom_event', listener);
                            await ctx.engine.waitFor('plugin/release-owner');
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let step = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap()
            .remove(0);

        let waiting = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: step.run_handle_id,
                ctx_json: Some("{\"stepId\":\"intro.listen-and-wait\"}".to_string()),
            })
            .unwrap();
        let pending_wait = waiting.pending_wait.unwrap();
        let subscription_id = waiting.pipeline_subscriptions.unwrap()[0]
            .subscription_id
            .clone();

        let dispatch = evaluator
            .dispatch_pipeline_listener(&JscPipelineListenerDispatchRequest {
                subscription_id: subscription_id.clone(),
                context_json: "{\"event\":{\"type\":\"plugin/custom_event\"}}".to_string(),
            })
            .unwrap();

        assert!(dispatch.ok);
        assert_eq!(dispatch.commands, Some(Vec::new()));
        let changes = dispatch.pipeline_subscriptions.unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].op, JscPipelineSubscriptionOperation::Unsubscribe);
        assert_eq!(
            changes[0].subscription_id.as_str(),
            subscription_id.as_str()
        );
        assert_eq!(evaluator.pipeline_listener_handle_count(), 0);

        let resumed = evaluator
            .resume_game_step_run(&JscGameStepResumeRequest {
                resume_handle_id: pending_wait.resume_handle_id,
                payload_json: None,
            })
            .unwrap();
        assert!(resumed.ok);
        assert!(resumed.pending_wait.is_none());
    }

    #[test]
    fn game_step_pipeline_listener_rejects_pending_continuations() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/pending-listener.js",
                r#"
                export default function opening() {
                    return [{
                        uuid: 'intro.listen',
                        async run(ctx) {
                            ctx.pipeline.on('plugin/custom_event', async () => {
                                await ctx.engine.waitFor('user/advance');
                            });
                        }
                    }];
                }
                "#,
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();
        let subscribe_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.listen\"}".to_string()),
            })
            .unwrap();
        let subscription_id = subscribe_run.pipeline_subscriptions.unwrap()[0]
            .subscription_id
            .clone();

        let error = evaluator
            .dispatch_pipeline_listener(&JscPipelineListenerDispatchRequest {
                subscription_id,
                context_json: "{\"event\":{\"type\":\"plugin/custom_event\"}}".to_string(),
            })
            .unwrap_err();

        assert_eq!(
            error.code,
            JscEvaluationErrorCode::UnsupportedStepContextCommand
        );
        assert!(error.message.contains("pending"));
    }

    #[test]
    fn game_step_helper_import_suspends_and_resumes_same_promise() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id: module_namespace_id.clone(),
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let pending_run = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
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
            .resume_game_step_run(&JscGameStepResumeRequest {
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
            .call_module_export(&JscModuleExportCallRequest {
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
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
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
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
                module_namespace_id,
                export_name: "default".to_string(),
                scope_json: None,
            })
            .unwrap()
            .steps
            .unwrap();

        let error = evaluator
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: Some("{\"stepId\":\"intro.bad-helper\"}".to_string()),
            })
            .unwrap_err();

        assert_eq!(error.code, JscEvaluationErrorCode::StepRunFailed);
        assert!(error.message.contains("promise failed"));
    }

    #[test]
    fn releasing_namespace_drops_game_step_run_handles() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator
            .evaluate_module(&request_for_code(
                "scripts/opening.js",
                "export default function opening() { return [{ uuid: 'intro.1', run() {} }]; }",
            ))
            .unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        let steps = evaluator
            .call_game_step_factory(&JscGameStepFactoryCallRequest {
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
            .call_game_step_run(&JscGameStepRunRequest {
                run_handle_id: steps[0].run_handle_id.clone(),
                ctx_json: None,
            })
            .unwrap_err();
        assert_eq!(missing.code, JscEvaluationErrorCode::MissingRunHandle);
    }

    #[test]
    fn repeated_factory_handles_remain_namespace_owned_until_explicit_release() {
        let mut evaluator = JavaScriptCoreEvaluator::new().unwrap();
        let response = evaluator.evaluate_module(&request_for_code(
            "scripts/repeated.js",
            "export default function opening() { const retained = new Uint8Array(1024); return [{ uuid: 'intro.1', run() { return retained.length; } }]; }",
        )).unwrap();
        let module_namespace_id = response.module_namespace_id.unwrap();
        // Documents the lifetime boundary, not an assertion that factory churn
        // is leak-free. Old Rust handles remain roots until namespace release.
        for expected in 1..=128 {
            evaluator
                .call_game_step_factory(&JscGameStepFactoryCallRequest {
                    module_namespace_id: module_namespace_id.clone(),
                    export_name: "default".into(),
                    scope_json: None,
                })
                .unwrap();
            assert_eq!(evaluator.step_run_handle_count(), expected);
        }
        evaluator.release_module_namespace(&module_namespace_id);
        assert_eq!(evaluator.namespace_count(), 0);
        assert_eq!(evaluator.step_run_handle_count(), 0);
        assert_eq!(evaluator.step_resume_handle_count(), 0);
        assert_eq!(evaluator.pipeline_listener_handle_count(), 0);
    }

    fn exported_string(
        evaluator: &JavaScriptCoreEvaluator,
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
            .with(|_ctx| namespace.get::<_, String>(export_name))
            .unwrap()
    }

    fn exported_call_string(
        evaluator: &mut JavaScriptCoreEvaluator,
        module_namespace_id: &str,
        export_name: &str,
    ) -> String {
        let call = evaluator
            .call_module_export(&JscModuleExportCallRequest {
                module_namespace_id: module_namespace_id.to_string(),
                export_name: export_name.to_string(),
                args_json: None,
            })
            .unwrap();
        serde_json::from_str::<String>(call.value_json.as_deref().unwrap()).unwrap()
    }

    fn request_for_code(asset_name: &str, code: &str) -> JscEvaluationRequest {
        JscEvaluationRequest {
            module: JscRuntimeModuleRecord {
                asset_name: asset_name.to_string(),
                bundle_name: "runtime.chapter.native-ui".to_string(),
                package_id: "runtime.chapter.native-ui".to_string(),
                kind: JscRuntimeModuleKind::Script,
                code: code.to_string(),
                bytes: code.as_bytes().to_vec(),
            },
            module_graph: Vec::new(),
            limits: JscSandboxLimits::default(),
        }
    }
}
