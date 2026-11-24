use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const MAX_BYTES: usize = 64 * 1024 * 1024;

pub(super) fn directory() -> Option<PathBuf> {
    #[cfg(target_os = "android")]
    return crate::android_activity::private_data_directory().map(|dir| dir.join("qua-store"));
    #[cfg(not(target_os = "android"))]
    {
        #[cfg(any(target_os = "ios", target_os = "macos"))]
        let root = PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support");
        #[cfg(target_os = "windows")]
        let root = PathBuf::from(std::env::var_os("LOCALAPPDATA")?);
        #[cfg(not(any(target_os = "windows", target_os = "ios", target_os = "macos")))]
        let root = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| Some(PathBuf::from(std::env::var_os("HOME")?).join(".local/share")))?;
        Some(
            root.join(crate::startup::compile_time_native_app_config().bundle_id)
                .join("qua-store"),
        )
    }
}

/// All keys, including slot indexes and their payloads, share one atomic commit.
/// The advisory lock is released by the OS even when a mobile process is killed.
pub(super) struct ProductStorage {
    records: BTreeMap<String, String>,
    directory: PathBuf,
    _lock: File,
}

impl ProductStorage {
    pub(super) fn open(directory: &Path) -> io::Result<Self> {
        fs::create_dir_all(directory)?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join("product.lock"))?;
        lock.try_lock().map_err(io::Error::from)?;
        let records = match File::open(directory.join("records.json")) {
            Ok(file) => {
                if file.metadata()?.len() > MAX_BYTES as u64 {
                    return Err(io::Error::other("Product storage exceeds 64 MiB"));
                }
                serde_json::from_reader(io::BufReader::new(file))?
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => BTreeMap::new(),
            Err(error) => return Err(error),
        };
        Ok(Self {
            records,
            directory: directory.to_owned(),
            _lock: lock,
        })
    }

    pub(super) fn call(
        &mut self,
        op: &str,
        key: &str,
        value: Option<&str>,
    ) -> Result<String, String> {
        if key.len() > 4096 || (key.is_empty() && !matches!(op, "list" | "batch")) {
            return Err("Invalid product storage key".into());
        }
        let changes = match (op, value) {
            ("list", None) => {
                let keys: Vec<_> = self
                    .records
                    .range(key.to_owned()..)
                    .map(|(id, _)| id)
                    .take_while(|id| id.starts_with(key))
                    .collect();
                return serde_json::to_string(&keys).map_err(|e| e.to_string());
            }
            ("read", None) => {
                return serde_json::to_string(&self.records.get(key)).map_err(|e| e.to_string())
            }
            ("delete", None) => vec![(key.to_owned(), None)],
            ("write", Some(text)) if text.len() <= MAX_BYTES => {
                vec![(key.to_owned(), Some(text.to_owned()))]
            }
            ("batch", Some(json)) if key.is_empty() && json.len() <= MAX_BYTES => {
                serde_json::from_str::<Vec<(String, Option<String>)>>(json)
                    .map_err(|e| e.to_string())?
            }
            _ => return Err("Invalid product storage operation or value size".into()),
        };
        let mut next = self.records.clone();
        for (key, value) in changes {
            if key.is_empty() || key.len() > 4096 {
                return Err("Invalid product storage key".into());
            }
            match value {
                Some(text) => {
                    next.insert(key, text);
                }
                None => {
                    next.remove(&key);
                }
            }
        }
        if next != self.records {
            let bytes = serde_json::to_vec(&next).map_err(|e| e.to_string())?;
            if bytes.len() > MAX_BYTES {
                return Err("Product storage exceeds 64 MiB".into());
            }
            let temp = self.directory.join("records.pending");
            let mut file = File::create(&temp).map_err(|e| e.to_string())?;
            file.write_all(&bytes)
                .and_then(|()| file.sync_all())
                .map_err(|e| e.to_string())?;
            drop(file);
            fs::rename(temp, self.directory.join("records.json")).map_err(|e| e.to_string())?;
            self.records = next;
            #[cfg(unix)]
            File::open(&self.directory)
                .and_then(|dir| dir.sync_all())
                .map_err(|e| e.to_string())?;
        }
        Ok("null".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn slots_survive_reopen_and_failed_batch_preserves_old_records() {
        let directory =
            std::env::temp_dir().join(format!("qua-product-storage-{}", std::process::id()));
        let mut storage = ProductStorage::open(&directory).unwrap();
        assert!(ProductStorage::open(&directory).is_err());
        storage
            .call(
                "batch",
                "",
                Some(r#"[["slots/1","青叶市"],["slots/index","1"]]"#),
            )
            .unwrap();
        assert!(storage
            .call("batch", "", Some(r#"[["slots/1",null],["","bad"]]"#))
            .is_err());
        drop(storage);
        let mut storage = ProductStorage::open(&directory).unwrap();
        assert_eq!(
            storage.call("list", "slots/", None).unwrap(),
            r#"["slots/1","slots/index"]"#
        );
        assert_eq!(
            storage.call("read", "slots/1", None).unwrap(),
            r#""青叶市""#
        );
        storage.call("delete", "slots/1", None).unwrap();
        assert_eq!(storage.call("read", "slots/1", None).unwrap(), "null");
        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }
}
