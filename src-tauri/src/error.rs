use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Ошибка ввода-вывода: {0}")]
    Io(#[from] std::io::Error),

    #[error("Сетевая ошибка: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Ошибка разбора JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Ошибка архивации: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Ошибка валидации: {0}")]
    Validation(String),

    #[error("Не найдено: {0}")]
    NotFound(String),

    #[error("Ошибка процесса: {0}")]
    Process(String),

    #[error("Несовместимость или отсутствие Java: {0}")]
    JavaRequired(String),

    #[error("{0}")]
    Custom(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
