use sha2::{Digest, Sha256};

use super::RendererCapability;

pub fn capability_manifest_hash(capabilities: &[RendererCapability]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(stable_capability_manifest_payload(capabilities).as_bytes());
    format!("sha256:{}", hex_lower(&hasher.finalize()))
}

fn stable_capability_manifest_payload(capabilities: &[RendererCapability]) -> String {
    let mut payload = String::from("[");
    for (index, capability) in capabilities.iter().enumerate() {
        if index > 0 {
            payload.push(',');
        }
        payload.push('{');
        push_json_field(&mut payload, "id", &capability.id, true);
        push_json_field(&mut payload, "target", &capability.target, false);
        push_json_field(&mut payload, "version", &capability.version, false);
        push_json_field(
            &mut payload,
            "ownerPackage",
            &capability.owner_package,
            false,
        );
        push_json_array_field(&mut payload, "projectionKeys", &capability.projection_keys);
        push_json_array_field(&mut payload, "intentEvents", &capability.intent_events);
        push_json_array_field(&mut payload, "assetKinds", &capability.asset_kinds);
        push_json_array_field(&mut payload, "qssFeatures", &capability.qss_features);
        push_json_array_field(&mut payload, "quiComponents", &capability.qui_components);
        push_json_field(&mut payload, "fallback", &capability.fallback, false);
        payload.push('}');
    }
    payload.push(']');
    payload
}

fn push_json_field(payload: &mut String, key: &str, value: &str, first: bool) {
    if !first {
        payload.push(',');
    }
    push_json_string(payload, key);
    payload.push(':');
    push_json_string(payload, value);
}

fn push_json_array_field(payload: &mut String, key: &str, values: &[String]) {
    payload.push(',');
    push_json_string(payload, key);
    payload.push_str(":[");
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            payload.push(',');
        }
        push_json_string(payload, value);
    }
    payload.push(']');
}

fn push_json_string(payload: &mut String, value: &str) {
    payload.push('"');
    for char in value.chars() {
        match char {
            '"' => payload.push_str("\\\""),
            '\\' => payload.push_str("\\\\"),
            '\n' => payload.push_str("\\n"),
            '\r' => payload.push_str("\\r"),
            '\t' => payload.push_str("\\t"),
            char if char.is_control() => {
                payload.push_str("\\u");
                payload.push_str(&format!("{:04x}", char as u32));
            }
            char => payload.push(char),
        }
    }
    payload.push('"');
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
