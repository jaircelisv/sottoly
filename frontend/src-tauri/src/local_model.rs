// SOTTOLY: ¿está descargado y válido el modelo local X? Archivo nuevo.
//
// Meetily valida por tamaño (±10 % de `size_mb`) y descarga directo al archivo
// final, así que una descarga cortada al 95 % pasa. Aquí se lee el encabezado
// GGUF y la tabla de tensores para calcular el tamaño exacto que debe tener el
// archivo, sin red. La App lo usará para decirle al Usuario si ya tiene el
// modelo o si debe descargarlo (de nuevo).

use crate::summary::summary_engine::models::get_model_by_name;
use serde::Serialize;
use std::fs::File;
use std::io::{BufReader, ErrorKind, Read};
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
    let Some(def) = get_model_by_name(name) else {
        return LocalModelStatus::UnknownModel { name: name.to_string() };
    };
    let path = models_dir.join(&def.gguf_file);
    let size_bytes = match std::fs::metadata(&path) {
        Ok(m) => m.len(),
        Err(_) => return LocalModelStatus::Missing { path },
    };
    match inspect_gguf(&path) {
        Err(GgufError::Truncated) => LocalModelStatus::Incomplete { path, size_bytes, expected_bytes: None },
        Err(GgufError::Invalid(reason)) => LocalModelStatus::Invalid { path, reason },
        Ok(gguf) if size_bytes < gguf.expected_bytes => {
            LocalModelStatus::Incomplete { path, size_bytes, expected_bytes: Some(gguf.expected_bytes) }
        }
        // El escritor de GGUF puede rellenar el último tensor hasta la alineación.
        Ok(gguf) if size_bytes > gguf.expected_bytes + ALIGNMENT_SLACK => LocalModelStatus::Invalid {
            path,
            reason: format!("{size_bytes} bytes, se esperaban {}", gguf.expected_bytes),
        },
        Ok(gguf) => LocalModelStatus::Ready { path, size_bytes, gguf },
    }
}

/// Lee el encabezado GGUF y calcula el tamaño esperado del archivo.
pub fn inspect_gguf(path: &Path) -> Result<GgufInfo, GgufError> {
    let file = File::open(path).map_err(|e| GgufError::Invalid(e.to_string()))?;
    let mut r = Reader { inner: BufReader::new(file), pos: 0 };

    if r.bytes::<4>()? != *b"GGUF" {
        return Err(GgufError::Invalid("no es un archivo GGUF".into()));
    }
    let version = r.u32()?;
    if !(2..=3).contains(&version) {
        return Err(GgufError::Invalid(format!("versión GGUF {version} no soportada")));
    }
    let tensor_count = r.u64()?;
    let kv_count = r.u64()?;

    let (mut architecture, mut name, mut file_type, mut alignment) = (None, None, None, 32u64);
    for _ in 0..kv_count {
        let key = r.string()?;
        let value_type = r.u32()?;
        match (key.as_str(), value_type) {
            ("general.architecture", STRING) => architecture = Some(r.string()?),
            ("general.name", STRING) => name = Some(r.string()?),
            ("general.file_type", U32) => file_type = Some(r.u32()?),
            ("general.alignment", U32) => alignment = r.u32()? as u64,
            _ => r.skip_value(value_type)?,
        }
    }
    if alignment == 0 {
        return Err(GgufError::Invalid("general.alignment = 0".into()));
    }

    let mut data_end = 0u64;
    for _ in 0..tensor_count {
        r.skip_string()?;
        let n_dims = r.u32()?;
        let mut elements = 1u64;
        for _ in 0..n_dims {
            elements = elements.saturating_mul(r.u64()?);
        }
        let ggml_type = r.u32()?;
        let offset = r.u64()?;
        let (block_size, type_size) = ggml_type_size(ggml_type)
            .ok_or_else(|| GgufError::Invalid(format!("tipo de tensor ggml {ggml_type} desconocido")))?;
        let bytes = elements / block_size * type_size;
        data_end = data_end.max(offset.saturating_add(bytes));
    }
    let data_start = r.pos.div_ceil(alignment) * alignment;

    Ok(GgufInfo {
        version,
        architecture,
        name,
        file_type,
        tensor_count,
        expected_bytes: data_start + data_end,
    })
}

const ALIGNMENT_SLACK: u64 = 256;

// Tipos de valor de los metadatos GGUF.
const U32: u32 = 4;
const STRING: u32 = 8;
const ARRAY: u32 = 9;

