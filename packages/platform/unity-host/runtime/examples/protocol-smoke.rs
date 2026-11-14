//! Executes a generated consumer in the real QuickJS/C ABI. The drawing bridge is
//! a recording fake; this explicitly does not qualify Unity's C# API or rendering.
use quajs_unity_runtime::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::ffi::c_void;
use std::path::PathBuf;

struct Host {
    root: PathBuf,
    reply: Vec<u8>,
    files: HashMap<String, Vec<u8>>,
    ready: bool,
    text: Vec<String>,
    errors: Vec<String>,
    destroyed: bool,
    embedded: bool,
    messages: Vec<Value>,
}

unsafe extern "C" fn bridge(
    user: *mut c_void,
    method: *const u8,
    method_len: usize,
    payload: *const u8,
    payload_len: usize,
    data: *const u8,
    length: usize,
    reply: *mut BridgeReply,
) -> i32 {
    let host = unsafe { &mut *(user as *mut Host) };
    let method =
        unsafe { std::str::from_utf8(std::slice::from_raw_parts(method, method_len)).unwrap() };
    let payload =
        unsafe { std::str::from_utf8(std::slice::from_raw_parts(payload, payload_len)).unwrap() };
    let bytes = unsafe { std::slice::from_raw_parts(data, length) };
    let mut status = 0;
    host.reply = if method == "read_bytes" {
        if let Some(path) = payload.strip_prefix("qua://") {
            std::fs::read(host.root.join(format!("{path}.bytes"))).unwrap()
        } else {
            host.files.get(payload).cloned().unwrap_or_default()
        }
    } else if method == "write_bytes" {
        host.files.insert(payload.to_string(), bytes.to_vec());
        b"true".to_vec()
    } else {
        let args: Value = serde_json::from_str(payload).unwrap();
        let value = match method {
            "embedded_open" => {
                json!({"protocol":"qua-embedded","version":1,"type":"open","sessionId":"quest-42","storageNamespace":"fixture/account","parameters":{"quest":42}})
            }
            "embedded_event" => {
                host.messages.push(args.clone());
                Value::Null
            }
            "quit" => Value::Null,
            "resource_create" if args["kind"] == "sha256" => {
                json!(format!("{:x}", Sha256::digest(bytes)))
            }
            "resource_create" => json!({"id":args["id"],"kind":args["kind"],"width":2,"height":2}),
            "clock" => json!(0),
            "container_size" => json!({"width":640,"height":360}),
            "measure_text" => json!({"width":200,"height":54}),
            "file_exists" => json!(host.files.contains_key(args["path"].as_str().unwrap_or(""))),
            "file_list" => json!([]),
            "ready" => {
                host.ready = true;
                Value::Null
            }
            "node_text" => {
                host.text
                    .push(args["text"].as_str().unwrap_or("").to_string());
                Value::Null
            }
            "startup_error" => {
                host.errors.push(args["message"].to_string());
                Value::Null
            }
            "log" => {
                if args["level"] == "error" {
                    host.errors.push(args["text"].to_string());
                }
                Value::Null
            }
            "destroy" => {
                host.destroyed = true;
                Value::Null
            }
            "node_create" | "node_transform" | "node_box" | "node_sprite" | "node_metadata"
            | "node_control" | "node_visible" | "node_clear" | "node_parent" | "node_destroy"
            | "file_mkdir" | "file_delete" | "file_move" | "frame_rate" | "audio_bus_volume"
            | "resource_release" => Value::Null,
            _ => {
                status = 1;
                host.errors
                    .push(format!("Unsupported protocol operation {method}"));
                Value::Null
            }
        };
        serde_json::to_vec(&json!({"value":value})).unwrap()
    };
    unsafe {
        *reply = BridgeReply {
            data: host.reply.as_ptr(),
            length: host.reply.len(),
        };
    }
    status
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let source = std::fs::read(&args[1]).unwrap();
    let mut host = Host {
        root: PathBuf::from(&args[2]),
        reply: Vec::new(),
        files: HashMap::new(),
        ready: false,
        text: Vec::new(),
        errors: Vec::new(),
        destroyed: false,
        embedded: args.get(3).is_some_and(|value| value == "--embedded"),
        messages: Vec::new(),
    };
    let id = unsafe {
        qua_unity_create(
            source.as_ptr(),
            source.len(),
            Some(bridge),
            (&mut host as *mut Host).cast(),
        )
    };
    assert_ne!(id, 0, "VM creation failed");
    for frame in 0..1000 {
        assert_eq!(
            unsafe { qua_unity_tick(id, frame as f64 * 16.0, b"[]".as_ptr(), 2) },
            1,
            "VM tick failed"
        );
        if (host.ready
            && (!host.embedded
                || host
                    .messages
                    .iter()
                    .any(|message| message["type"] == "result")))
            || !host.errors.is_empty()
        {
            break;
        }
    }
    assert!(host.errors.is_empty(), "Runtime errors: {:?}", host.errors);
    assert!(host.ready, "Generated consumer did not become ready");
    assert!(
        host.text.iter().any(|text| text.contains("Unity fixture")),
        "Engine-owned dialogue was not projected: {:?}",
        host.text
    );
    assert_eq!(qua_unity_shutdown(id), 1);
    for frame in 0..100 {
        if qua_unity_is_closed(id) != 0 {
            break;
        }
        assert_eq!(
            unsafe { qua_unity_tick(id, 16000.0 + frame as f64 * 16.0, b"[]".as_ptr(), 2) },
            1
        );
    }
    assert_eq!(qua_unity_is_closed(id), 1);
    if host.embedded {
        let results: Vec<_> = host
            .messages
            .iter()
            .filter(|message| message["type"] == "result")
            .collect();
        assert_eq!(results.len(), 1, "Exactly one terminal result");
        assert_eq!(results[0]["outcome"]["status"], "completed");
        assert_eq!(results[0]["outcome"]["value"]["quest"], 42);
        assert_eq!(host.messages.last().unwrap()["type"], "closed");
    }
    assert!(host.destroyed, "Native host teardown was not requested");
    assert_eq!(qua_unity_drop(id), 1);
    println!("QUA_UNITY_PROTOCOL_SMOKE_OK ready/dialogue/shutdown; recording bridge, not Unity Editor evidence");
}
