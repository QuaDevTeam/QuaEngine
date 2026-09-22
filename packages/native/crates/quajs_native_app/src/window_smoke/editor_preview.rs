//! Authenticated compositor metadata only. Pixels never cross the editor IPC.
use serde_json::{json, Value};
use std::io::Write;
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

static SURFACE: Mutex<Option<Value>> = Mutex::new(None);

pub(crate) fn enabled() -> bool {
    !crate::packaged_app::enabled() && std::env::var("QUA_NATIVE_EDITOR_PREVIEW").as_deref() == Ok("1")
        && std::env::var("QUA_NATIVE_EDITOR_TOKEN").is_ok_and(|token| !token.is_empty())
}

#[cfg(target_os = "macos")]
pub(super) fn publish_surface(context_id: u32, width: f64, height: f64) {
    *SURFACE.lock().unwrap() = Some(json!({
        "protocolVersion": 2,
        "surface": { "kind": "ca-context", "contextId": context_id, "width": width, "height": height },
        "input": ["pointer"],
    }));
}

#[cfg(target_os = "macos")]
pub(super) fn clear_surface() {
    *SURFACE.lock().unwrap() = None;
}

pub(super) fn serve(mut stream: TcpStream, head: &str, path: &str) {
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let expected = std::env::var("QUA_NATIVE_EDITOR_TOKEN").unwrap_or_default();
    let (status, body) = response(
        head,
        path,
        enabled().then_some(expected.as_str()),
        SURFACE.lock().unwrap().clone(),
    );
    let bytes = body.to_string();
    let head = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", bytes.len());
    if stream.write_all(head.as_bytes()).is_ok() {
        let _ = stream.write_all(bytes.as_bytes());
    }
}

fn response(
    head: &str,
    path: &str,
    expected: Option<&str>,
    surface: Option<Value>,
) -> (&'static str, Value) {
    let authorized = head.lines().any(|line| {
        line.split_once(':').is_some_and(|(name, value)| {
            name.eq_ignore_ascii_case("authorization")
                && expected.is_some_and(|token| {
                    !token.is_empty() && value.trim() == format!("Bearer {token}")
                })
        })
    });
    if !authorized {
        (
            "401 Unauthorized",
            json!({ "error": "Editor preview is not authorized" }),
        )
    } else if path != "/qua/preview" {
        (
            "404 Not Found",
            json!({ "error": "Unknown editor endpoint" }),
        )
    } else if let Some(surface) = surface {
        ("200 OK", surface)
    } else {
        (
            "503 Service Unavailable",
            json!({ "error": "Native compositor surface is not ready" }),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_preview_requires_current_token_and_never_serves_frames() {
        let surface =
            json!({ "protocolVersion": 2, "surface": { "kind": "ca-context", "contextId": 42 } });
        let head = "GET /qua/preview HTTP/1.1\r\nAuthorization: Bearer current\r\n";
        for token in [None, Some(""), Some("previous")] {
            assert_eq!(
                response(head, "/qua/preview", token, Some(surface.clone())).0,
                "401 Unauthorized"
            );
        }
        assert_eq!(
            response(head, "/qua/preview", Some("current"), None).0,
            "503 Service Unavailable"
        );
        assert_eq!(
            response(
                head,
                "/qua/preview/frame",
                Some("current"),
                Some(surface.clone())
            )
            .0,
            "404 Not Found"
        );
        assert_eq!(
            response(head, "/qua/preview", Some("current"), Some(surface.clone())),
            ("200 OK", surface)
        );
    }
}
