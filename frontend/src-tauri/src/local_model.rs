// SOTTOLY: ¿está descargado y válido el modelo local X? Archivo nuevo.
//
// Meetily valida por tamaño (±10 % de `size_mb`) y descarga directo al archivo
// final, así que una descarga cortada al 95 % pasa. Aquí se lee el encabezado
// GGUF y la tabla de tensores para calcular el tamaño exacto que debe tener el
// archivo, sin red. La App lo usará para decirle al Usuario si ya tiene el
// modelo o si debe descargarlo (de nuevo).

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Metadatos del GGUF que sirven para identificar el modelo.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GgufInfo {
    /// Versión del formato GGUF (2 o 3).
    pub version: u32,
    pub architecture: Option<String>,
    /// `general.name`, p. ej. "Qwen3.5-4B".
    pub name: Option<String>,
    /// `general.file_type` (cuantización según llama.cpp, p. ej. 15 = Q4_K_M).
    pub file_type: Option<u32>,
    pub tensor_count: u64,
    /// Tamaño mínimo que debe tener el archivo para contener todos los tensores.
    pub expected_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum LocalModelStatus {
    /// Descargado y completo.
    Ready { path: PathBuf, size_bytes: u64, gguf: GgufInfo },
    /// No hay archivo: hay que descargarlo.
    Missing { path: PathBuf },
    /// Descarga cortada: hay que descargarlo de nuevo.
    Incomplete { path: PathBuf, size_bytes: u64, expected_bytes: Option<u64> },
    /// El archivo existe pero no es un GGUF válido de este modelo.
    Invalid { path: PathBuf, reason: String },
    /// El nombre no está en el catálogo de Meetily (`summary_engine::models`).
    UnknownModel { name: String },
}

impl LocalModelStatus {
    pub fn is_ready(&self) -> bool {
        matches!(self, LocalModelStatus::Ready { .. })
    }
}

/// Estado del modelo `name` (p. ej. "qwen3.5:4b") dentro de `models_dir`.
pub fn check_local_model(models_dir: &Path, name: &str) -> LocalModelStatus {
    todo!("{} {name}", models_dir.display())
}

/// Lee el encabezado GGUF y calcula el tamaño esperado del archivo.
pub fn inspect_gguf(path: &Path) -> Result<GgufInfo, GgufError> {
    todo!("{}", path.display())
}

#[derive(Debug, Clone, PartialEq)]
pub enum GgufError {
    /// El archivo se acaba antes de terminar el encabezado.
    Truncated,
    Invalid(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Escritor mínimo de GGUF v3 para las pruebas.
    struct Gguf {
        kvs: Vec<u8>,
        kv_count: u64,
        tensors: Vec<(String, Vec<u64>, u32, usize)>, // nombre, dims, tipo ggml, bytes de datos
    }

    impl Gguf {
        fn new() -> Self {
            Gguf { kvs: vec![], kv_count: 0, tensors: vec![] }
        }
        fn str_(buf: &mut Vec<u8>, s: &str) {
            buf.extend((s.len() as u64).to_le_bytes());
            buf.extend(s.as_bytes());
        }
        fn kv_string(mut self, k: &str, v: &str) -> Self {
            Self::str_(&mut self.kvs, k);
            self.kvs.extend(8u32.to_le_bytes());
            Self::str_(&mut self.kvs, v);
            self.kv_count += 1;
            self
        }
        fn kv_u32(mut self, k: &str, v: u32) -> Self {
            Self::str_(&mut self.kvs, k);
            self.kvs.extend(4u32.to_le_bytes());
            self.kvs.extend(v.to_le_bytes());
            self.kv_count += 1;
            self
        }
        fn kv_string_array(mut self, k: &str, items: &[&str]) -> Self {
            Self::str_(&mut self.kvs, k);
            self.kvs.extend(9u32.to_le_bytes());
            self.kvs.extend(8u32.to_le_bytes());
            self.kvs.extend((items.len() as u64).to_le_bytes());
            for i in items {
                Self::str_(&mut self.kvs, i);
            }
            self.kv_count += 1;
            self
        }
        /// F32 (tipo 0): 4 bytes por elemento. Q8_0 (tipo 8): 34 bytes por bloque de 32.
        fn tensor(mut self, name: &str, dims: &[u64], ggml_type: u32) -> Self {
            let n: u64 = dims.iter().product();
            let bytes = match ggml_type {
                0 => n * 4,
                8 => n / 32 * 34,
                _ => unreachable!(),
            } as usize;
            self.tensors.push((name.into(), dims.to_vec(), ggml_type, bytes));
            self
        }
        fn bytes(&self) -> Vec<u8> {
            let align = 32usize;
            let up = |x: usize| x.div_ceil(align) * align;
            let mut b = b"GGUF".to_vec();
            b.extend(3u32.to_le_bytes());
            b.extend((self.tensors.len() as u64).to_le_bytes());
            b.extend(self.kv_count.to_le_bytes());
            b.extend(&self.kvs);
            let mut offset = 0usize;
            for (name, dims, t, size) in &self.tensors {
                Self::str_(&mut b, name);
                b.extend((dims.len() as u32).to_le_bytes());
                for d in dims {
                    b.extend(d.to_le_bytes());
                }
                b.extend(t.to_le_bytes());
                b.extend((offset as u64).to_le_bytes());
                offset = up(offset + size);
            }
            b.resize(up(b.len()), 0);
            for (i, (_, _, _, size)) in self.tensors.iter().enumerate() {
                b.extend(std::iter::repeat_n(i as u8 + 1, *size));
                b.resize(up(b.len()), 0);
            }
            b
        }
    }

    fn sample() -> Gguf {
        Gguf::new()
            .kv_string("general.architecture", "qwen35")
            .kv_string("general.name", "Qwen3.5-4B")
            .kv_u32("general.file_type", 15)
            .kv_u32("general.alignment", 32)
            .kv_string_array("tokenizer.ggml.tokens", &["<s>", "hola", "mundo"])
            .tensor("token_embd.weight", &[8], 0)
            .tensor("blk.0.attn_q.weight", &[64], 8)
    }

    const MODEL: &str = "qwen3.5:4b";
    const FILE: &str = "Qwen3.5-4B-Q4_K_M.gguf";

    fn write(dir: &Path, bytes: &[u8]) -> PathBuf {
        let path = dir.join(FILE);
        std::fs::File::create(&path).unwrap().write_all(bytes).unwrap();
        path
    }

    #[test]
    fn sin_archivo_hay_que_descargarlo() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            check_local_model(dir.path(), MODEL),
            LocalModelStatus::Missing { path: dir.path().join(FILE) }
        );
    }

    #[test]
    fn un_gguf_completo_esta_listo_con_sus_metadatos() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = sample().bytes();
        let path = write(dir.path(), &bytes);
        let status = check_local_model(dir.path(), MODEL);
        assert!(status.is_ready(), "{status:?}");
        let LocalModelStatus::Ready { path: p, size_bytes, gguf } = status else { unreachable!() };
        assert_eq!(p, path);
        assert_eq!(size_bytes, bytes.len() as u64);
        assert_eq!(gguf.version, 3);
        assert_eq!(gguf.architecture.as_deref(), Some("qwen35"));
        assert_eq!(gguf.name.as_deref(), Some("Qwen3.5-4B"));
        assert_eq!(gguf.file_type, Some(15));
        assert_eq!(gguf.tensor_count, 2);
    }

    #[test]
    fn una_descarga_cortada_en_los_tensores_esta_incompleta() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = sample().bytes();
        write(dir.path(), &bytes[..bytes.len() - 40]);
        let status = check_local_model(dir.path(), MODEL);
        let LocalModelStatus::Incomplete { size_bytes, expected_bytes, .. } = status else {
            panic!("{status:?}")
        };
        assert_eq!(size_bytes, bytes.len() as u64 - 40);
        assert!(expected_bytes.unwrap() > size_bytes);
    }

    #[test]
    fn una_descarga_cortada_en_el_encabezado_esta_incompleta() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), &sample().bytes()[..60]);
        assert!(matches!(
            check_local_model(dir.path(), MODEL),
            LocalModelStatus::Incomplete { expected_bytes: None, .. }
        ));
    }

    #[test]
    fn un_archivo_que_no_es_gguf_es_invalido() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), b"<html>Not Found</html>");
        assert!(matches!(check_local_model(dir.path(), MODEL), LocalModelStatus::Invalid { .. }));
    }

    #[test]
    fn un_archivo_con_bytes_de_mas_es_invalido() {
        let dir = tempfile::tempdir().unwrap();
        let mut bytes = sample().bytes();
        bytes.extend([0u8; 4096]);
        write(dir.path(), &bytes);
        assert!(matches!(check_local_model(dir.path(), MODEL), LocalModelStatus::Invalid { .. }));
    }

    #[test]
    fn un_nombre_fuera_del_catalogo_no_se_conoce() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            check_local_model(dir.path(), "llama9:70b"),
            LocalModelStatus::UnknownModel { name: "llama9:70b".into() }
        );
    }

    #[test]
    fn el_estado_se_serializa_para_la_app() {
        let json = serde_json::to_value(LocalModelStatus::Missing { path: "/m/x.gguf".into() }).unwrap();
        assert_eq!(json, serde_json::json!({ "status": "missing", "path": "/m/x.gguf" }));
    }
}
