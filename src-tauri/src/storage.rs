use std::{fs, io, path::Path};
const LIMIT: u64 = 16 * 1024 * 1024;
fn validate(data: &str) -> io::Result<()> {
    if data.len() as u64 > LIMIT { return Err(io::Error::new(io::ErrorKind::InvalidData, "保存データが16MBを超えています")); }
    let value: serde_json::Value = serde_json::from_str(data)?;
    if value["version"] != 1 || !value["products"].is_array() || !value["templates"].is_array() || !value["history"].is_array() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "保存データの形式が不正です"));
    }
    Ok(())
}
pub fn load(dir: &Path) -> io::Result<Option<String>> {
    let path = dir.join("data.json");
    match fs::metadata(&path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
        Ok(meta) if meta.len() > LIMIT => return Err(io::Error::new(io::ErrorKind::InvalidData, "保存データが大きすぎます")),
        _ => {}
    }
    let data = fs::read_to_string(path)?;
    validate(&data)?;
    Ok(Some(data))
}
pub fn save(dir: &Path, data: &str) -> io::Result<()> {
    validate(data)?;
    fs::create_dir_all(dir)?;
    let path = dir.join("data.json");
    let temp = dir.join("data.json.tmp");
    // 壊れた既存データを上書きしない。
    if path.exists() { load(dir)?; }
    use io::Write;
    let mut file = fs::File::create(&temp)?;
    file.write_all(data.as_bytes())?;
    file.sync_all()?;
    drop(file);
    if path.exists() { fs::copy(&path, dir.join("data.json.bak"))?; }
    fs::rename(temp, path)?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_backup_and_corruption_protection() {
        let dir = std::env::temp_dir().join(format!("ppm-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert!(load(&dir).unwrap().is_none());
        let a = r#"{"version":1,"products":[],"templates":[],"history":[]}"#;
        save(&dir, a).unwrap();
        save(&dir, a).unwrap();
        assert_eq!(load(&dir).unwrap().unwrap(), a);
        assert_eq!(fs::read_to_string(dir.join("data.json.bak")).unwrap(), a);
        assert!(save(&dir, "{}").is_err());
        fs::write(dir.join("data.json"), "broken").unwrap();
        assert!(save(&dir, a).is_err());
        assert_eq!(fs::read_to_string(dir.join("data.json")).unwrap(), "broken");
        fs::remove_dir_all(dir).unwrap();
    }
}
