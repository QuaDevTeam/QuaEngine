use std::fmt::{Display, Formatter};
use std::io::{BufRead, Write};

use quajs_native_runtime::quickjs::RquickJsModuleEvaluator;
use quajs_native_runtime::{
    dispatch_native_host_api_request_with_quickjs_registry, InMemoryNativeHostApi,
    NativeHostApiError, NativeHostApiRequest, NativeHostApiResponse,
    QuickJsModuleNamespaceRegistry,
};

use crate::startup::{compile_time_native_app_config, create_native_startup_host_info};

pub const QUICKJS_BRIDGE_ENV: &str = "QUA_NATIVE_QUICKJS_BRIDGE";

#[derive(Debug)]
pub enum NativeQuickJsBridgeError {
    Io(std::io::Error),
    QuickJsInit(String),
    Startup(String),
    Serialize(serde_json::Error),
}

impl Display for NativeQuickJsBridgeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "Native QuickJS bridge I/O failed: {error}."),
            Self::QuickJsInit(message) => {
                write!(
                    formatter,
                    "Native QuickJS bridge initialization failed: {message}."
                )
            }
            Self::Startup(message) => write!(
                formatter,
                "Native QuickJS bridge startup failed: {message}."
            ),
            Self::Serialize(error) => {
                write!(
                    formatter,
                    "Native QuickJS bridge response serialization failed: {error}."
                )
            }
        }
    }
}

impl std::error::Error for NativeQuickJsBridgeError {}

impl From<std::io::Error> for NativeQuickJsBridgeError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for NativeQuickJsBridgeError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialize(error)
    }
}

pub fn is_quickjs_bridge_requested() -> bool {
    match std::env::var_os(QUICKJS_BRIDGE_ENV) {
        Some(value) => {
            let value = value.to_string_lossy();
            value != "0" && !value.is_empty()
        }
        None => false,
    }
}

pub fn run_quickjs_bridge_from_stdio() -> Result<(), NativeQuickJsBridgeError> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    run_quickjs_bridge(stdin.lock(), stdout.lock())
}

pub fn run_quickjs_bridge<R, W>(reader: R, writer: W) -> Result<(), NativeQuickJsBridgeError>
where
    R: BufRead,
    W: Write,
{
    let host_info = create_native_startup_host_info(compile_time_native_app_config(), None)
        .map_err(|error| NativeQuickJsBridgeError::Startup(error.to_string()))?;
    let mut host = InMemoryNativeHostApi::new(host_info);
    let mut quickjs = RquickJsModuleEvaluator::new()
        .map_err(|error| NativeQuickJsBridgeError::QuickJsInit(error.message))?;
    let mut registry = QuickJsModuleNamespaceRegistry::new();

    run_quickjs_bridge_with_host(reader, writer, &mut host, &mut quickjs, &mut registry)
}

fn run_quickjs_bridge_with_host<R, W>(
    reader: R,
    mut writer: W,
    host: &mut InMemoryNativeHostApi,
    quickjs: &mut RquickJsModuleEvaluator,
    registry: &mut QuickJsModuleNamespaceRegistry,
) -> Result<(), NativeQuickJsBridgeError>
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
            Ok(request) => dispatch_native_host_api_request_with_quickjs_registry(
                host, quickjs, registry, request,
            ),
            Err(error) => invalid_request_response(format!(
                "Native QuickJS bridge request must be valid JSON: {error}"
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

    #[test]
    fn quickjs_bridge_dispatches_jsonl_host_info() {
        let mut output = Vec::new();

        run_quickjs_bridge(
            std::io::Cursor::new(b"{\"method\":\"getHostInfo\"}\n"),
            &mut output,
        )
        .expect("quickjs bridge should dispatch host info");

        let response: serde_json::Value = serde_json::from_slice(&output).expect("response parses");
        assert_eq!(response["ok"], true);
        assert_eq!(response["payload"]["type"], "hostInfo");
        assert!(response["payload"]["value"]["runtime"]["quickjsVersion"]
            .as_str()
            .unwrap()
            .contains("rquickjs"));
    }

    #[test]
    fn quickjs_bridge_reports_invalid_json_requests() {
        let mut output = Vec::new();

        run_quickjs_bridge(std::io::Cursor::new(b"{not-json}\n"), &mut output)
            .expect("quickjs bridge should keep serving after invalid requests");

        let response: serde_json::Value = serde_json::from_slice(&output).expect("response parses");
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "invalidRequest");
        assert!(response["error"]["message"]
            .as_str()
            .unwrap()
            .contains("valid JSON"));
    }
}
