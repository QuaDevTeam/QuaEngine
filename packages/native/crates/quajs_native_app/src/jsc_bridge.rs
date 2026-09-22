use std::fmt::{Display, Formatter};
use std::io::{BufRead, Write};

use quajs_native_runtime::jsc::JavaScriptCoreEvaluator;
use quajs_native_runtime::{
    dispatch_native_host_api_request_with_jsc_registry, InMemoryNativeHostApi,
    JscModuleNamespaceRegistry, NativeHostApiError, NativeHostApiRequest, NativeHostApiResponse,
};

use crate::startup::{compile_time_native_app_config, create_native_startup_host_info};
use crate::target_bundle::{load_native_target_bundle_manifest, NativeTargetBundleManifest};

pub const JSC_BRIDGE_ENV: &str = "QUA_NATIVE_JSC_BRIDGE";

#[derive(Debug)]
pub enum NativeJscBridgeError {
    Io(std::io::Error),
    JscInit(String),
    Startup(String),
    Serialize(serde_json::Error),
}

impl Display for NativeJscBridgeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(
                formatter,
                "Native JavaScriptCore bridge I/O failed: {error}."
            ),
            Self::JscInit(message) => {
                write!(
                    formatter,
                    "Native JavaScriptCore bridge initialization failed: {message}."
                )
            }
            Self::Startup(message) => write!(
                formatter,
                "Native JavaScriptCore bridge startup failed: {message}."
            ),
            Self::Serialize(error) => {
                write!(
                    formatter,
                    "Native JavaScriptCore bridge response serialization failed: {error}."
                )
            }
        }
    }
}

impl std::error::Error for NativeJscBridgeError {}

impl From<std::io::Error> for NativeJscBridgeError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for NativeJscBridgeError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialize(error)
    }
}

pub fn is_jsc_bridge_requested() -> bool {
    match std::env::var_os(JSC_BRIDGE_ENV) {
        Some(value) => {
            let value = value.to_string_lossy();
            value != "0" && !value.is_empty()
        }
        None => false,
    }
}

pub fn run_jsc_bridge_from_stdio() -> Result<(), NativeJscBridgeError> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let target_bundle_manifest = load_jsc_bridge_target_bundle_manifest_from_env()?;
    run_jsc_bridge_with_target_bundle_manifest(
        stdin.lock(),
        stdout.lock(),
        target_bundle_manifest.as_ref(),
    )
}

#[cfg(test)]
pub fn run_jsc_bridge<R, W>(reader: R, writer: W) -> Result<(), NativeJscBridgeError>
where
    R: BufRead,
    W: Write,
{
    run_jsc_bridge_with_target_bundle_manifest(reader, writer, None)
}

fn run_jsc_bridge_with_target_bundle_manifest<R, W>(
    reader: R,
    writer: W,
    target_bundle_manifest: Option<&NativeTargetBundleManifest>,
) -> Result<(), NativeJscBridgeError>
where
    R: BufRead,
    W: Write,
{
    let host_info =
        create_native_startup_host_info(compile_time_native_app_config(), target_bundle_manifest)
            .map_err(|error| NativeJscBridgeError::Startup(error.to_string()))?;
    let mut host = InMemoryNativeHostApi::new(host_info);
    let mut jsc = JavaScriptCoreEvaluator::new()
        .map_err(|error| NativeJscBridgeError::JscInit(error.message))?;
    let mut registry = JscModuleNamespaceRegistry::new();

    run_jsc_bridge_with_host(reader, writer, &mut host, &mut jsc, &mut registry)
}

fn load_jsc_bridge_target_bundle_manifest_from_env(
) -> Result<Option<NativeTargetBundleManifest>, NativeJscBridgeError> {
    std::env::var_os("QUA_NATIVE_TARGET_BUNDLE_MANIFEST")
        .map(load_native_target_bundle_manifest)
        .transpose()
        .map_err(|error| NativeJscBridgeError::Startup(error.to_string()))
}

fn run_jsc_bridge_with_host<R, W>(
    reader: R,
    mut writer: W,
    host: &mut InMemoryNativeHostApi,
    jsc: &mut JavaScriptCoreEvaluator,
    registry: &mut JscModuleNamespaceRegistry,
) -> Result<(), NativeJscBridgeError>
where
    R: BufRead,
    W: Write,
{
    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<NativeHostApiRequest>(&line) {
            Ok(request) => {
                dispatch_native_host_api_request_with_jsc_registry(host, jsc, registry, request)
            }
            Err(error) => invalid_request_response(format!(
                "Native JavaScriptCore bridge request must be valid JSON: {error}"
            )),
        };
        serde_json::to_writer(&mut writer, &response)?;
        writer.write_all(b"\n")?;
        writer.flush()?;
    }

    Ok(())
}

fn invalid_request_response(message: String) -> NativeHostApiResponse {
    NativeHostApiResponse::error(NativeHostApiError::InvalidRequest(message).to_info())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn native_manifest_for_compile_time_config() -> NativeTargetBundleManifest {
        let mut manifest = crate::target_bundle::tests::native_manifest();
        let config = compile_time_native_app_config();
        let app = manifest.app.as_mut().expect("native app metadata exists");
        app.bundle_id = Some(config.bundle_id);
        app.version = Some(config.version);
        app.build_number = Some(config.build_number);
        manifest
    }

    #[test]
    fn jsc_bridge_dispatches_jsonl_host_info() {
        let mut output = Vec::new();

        run_jsc_bridge(
            std::io::Cursor::new(b"{\"method\":\"getHostInfo\"}\n"),
            &mut output,
        )
        .expect("jsc bridge should dispatch host info");

        let response: serde_json::Value = serde_json::from_slice(&output).expect("response parses");
        assert_eq!(response["ok"], true);
        assert_eq!(response["payload"]["type"], "hostInfo");
        assert!(response["payload"]["value"]["runtime"]["jscVersion"]
            .as_str()
            .unwrap()
            .contains("javascriptcore"));
    }

    #[test]
    fn jsc_bridge_reports_invalid_json_requests() {
        let mut output = Vec::new();

        run_jsc_bridge(std::io::Cursor::new(b"{not-json}\n"), &mut output)
            .expect("jsc bridge should keep serving after invalid requests");

        let response: serde_json::Value = serde_json::from_slice(&output).expect("response parses");
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "invalidRequest");
        assert!(response["error"]["message"]
            .as_str()
            .unwrap()
            .contains("valid JSON"));
    }

    #[test]
    fn jsc_bridge_validates_target_bundle_manifest_before_serving() {
        let mut output = Vec::new();
        let mut manifest = native_manifest_for_compile_time_config();
        manifest
            .native_runtime
            .as_mut()
            .expect("native runtime metadata exists")
            .jsc_version = Some("stale-jsc".to_string());

        let error = run_jsc_bridge_with_target_bundle_manifest(
            std::io::Cursor::new(b"{\"method\":\"getHostInfo\"}\n"),
            &mut output,
            Some(&manifest),
        )
        .expect_err("stale target bundle manifest should block JavaScriptCore bridge startup");

        assert!(output.is_empty());
        assert!(error
            .to_string()
            .contains("nativeRuntime.jscVersion \"stale-jsc\""));
    }
}
