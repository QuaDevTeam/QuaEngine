//! Durable records. Failed exclusive creation must never delete a recovery file.
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

pub(super) fn write_records(
    file: &Path,
    records: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(records).map_err(|error| error.to_string())?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("Storage exceeds 64 MiB".into());
    }
    let temporary = file.with_extension("pending");
    let mut created = false;
    let result = (|| -> std::io::Result<()> {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        created = true;
        output.write_all(&bytes)?;
        output.sync_all()?;
        fs::rename(&temporary, file)?;
        fs::File::open(
            file.parent()
                .ok_or_else(|| std::io::Error::other("Storage file has no parent"))?,
        )?
        .sync_all()
    })();
    if created && result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Directory(std::path::PathBuf);
    impl Directory {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "qua-storage-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn preserves_existing_recovery_file_and_previous_records() {
        let directory = Directory::new();
        let file = directory.0.join("records.json");
        let recovery = file.with_extension("pending");
        fs::write(&file, b"previous").unwrap();
        fs::write(&recovery, b"recover me").unwrap();
        assert!(write_records(&file, &BTreeMap::new()).is_err());
        assert_eq!(fs::read(&file).unwrap(), b"previous");
        assert_eq!(fs::read(&recovery).unwrap(), b"recover me");
    }
    #[test]
    fn removes_only_its_own_failed_write_and_commits_successfully() {
        let directory = Directory::new();
        let file = directory.0.join("records.json");
        fs::create_dir(&file).unwrap();
        assert!(write_records(&file, &BTreeMap::new()).is_err());
        assert!(!file.with_extension("pending").exists());
        fs::remove_dir(&file).unwrap();
        let records = BTreeMap::from([("save".into(), b"ok".to_vec())]);
        write_records(&file, &records).unwrap();
        assert_eq!(
            serde_json::from_slice::<BTreeMap<String, Vec<u8>>>(&fs::read(&file).unwrap()).unwrap(),
            records
        );
    }
}
