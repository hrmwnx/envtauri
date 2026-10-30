use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvSource {
    Dotenv,
    User,
    System,
    Process,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvEntry {
    pub key: String,
    pub value: String,
    pub source: EnvSource,
    pub expandable: bool,
    pub leading_lines: Vec<String>,
    pub trailing_lines: Vec<String>,
}
