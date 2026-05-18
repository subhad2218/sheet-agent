# SheetAgent

基于 AI 的桌面数据处理应用，用自然语言处理 Excel、CSV 和 Parquet 文件。

基于 Tauri 2.0 + FastAPI 构建，只需用自然语言描述数据处理需求，AI 代理就会自动读取、转换并导出文件——所有代码在沙箱环境中执行。

## 功能特性

- **自然语言数据处理** — 描述你想做什么，代理自动编写并执行代码
- **多格式支持** — Excel（.xlsx/.xls）、CSV、Parquet、Word（.docx）
- **多模型支持** — Claude、OpenAI、DeepSeek、Qwen、Ollama（本地部署）
- **沙箱执行** — Python 代码在隔离子进程中运行，限制文件系统访问
- **实时流式响应** — 基于 SSE 的流式传输，实时展示代理响应和工具执行过程
- **双语界面** — 中英文界面切换
- **数据预览** — 处理前可检查电子表格数据、表结构和样本行
- **文件管理** — 在工作区内上传、移动、重命名、删除文件
- **跨平台** — 目前支持 Windows（Linux/macOS 只需少量调整）

## 系统架构

```
┌─────────────────────────────────────────┐
│           Tauri 桌面外壳                  │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  前端     │  │  Rust 后端           │ │
│  │ (HTML/JS) │  │  - 进程生命周期管理   │ │
│  │           │  │  - 原生对话框        │ │
│  └─────┬─────┘  └──────────┬───────────┘ │
│        │ HTTP/SSE          │               │
│  ┌─────▼──────────────────▼───────────┐  │
│  │       FastAPI Python 后端            │  │
│  │  ┌─────────┐  ┌─────────────────┐  │  │
│  │  │  代理    │  │  沙箱            │  │  │
│  │  │  循环    │──│  (子进程)        │  │  │
│  │  └────┬────┘  └─────────────────┘  │  │
│  │       │                              │  │
│  │  ┌────▼────────────────────────────┐│  │
│  │  │  LLM 提供商                     ││  │
│  │  │  Claude / OpenAI / DeepSeek /   ││  │
│  │  │  Qwen / Ollama                  ││  │
│  │  └─────────────────────────────────┘│  │
│  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面外壳 | Tauri 2.0（Rust） |
| 前端 | HTML/CSS/JS、Tailwind CSS、Vite |
| 后端 API | FastAPI、Uvicorn |
| 代理 | ReAct 模式 + 工具调用 |
| LLM SDK | Anthropic SDK、OpenAI SDK |
| 数据处理 | Polars、fastexcel、openpyxl、xlsxwriter |
| 代码执行 | 沙箱化 Python 子进程 |

### 项目结构

```
sheet-agent/
├── backend/                  # Python FastAPI 后端
│   ├── app/
│   │   ├── agent.py          # 核心代理循环（ReAct 模式）
│   │   ├── api/
│   │   │   └── server.py     # FastAPI 端点与 SSE 流式响应
│   │   ├── llm/
│   │   │   ├── base.py       # LLMProvider 抽象基类与类型定义
│   │   │   ├── registry.py   # 提供商工厂（Claude/OpenAI/DeepSeek/Qwen/Ollama）
│   │   │   ├── claude_provider.py
│   │   │   └── openai_provider.py
│   │   ├── sandbox/
│   │   │   └── executor.py   # 沙箱化 Python 执行器
│   │   ├── tools/
│   │   │   └── registry.py   # 工具定义与调度
│   │   └── data/             # 静态数据（错误提示等）
│   ├── config/               # 运行时配置（已加入 gitignore）
│   ├── static/               # Web UI 资源（独立模式）
│   ├── config.yaml           # 默认配置模板
│   ├── requirements.txt
│   ├── run.py                # 后端入口
│   └── SheetAgent-backend.spec  # PyInstaller 打包规范
├── desktop/                  # Tauri 桌面应用
│   ├── src/
│   │   ├── index.html        # 单页应用框架
│   │   ├── app.js            # 主应用逻辑
│   │   ├── i18n.js           # 国际化
│   │   └── style.css         # 样式
│   ├── src-tauri/
│   │   ├── src/main.rs       # Rust 后端进程管理
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json   # Tauri 配置
│   ├── package.json
│   └── vite.config.js
├── docs/
│   ├── PRODUCT.md            # 产品文档（中文）
│   └── TECHNICAL.md          # 技术文档（中文）
├── build.py                  # 一键构建脚本
└── .gitignore
```

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+
- Rust 1.75+（Tauri 编译需要）
- LLM API 密钥（Claude、OpenAI、DeepSeek 或 Qwen）

### 开发模式

**1. 启动后端：**

```bash
cd backend
pip install -r requirements.txt
python run.py
```

后端运行在 `http://127.0.0.1:8765`，可直接在浏览器中访问独立 Web 界面。

