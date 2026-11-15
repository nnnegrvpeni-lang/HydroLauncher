use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::Value;
use std::time::Instant;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

const PROTOCOL_VERSION: i32 = 767;
const PING_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_RESPONSE_BYTES: i32 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub online: bool,
    pub players_online: u32,
    pub players_max: u32,
    pub latency_ms: u64,
    pub version: Option<String>,
    pub motd: Option<String>,
}

fn offline(latency_ms: u64) -> ServerStatus {
    ServerStatus {
        online: false,
        latency_ms,
        ..Default::default()
    }
}

fn write_varint(out: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut byte = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

async fn read_varint<R: AsyncRead + Unpin>(reader: &mut R) -> std::io::Result<i32> {
    let mut result = 0i32;
    let mut shift = 0;
    loop {
        let mut byte = [0u8; 1];
        reader.read_exact(&mut byte).await?;
        result |= ((byte[0] & 0x7F) as i32) << shift;
        if byte[0] & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift > 35 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "слишком длинный VarInt",
            ));
        }
    }
    Ok(result)
}

fn packet(id: i32, payload: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(payload.len() + 1);
    write_varint(&mut body, id);
    body.extend_from_slice(payload);

    let mut out = Vec::with_capacity(body.len() + 5);
    write_varint(&mut out, body.len() as i32);
    out.extend_from_slice(&body);
    out
}

/// Разбирает `host`, `host:port` и `[::1]:port`.
fn parse_address(address: &str) -> AppResult<(String, u16)> {
    let trimmed = address.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Введите адрес сервера".into()));
    }

    if let Some(rest) = trimmed.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            let host = &rest[..end];
            let port = rest[end + 1..]
                .strip_prefix(':')
                .and_then(|port| port.parse::<u16>().ok())
                .unwrap_or(25565);
            return Ok((host.to_string(), port));
        }
    }

    match trimmed.rsplit_once(':') {
        Some((host, port)) if !host.is_empty() => match port.parse::<u16>() {
            Ok(port) => Ok((host.to_string(), port)),
            Err(_) => Ok((trimmed.to_string(), 25565)),
        },
        _ => Ok((trimmed.to_string(), 25565)),
    }
}

fn description_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => Some(
            items
                .iter()
                .filter_map(description_text)
                .collect::<Vec<_>>()
                .join(""),
        ),
        Value::Object(map) => {
            let mut text = map
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if let Some(extra) = map.get("extra").and_then(Value::as_array) {
                for item in extra {
                    if let Some(part) = description_text(item) {
                        text.push_str(&part);
                    }
                }
            }
            Some(text)
        }
        _ => None,
    }
}

/// Убирает цветовые коды Minecraft и лишние пробелы.
fn clean_motd(text: &str) -> Option<String> {
    let mut cleaned = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(ch) = chars.next() {
        if ch == '§' {
            let _ = chars.next();
            continue;
        }
        cleaned.push(ch);
    }
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

pub async fn ping_server(address: &str) -> AppResult<ServerStatus> {
    let (host, port) = parse_address(address)?;
    let started = Instant::now();

    let Ok(Ok(mut addrs)) =
        timeout(PING_TIMEOUT, tokio::net::lookup_host((host.as_str(), port))).await
    else {
        return Ok(offline(started.elapsed().as_millis() as u64));
    };
    let Some(addr) = addrs.next() else {
        return Ok(offline(started.elapsed().as_millis() as u64));
    };
    let Ok(Ok(mut stream)) = timeout(PING_TIMEOUT, TcpStream::connect(addr)).await else {
        return Ok(offline(started.elapsed().as_millis() as u64));
    };

    let mut handshake = Vec::new();
    write_varint(&mut handshake, PROTOCOL_VERSION);
    write_varint(&mut handshake, host.len() as i32);
    handshake.extend_from_slice(host.as_bytes());
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1);

    let mut request = packet(0x00, &handshake);
    request.extend(packet(0x00, &[]));

    let response = async {
        stream.write_all(&request).await?;
        let length = read_varint(&mut stream).await?;
        if length <= 0 || length > MAX_RESPONSE_BYTES {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "некорректная длина ответа",
            ));
        }
        let mut buffer = vec![0u8; length as usize];
        stream.read_exact(&mut buffer).await?;

        let mut cursor: &[u8] = &buffer;
        let _packet_id = read_varint(&mut cursor).await?;
        let json_len = read_varint(&mut cursor).await?;
        if json_len < 0 || json_len as usize > cursor.len() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "некорректный JSON в ответе",
            ));
        }
        Ok::<String, std::io::Error>(
            String::from_utf8_lossy(&cursor[..json_len as usize]).to_string(),
        )
    };

    let json = match timeout(PING_TIMEOUT, response).await {
        Ok(Ok(json)) => json,
        _ => return Ok(offline(started.elapsed().as_millis() as u64)),
    };

    let Ok(value) = serde_json::from_str::<Value>(&json) else {
        return Ok(offline(started.elapsed().as_millis() as u64));
    };
    let latency_ms = started.elapsed().as_millis() as u64;
    let players = value.get("players");
    let players_online = players
        .and_then(|players| players.get("online"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .min(u32::MAX as u64) as u32;
    let players_max = players
        .and_then(|players| players.get("max"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .min(u32::MAX as u64) as u32;
    let version = value
        .get("version")
        .and_then(|version| version.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let motd = value
        .get("description")
        .and_then(description_text)
        .and_then(|text| clean_motd(&text));

    Ok(ServerStatus {
        online: true,
        players_online,
        players_max,
        latency_ms,
        version,
        motd,
    })
}

#[cfg(test)]
mod tests {
    use super::{clean_motd, parse_address};

    #[test]
    fn parses_server_addresses() {
        assert_eq!(
            parse_address("play.example.com").unwrap(),
            ("play.example.com".to_string(), 25565)
        );
        assert_eq!(
            parse_address("play.example.com:25566").unwrap(),
            ("play.example.com".to_string(), 25566)
        );
        assert_eq!(
            parse_address("[::1]:25565").unwrap(),
            ("::1".to_string(), 25565)
        );
        assert!(parse_address("   ").is_err());
    }

    #[test]
    fn strips_minecraft_color_codes() {
        assert_eq!(clean_motd("§aHello §lworld").unwrap(), "Hello world");
        assert_eq!(clean_motd("   "), None);
    }
}
