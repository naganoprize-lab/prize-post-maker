use std::{fs::File, io::{self, Read}, path::Path};
const LIMIT: u64 = 20 * 1024 * 1024;
pub fn read(path: &Path) -> io::Result<Vec<u8>> {
    let ext = path.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase();
    if ext != "xlsm" && ext != "xlsx" { return Err(io::Error::new(io::ErrorKind::InvalidInput, ".xlsm または .xlsx を選択してください")); }
    let file = File::open(path).map_err(|e| io::Error::new(e.kind(), "元ファイルを開けません。移動・削除・アクセス権を確認し、再選択してください"))?;
    let meta = file.metadata()?;
    if !meta.is_file() || meta.len() > LIMIT { return Err(io::Error::new(io::ErrorKind::InvalidData, "Excelは20MB以下の通常ファイルを選択してください")); }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > LIMIT { return Err(io::Error::new(io::ErrorKind::InvalidData, "Excelファイルが20MBを超えています")); }
    Ok(bytes)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn read_only_extension_and_missing_file() {
        let dir = std::env::temp_dir().join(format!("ppm-excel-{}",std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path=dir.join("test.xlsm");
        std::fs::write(&path,b"fixture").unwrap();
        assert_eq!(read(&path).unwrap(),b"fixture");
        assert_eq!(std::fs::read(&path).unwrap(),b"fixture");
        assert!(read(&dir.join("test.txt")).is_err());
        assert!(read(&dir.join("missing.xlsx")).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
