#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::Child;
use tokio::sync::Mutex;

static BACKEND_PORT: u16 = 8765;

#[derive(Clone)]
struct AppState {
    backend_process: Arc<Mutex<Option<BackendProcess>>>,
    backend_ready: Arc<AtomicBool>,
}

enum BackendProcess {
    Sidecar(tauri_plugin_shell::process::CommandChild),
    Python(Child),
}

#[tauri::command]
async fn check_backend_ready(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(state.backend_ready.load(Ordering::Relaxed))
}

#[tauri::command]
async fn restart_backend(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    kill_backend(&state).await?;
    start_backend(&state, &app).await?;
    Ok(())
}

#[tauri::command]
async fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let dir = app.dialog()
        .file()
        .blocking_pick_folder();

    match dir {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

async fn kill_backend(state: &AppState) -> Result<(), String> {
    let mut proc = state.backend_process.lock().await;
    if let Some(child) = proc.take() {
        match child {
            BackendProcess::Sidecar(c) => {
                // On Windows, kill() may not terminate the process tree properly
                // Try to kill gracefully first, then force if needed
                let _ = c.kill();
                // Wait a bit for graceful shutdown
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                // The sidecar should be killed by now
            }
            BackendProcess::Python(mut c) => {
                // Try graceful kill first
                let _ = c.kill().await;
                // Wait for the process to exit
                match tokio::time::timeout(std::time::Duration::from_secs(2), c.wait()).await {
                    Ok(_) => {},
                    Err(_) => {
                        // Force kill if timeout
                        eprintln!("[WARN] Backend did not exit gracefully, forcing...");
                        #[cfg(windows)]
                        {
                            // On Windows, use taskkill to ensure process tree is terminated
                            if let Some(pid) = c.id() {
                                let _ = std::process::Command::new("taskkill")
                                    .args(["/F", "/T", "/PID", &pid.to_string()])
                                    .spawn();
                            }
                        }
                        let _ = c.kill().await;
                    }
                }
            }
        }
    }
    state.backend_ready.store(false, Ordering::Relaxed);
    Ok(())
}

async fn start_backend(state: &AppState, app: &tauri::AppHandle) -> Result<(), String> {
    // Try sidecar first (production)
    let sidecar_result = app.shell().sidecar("sheet-agent-backend");

    match sidecar_result {
        Ok(cmd) => {
            // Production: use Tauri sidecar
            let (mut rx, child) = cmd
                .spawn()
                .map_err(|e| format!("Failed to start sidecar: {}", e))?;

            // Store the child process
            {
                let mut proc = state.backend_process.lock().await;
                *proc = Some(BackendProcess::Sidecar(child));
            }

            // Spawn task to handle stdout/stderr events
            tokio::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[BACKEND] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[BACKEND ERR] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(_) => {
            // Development: run Python directly
            let backend_dir = find_backend_dir();
            let backend = backend_dir.ok_or("Cannot find backend directory. Make sure backend/run.py exists.")?;

            let mut cmd = if cfg!(windows) {
                let mut c = tokio::process::Command::new("cmd");
                c.arg("/c").arg("python");
                c
            } else {
                tokio::process::Command::new("python3")
            };
            cmd.arg(backend.join("run.py"))
                .current_dir(&backend)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(windows)]
            {
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            let mut child = cmd
                .spawn()
                .map_err(|e| format!("Failed to start Python backend: {}", e))?;

            // Stream stdout/stderr to console
            if let Some(stdout) = child.stdout.take() {
                tokio::spawn(async move {
                    let reader = BufReader::new(stdout);
                    let mut lines = reader.lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        println!("[BACKEND] {}", line);
                    }
                });
            }
            if let Some(stderr) = child.stderr.take() {
                tokio::spawn(async move {
                    let reader = BufReader::new(stderr);
                    let mut lines = reader.lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        eprintln!("[BACKEND ERR] {}", line);
                    }
                });
            }

            {
                let mut proc = state.backend_process.lock().await;
                *proc = Some(BackendProcess::Python(child));
            }
        }
    }

    wait_for_backend(state).await?;
    Ok(())
}

async fn wait_for_backend(state: &AppState) -> Result<(), String> {
    for _attempt in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        match TcpStream::connect(format!("127.0.0.1:{}", BACKEND_PORT)).await {
            Ok(_) => {
                state.backend_ready.store(true, Ordering::Relaxed);
                println!("Backend is ready on port {}", BACKEND_PORT);
                return Ok(());
            }
            _ => {}
        }

        // Check if process exited prematurely (only for Python process)
        let mut proc = state.backend_process.lock().await;
        if let Some(BackendProcess::Python(ref mut child)) = *proc {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Err(format!(
                        "Backend exited early with code: {:?}",
                        status.code()
                    ));
                }
                _ => {}
            }
        }
    }

    Err("Backend failed to start within 15 seconds".to_string())
}

fn find_backend_dir() -> Option<std::path::PathBuf> {
    let mut current = std::env::current_exe().ok()?;
    for _ in 0..5 {
        current = current.parent()?.to_path_buf();
        let candidate = current.join("backend").join("run.py");
        if candidate.exists() {
            return Some(current.join("backend"));
        }
    }
    let cwd = std::env::current_dir().ok()?;
    if cwd.join("backend").join("run.py").exists() {
        return Some(cwd.join("backend"));
    }
    None
}

fn main() {
    let app_state = AppState {
        backend_process: Arc::new(Mutex::new(None)),
        backend_ready: Arc::new(AtomicBool::new(false)),
    };
    let app_state_setup = app_state.clone();
    let app_state_close = app_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .setup(move |app| {
            let window = app.get_webview_window("main").unwrap();

            let state_clone = app_state_setup.clone();
            let app_handle = app.handle().clone();
            let window_clone = window.clone();

            // 启动后端并等待就绪，然后显示窗口
            tauri::async_runtime::spawn(async move {
                // 启动后端
                if let Err(e) = start_backend(&state_clone, &app_handle).await {
                    eprintln!("Failed to start backend: {}", e);
                    // 即使失败也显示窗口，让用户看到错误
                }

                // 后端就绪后显示窗口
                let _ = window_clone.show();
                let _ = window_clone.set_focus();
            });

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state_clone = app_state_close.clone();
                // Block and wait for backend to be killed
                let rt = tauri::async_runtime::handle();
                rt.block_on(async {
                    if let Err(e) = kill_backend(&state_clone).await {
                        eprintln!("Failed to kill backend: {}", e);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![check_backend_ready, restart_backend, select_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
