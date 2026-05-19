# SheetAgent

[中文](README.zh.md)

AI-powered desktop app for processing Excel, CSV, and Parquet files with natural language.

Built with Tauri 2.0 + FastAPI, SheetAgent lets you describe data tasks in plain language and watches the AI agent read, transform, and export your files — all within a sandboxed Python environment.

## Features

- **Natural language data processing** — Describe what you want, the agent writes and runs the code
- **Multi-format support** — Excel (.xlsx/.xls), CSV, Parquet, Word (.docx)
- **Multiple AI models** — Claude, OpenAI, DeepSeek, Qwen, Ollama (local)
- **Sandboxed execution** — Python code runs in an isolated subprocess with filesystem restrictions
- **Real-time streaming** — SSE-based streaming for agent responses and tool execution
- **Bilingual UI** — English and Chinese interface
- **Data preview** — Inspect spreadsheet data, schemas, and sample rows before processing
- **File management** — Upload, move, rename, delete files within the workspace
- **Cross-platform** — Windows support (Linux/macOS possible with minor adjustments)

## Architecture

```
┌─────────────────────────────────────────┐
│           Tauri Desktop Shell            │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │ Frontend  │  │  Rust Backend        │ │
│  │ (HTML/JS) │  │  - Process lifecycle │ │
│  │           │  │  - Native dialogs    │ │
│  └─────┬─────┘  └──────────┬───────────┘ │
│        │ HTTP/SSE          │               │
│  ┌─────▼──────────────────▼───────────┐  │
│  │       FastAPI Python Backend        │  │
│  │  ┌─────────┐  ┌─────────────────┐  │  │
│  │  │  Agent   │  │  Sandbox        │  │  │
│  │  │  Loop    │──│  (subprocess)   │  │  │
│  │  └────┬────┘  └─────────────────┘  │  │
│  │       │                              │  │
│  │  ┌────▼────────────────────────────┐│  │
│  │  │  LLM Providers                 ││  │
│  │  │  Claude / OpenAI / DeepSeek /  ││  │
│  │  │  Qwen / Ollama                 ││  │
│  │  └─────────────────────────────────┘│  │
│  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri 2.0 (Rust) |
| Frontend | HTML/CSS/JS, Tailwind CSS, Vite |
| Backend API | FastAPI, Uvicorn |
| Agent | ReAct pattern with tool calling |
| LLM SDKs | Anthropic SDK, OpenAI SDK |
| Data Processing | Polars, fastexcel, openpyxl, xlsxwriter |
| Code Execution | Sandboxed Python subprocess |

### Project Structure

```
sheet-agent/
├── backend/                  # Python FastAPI backend
│   ├── app/
│   │   ├── agent.py          # Core agent loop (ReAct pattern)
│   │   ├── api/
│   │   │   └── server.py     # FastAPI endpoints & SSE streaming
│   │   ├── llm/
│   │   │   ├── base.py       # LLMProvider abstract base & types
│   │   │   ├── registry.py   # Provider factory (Claude/OpenAI/DeepSeek/Qwen/Ollama)
│   │   │   ├── claude_provider.py
│   │   │   └── openai_provider.py
│   │   ├── sandbox/
│   │   │   └── executor.py   # Sandboxed Python execution
│   │   ├── tools/
│   │   │   └── registry.py   # Tool definitions & dispatch
│   │   └── data/             # Static data (error hints)
│   ├── config/               # Runtime config (gitignored)
│   ├── static/               # Web UI assets (standalone mode)
│   ├── config.yaml           # Default config template
│   ├── requirements.txt
│   ├── run.py                # Backend entry point
│   └── SheetAgent-backend.spec  # PyInstaller spec
├── desktop/                  # Tauri desktop application
│   ├── src/
│   │   ├── index.html        # Single-page app shell
│   │   ├── app.js            # Main application logic
│   │   ├── i18n.js           # Internationalization
│   │   └── style.css         # Styles
│   ├── src-tauri/
│   │   ├── src/main.rs       # Rust backend process manager
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json   # Tauri configuration
│   ├── package.json
│   └── vite.config.js
├── build.py                  # One-stop build script
└── .gitignore
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Rust 1.75+ (for Tauri)
- An LLM API key (Claude, OpenAI, DeepSeek, or Qwen)

### Development

**1. Start the backend:**

```bash
cd backend
pip install -r requirements.txt
python run.py
```

The backend runs on `http://127.0.0.1:8765`. You can use the standalone web UI at this address directly.

**2. Start the desktop app (with live backend):**

```bash
cd desktop
npm install
npm run start
```

This builds the frontend with Vite and launches the Tauri dev window. The Rust shell will also start the Python backend automatically.

### Standalone Web Mode

If you only want the web UI without the desktop shell:

```bash
cd backend
python run.py
# Open http://127.0.0.1:8765 in your browser
```

## Building for Distribution

Use the one-stop build script to create a standalone executable:

```bash
python build.py
```

This script:
1. Downloads and configures an embedded Python 3.11 runtime
2. Installs sandbox dependencies (polars, fastexcel, etc.) into the embedded Python
3. Builds the backend EXE via PyInstaller
4. Builds the Tauri desktop app (which bundles the backend EXE and embedded Python)

The final installer will be in `desktop/src-tauri/target/release/bundle/`.

You can also run individual stages:

```bash
python build.py --python    # Setup embedded Python only
python build.py --backend   # Build backend EXE only
python build.py --tauri     # Build Tauri app only
```

## Configuration

SheetAgent stores user settings in `~/.sheet-agent/settings.json`. Configuration is managed through the Settings panel in the app, or by editing the file directly:

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "api_key": "sk-xxx",
  "base_url": "https://api.deepseek.com/v1",
  "workspace": "/path/to/your/workspace"
}
```

### Supported Providers

| Provider | Default Model | Base URL |
|----------|--------------|----------|
| Claude | claude-haiku-4-5-20251001 | (Anthropic API) |
| OpenAI | gpt-4o-mini | (OpenAI API) |
| DeepSeek | deepseek-chat | https://api.deepseek.com/v1 |
| Qwen | qwen-plus | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| Ollama | (user-configured) | http://localhost:11434/v1 |

## How It Works

The agent follows a ReAct (Reason-Act-Observe) loop:

1. **list_files** — Discover what's in the workspace
2. **read_excel** — Inspect file schema and sample data
3. **execute_python** — Run data processing code in a sandboxed environment
4. **write_result** — Confirm the output file was created

Each step streams results in real-time via SSE. If code execution fails, the agent automatically retries with guidance (up to 3 attempts).

### Sandbox Security

The Python execution sandbox:
- Runs code in a subprocess with a 30-second timeout
- Restricts filesystem access to the workspace directory and temp directory
- Blocks `subprocess`, `shutil`, `os.system`, and `os.popen`
- Uses Polars for efficient data operations

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/config | Get current configuration |
| POST | /api/config | Update configuration |
| POST | /api/chat | Chat with agent (SSE streaming) |
| POST | /api/execute | Direct Python code execution |
| POST | /api/upload | Upload files to workspace |
| GET | /api/workspace/files | List workspace files |
| GET | /api/workspace/stats | Workspace statistics |
| GET | /api/preview | Preview file contents |
| GET | /api/download/{path} | Download a workspace file |
| GET | /api/providers | List available LLM providers |
| GET | /api/sessions | List chat sessions |
| GET | /api/health | Health check |

## License

This project is licensed under the MIT License.