**2. 启动桌面应用（后端已在运行）：**

```bash
cd desktop
npm install
npm run start
```

此命令先用 Vite 构建前端，再启动 Tauri 开发窗口。Rust 外壳会自动启动 Python 后端。

### 独立 Web 模式

如果只需要 Web 界面，不需要桌面外壳：

```bash
cd backend
python run.py
# 在浏览器中打开 http://127.0.0.1:8765
```

## 打包发布

使用一键构建脚本生成独立可执行文件：

```bash
python build.py
```

构建脚本执行以下步骤：

1. 下载并配置嵌入式 Python 3.11 运行时
2. 在嵌入式 Python 中安装沙箱依赖（polars、fastexcel 等）
3. 通过 PyInstaller 构建后端 EXE
4. 构建 Tauri 桌面应用（打包后端 EXE 和嵌入式 Python）

最终安装包位于 `desktop/src-tauri/target/release/bundle/`。

也可以单独执行各阶段：

```bash
python build.py --python    # 仅配置嵌入式 Python
python build.py --backend   # 仅构建后端 EXE
python build.py --tauri     # 仅构建 Tauri 应用
```

## 配置说明

SheetAgent 将用户设置保存在 `~/.sheet-agent/settings.json` 中。可通过应用内的设置面板管理配置，也可直接编辑该文件：

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "api_key": "sk-xxx",
  "base_url": "https://api.deepseek.com/v1",
  "workspace": "/path/to/your/workspace"
}
```

### 支持的模型提供商

| 提供商 | 默认模型 | 接口地址 |
|--------|---------|---------|
| Claude | claude-haiku-4-5-20251001 | Anthropic API |
| OpenAI | gpt-4o-mini | OpenAI API |
| DeepSeek | deepseek-chat | https://api.deepseek.com/v1 |
| Qwen | qwen-plus | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| Ollama | 用户自定义 | http://localhost:11434/v1 |

## 工作原理

代理遵循 ReAct（推理-行动-观察）循环：

1. **list_files** — 发现工作区中的文件
2. **read_excel** — 检查文件表结构和样本数据
3. **execute_python** — 在沙箱环境中运行数据处理代码
4. **write_result** — 确认输出文件已创建

每个步骤通过 SSE 实时流式返回结果。如果代码执行失败，代理会自动重试并附加修复引导（最多 3 次）。

### 沙箱安全

Python 执行沙箱具备以下安全措施：

- 在子进程中运行代码，30 秒超时
- 限制文件系统访问，仅允许工作区目录和临时目录
- 阻止 `subprocess`、`shutil`、`os.system`、`os.popen` 的调用
- 使用 Polars 进行高效数据操作

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/config | 获取当前配置 |
| POST | /api/config | 更新配置 |
| POST | /api/chat | 代理对话（SSE 流式） |
| POST | /api/execute | 直接执行 Python 代码 |
| POST | /api/upload | 上传文件到工作区 |
| GET | /api/workspace/files | 列出工作区文件 |
| GET | /api/workspace/stats | 工作区统计信息 |
| GET | /api/preview | 预览文件内容 |
| GET | /api/download/{path} | 下载工作区文件 |
| GET | /api/providers | 列出可用的 LLM 提供商 |
| GET | /api/sessions | 列出对话会话 |
| GET | /api/health | 健康检查 |

## 许可证

本项目基于 MIT 许可证发布。