/// (elementos por bloque, bytes por bloque) de cada tipo ggml (ggml.h / ggml.c).
fn ggml_type_size(t: u32) -> Option<(u64, u64)> {
    Some(match t {
        0 => (1, 4),     // F32
        1 => (1, 2),     // F16
        2 => (32, 18),   // Q4_0
        3 => (32, 20),   // Q4_1
        6 => (32, 22),   // Q5_0
        7 => (32, 24),   // Q5_1
        8 => (32, 34),   // Q8_0
        9 => (32, 36),   // Q8_1
        10 => (256, 84), // Q2_K
        11 => (256, 110), // Q3_K
        12 => (256, 144), // Q4_K
        13 => (256, 176), // Q5_K
        14 => (256, 210), // Q6_K
        15 => (256, 292), // Q8_K
        16 => (256, 66), // IQ2_XXS
        17 => (256, 74), // IQ2_XS
        18 => (256, 98), // IQ3_XXS
        19 => (256, 50), // IQ1_S
        20 => (32, 18),  // IQ4_NL
        21 => (256, 110), // IQ3_S
        22 => (256, 82), // IQ2_S
        23 => (256, 136), // IQ4_XS
        24 => (1, 1),    // I8
        25 => (1, 2),    // I16
        26 => (1, 4),    // I32
        27 => (1, 8),    // I64
        28 => (1, 8),    // F64
        29 => (256, 56), // IQ1_M
        30 => (1, 2),    // BF16
        34 => (256, 54), // TQ1_0
        35 => (256, 66), // TQ2_0
        39 => (32, 17),  // MXFP4
        _ => return None,
    })
}

struct Reader {
    inner: BufReader<File>,
    pos: u64,
}

impl Reader {
    fn bytes<const N: usize>(&mut self) -> Result<[u8; N], GgufError> {
        let mut buf = [0u8; N];
        self.inner.read_exact(&mut buf).map_err(io_error)?;
        self.pos += N as u64;
        Ok(buf)
    }
    fn u32(&mut self) -> Result<u32, GgufError> {
        Ok(u32::from_le_bytes(self.bytes()?))
    }
    fn u64(&mut self) -> Result<u64, GgufError> {
        Ok(u64::from_le_bytes(self.bytes()?))
    }
    fn skip(&mut self, n: u64) -> Result<(), GgufError> {
        // seek_relative no detecta el fin de archivo: se valida al leer lo siguiente
        // y, al final, con el tamaño esperado.
        let n_i64 = i64::try_from(n).map_err(|_| GgufError::Invalid("longitud fuera de rango".into()))?;
        self.inner.seek_relative(n_i64).map_err(io_error)?;
        self.pos += n;
        Ok(())
    }
    fn string(&mut self) -> Result<String, GgufError> {
        let len = self.u64()?;
        if len > 1 << 20 {
            return Err(GgufError::Invalid(format!("cadena de {len} bytes en los metadatos")));
        }
        let mut buf = vec![0u8; len as usize];
        self.inner.read_exact(&mut buf).map_err(io_error)?;
        self.pos += len;
        String::from_utf8(buf).map_err(|_| GgufError::Invalid("cadena no UTF-8".into()))
    }
    fn skip_string(&mut self) -> Result<(), GgufError> {
        let len = self.u64()?;
        self.skip(len)
    }
    fn skip_value(&mut self, value_type: u32) -> Result<(), GgufError> {
        match value_type {
            0 | 1 | 7 => self.skip(1),
            2 | 3 => self.skip(2),
            4..=6 => self.skip(4),
            10..=12 => self.skip(8),
            STRING => self.skip_string(),
            ARRAY => {
                let item_type = self.u32()?;
                let len = self.u64()?;
                match item_type {
                    0 | 1 | 7 => self.skip(len),
                    2 | 3 => self.skip(len * 2),
                    4..=6 => self.skip(len * 4),
                    10..=12 => self.skip(len * 8),
                    STRING => (0..len).try_for_each(|_| self.skip_string()),
                    t => Err(GgufError::Invalid(format!("arreglo de tipo {t} no soportado"))),
                }
            }
            t => Err(GgufError::Invalid(format!("tipo de valor {t} desconocido"))),
        }
    }
}

fn io_error(e: std::io::Error) -> GgufError {
    if e.kind() == ErrorKind::UnexpectedEof {
        GgufError::Truncated
    } else {
        GgufError::Invalid(e.to_string())
    }
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
