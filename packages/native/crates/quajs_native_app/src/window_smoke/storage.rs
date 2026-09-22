//! Read-only native host diagnostics. Never treats source paths as storage paths.
use quajs_native_runtime::{InMemoryNativeHostApi, NativeHostApi};
use serde_json::{json, Value};

fn text_prefix(bytes: &[u8], limit: usize) -> Option<&str> {
    let sample = &bytes[..bytes.len().min(limit)];
    let text = match std::str::from_utf8(sample) {
        Ok(text) => text,
        Err(error) if bytes.len() > sample.len() && error.error_len().is_none() => {
            std::str::from_utf8(&sample[..error.valid_up_to()]).ok()?
        }
        Err(_) => return None,
    };
    (!text.contains('\0')).then_some(text)
}

pub(super) fn inspect(host: &InMemoryNativeHostApi, request: &Value) -> Result<Value, String> {
    let action = request["action"].as_str().unwrap_or_default();
    let source = request["source"].as_str().unwrap_or_default();
    let offset = match request.get("offset") {
        Some(value) => value.as_u64().ok_or("Invalid storage offset")?,
        None => 0,
    };
    let filter = request["filter"].as_str().unwrap_or_default();
    if offset > 100000 || filter.len() > 1024 || source.len() > 4096 {
        return Err("Storage query exceeds limits".into());
    }
    if action == "catalog" {
        return Ok(json!({ "sources": [
            { "id": "native:storage", "group": "Native Host", "label": "存储记录", "description": "InMemoryNativeHostApi · 会话内存；按完整命名空间 Key 查看存档、配置或资源缓存" },
            { "id": "native:bundles", "group": "QPK 资源", "label": "已挂载包", "description": "当前 Host 实际挂载的 QPK、版本、哈希与 Runtime Package 来源" },
            { "id": "native:assets", "group": "QPK 资源", "label": "驻留资源", "description": "Host 内存 · 本次会话" }
        ] }));
    }
    if !["page", "detail"].contains(&action) {
        return Err("Invalid storage operation".into());
    }
    let key = request["key"].as_str().unwrap_or_default();
    if key.len() > 4096 {
        return Err("Storage key exceeds limit".into());
    }
    if source == "native:bundles" {
        let bundles = host
            .list_mounted_bundles()
            .map_err(|error| format!("{error:?}"))?;
        if action == "detail" {
            let bundle = bundles
                .iter()
                .find(|bundle| bundle.name == key)
                .ok_or("Bundle no longer exists")?;
            return Ok(
                json!({ "detail": { "text": serde_json::to_string_pretty(bundle).unwrap(), "format": "json", "truncated": false } }),
            );
        }
        let filtered: Vec<_> = bundles
            .iter()
            .filter(|bundle| bundle.name.contains(filter))
            .collect();
        return Ok(
            json!({ "columns": ["包", "版本", "逻辑包", "Runtime Package"], "total": filtered.len(), "hasMore": filtered.len() > offset as usize + 50,
            "rows": filtered.iter().skip(offset as usize).take(50).map(|bundle| json!({"key":bundle.name,"cells":[bundle.name,bundle.version.map(|v|v.to_string()).unwrap_or_default(),bundle.logical_name.clone().unwrap_or_default(),bundle.runtime_package_id.clone().unwrap_or_default()]})).collect::<Vec<_>>() }),
        );
    }
    let entries: Box<dyn Iterator<Item = (&str, &[u8])> + '_> = match source {
        "native:assets" => Box::new(host.inspect_assets()),
        "native:storage" => Box::new(host.inspect_storage()),
        _ => return Err("Unknown native storage source".into()),
    };
    if action == "detail" {
        let (_, bytes) = entries
            .into_iter()
            .find(|(name, _)| *name == key)
            .ok_or("Record no longer exists")?;
        let sample = &bytes[..bytes.len().min(32000)];
        let (text, format) = match text_prefix(bytes, 32000) {
            Some(text) => (text.to_string(), "text"),
            _ => (
                sample
                    .iter()
                    .take(4096)
                    .map(|byte| format!("{byte:02x} "))
                    .collect::<String>(),
                "hex",
            ),
        };
        return Ok(
            json!({"detail":{"text":text,"format":format,"bytes":bytes.len(),"truncated":bytes.len()>if format=="hex" {4096} else {32000}}}),
        );
    }
    let mut matches = entries
        .filter(|(key, _)| key.contains(filter))
        .skip(offset as usize);
    let rows: Vec<_> = matches
        .by_ref()
        .take(50)
        .map(|(key, bytes)| {
            let encoding = if text_prefix(bytes, 256).is_some() {
                "UTF-8"
            } else {
                "binary"
            };
            let format = if source == "native:assets" {
                key.rsplit_once('.')
                    .map(|(_, extension)| extension)
                    .unwrap_or(encoding)
            } else {
                encoding
            };
            json!({"key":key,"cells":[key,bytes.len().to_string(),format],"resident":source=="native:assets"})
        })
        .collect();
    Ok(
        json!({ "columns": [if source=="native:assets" {"资源路径"} else {"命名空间 / Key"}, "字节", "格式"], "rows": rows, "hasMore": matches.next().is_some(), "note": "Host 会话内存 · 只读 · 文本最多 32 KB，二进制最多 4 KB" }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use quajs_native_runtime::NativeHostInfoBuilder;

    #[test]
    fn storage_inspection_pages_real_bytes_without_mutating_them() {
        let mut host =
            InMemoryNativeHostApi::new(NativeHostInfoBuilder::new("test", "dev.test").build())
                .with_asset("assets/images/a.bin", vec![0; 100000]);
        for index in 0..60 {
            host.write_storage(&format!("profile/{index:03}"), b"{\"value\":1}".to_vec())
                .unwrap();
        }
        let page = inspect(&host, &json!({"action":"page","source":"native:storage"})).unwrap();
        assert_eq!(page["rows"].as_array().unwrap().len(), 50);
        assert_eq!(page["hasMore"], true);
        assert_eq!(page["rows"][0]["resident"], false);
        let resources = inspect(&host, &json!({"action":"page","source":"native:assets"})).unwrap();
        assert_eq!(resources["rows"][0]["resident"], true);
        let page = inspect(
            &host,
            &json!({"action":"page","source":"native:storage","offset":50}),
        )
        .unwrap();
        assert_eq!(page["rows"].as_array().unwrap().len(), 10);
        let value = inspect(
            &host,
            &json!({"action":"detail","source":"native:assets","key":"assets/images/a.bin"}),
        )
        .unwrap();
        assert_eq!(value["detail"]["bytes"], 100000);
        assert_eq!(value["detail"]["format"], "hex");
        assert_eq!(value["detail"]["truncated"], true);
        host.write_storage("unicode", "存".repeat(11000).into_bytes())
            .unwrap();
        let unicode = inspect(
            &host,
            &json!({"action":"detail","source":"native:storage","key":"unicode"}),
        )
        .unwrap();
        assert_eq!(unicode["detail"]["format"], "text");
        assert_eq!(unicode["detail"]["bytes"], 33000);
        assert_eq!(unicode["detail"]["truncated"], true);
        assert!(unicode["detail"]["text"].as_str().unwrap().ends_with('存'));
        assert_eq!(
            host.read_storage("profile/000").unwrap().unwrap(),
            b"{\"value\":1}"
        );
        assert!(inspect(&host, &json!({"action":"delete","source":"native:storage"})).is_err());
        assert!(inspect(
            &host,
            &json!({"action":"detail","source":"native:assets","key":"../../etc/passwd"})
        )
        .is_err());
    }
}
