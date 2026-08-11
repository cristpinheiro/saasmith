use std::fs;
use std::path::Path;
use tauri::command;

#[command]
pub fn read_project(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
pub fn write_project(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[command]
pub async fn call_ai(
    url: String,
    api_key: Option<String>,
    auth_token: Option<String>,
    body: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut req = client
        .post(&url)
        .header("content-type", "application/json")
        .header("anthropic-version", "2023-06-01")
        .body(body);

    if let Some(token) = auth_token.filter(|s| !s.is_empty()) {
        req = req.header("authorization", format!("Bearer {}", token));
    } else if let Some(key) = api_key.filter(|s| !s.is_empty()) {
        req = req.header("x-api-key", key);
    }

    let response = req.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if status >= 400 {
        return Err(format!("HTTP {}: {}", status, text));
    }

    Ok(text)
}
