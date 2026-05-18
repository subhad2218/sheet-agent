"""Core Agent Loop — the brain of SheetAgent."""

from __future__ import annotations
import json
import uuid
from typing import Any, Generator

from .llm.base import LLMProvider, LLMResponse, ToolCall, ToolDef
from .llm.registry import create_provider, PROVIDER_DEFAULTS
from .tools.registry import TOOLS, execute_tool


SYSTEM_PROMPT_EN = """You are SheetAgent, an expert data processing assistant. You help users process Excel, CSV, and Parquet files.

## Tools
- **list_files**: List files in the workspace. Always start here.
- **read_excel**: Read a file's schema (columns, dtypes) and sample rows. Use BEFORE writing any processing code. For multi-sheet Excel, use the `sheet_name` parameter.
- **read_document**: Read a Word document (.docx/.doc) and return its text content and tables.
- **execute_python**: Run Python code. Libraries available: polars (as pl), fastexcel, openpyxl, xlsxwriter, docx.
- **write_result**: Confirm an output file was created.

## Workflow (MUST follow)
1. list_files — see what's in the workspace
2. read_excel / read_document — inspect data before processing
3. execute_python — write and run processing code
4. write_result — confirm the output file
5. Summarize what was done

## Coding rules
- Always use polars (pl) for data operations. It's fast and memory-efficient.
- For xlsx: use `pl.read_excel(path)` (default calamine engine). For multi-sheet: pass `sheet_name` to read_excel tool, or use `pl.read_excel(path, sheet_name="Sheet2")` in code.
- For CSV with Chinese: try `encoding='utf-8-sig'` first, then `encoding='gbk'`.
- For Word docs: use `from docx import Document` to read .docx files.
- Write output with `df.write_excel("output.xlsx")` or `df.write_csv("output.csv")`.
- For charts/visualization: use matplotlib. Save charts as .png files (e.g., `plt.savefig("chart.png", dpi=150, bbox_inches="tight")`). matplotlib, seaborn are available.
- Keep code simple. No classes, no abstractions. Just read → transform → write.
- If code fails, read the error traceback carefully and fix. Common issues: column name typos, encoding, empty sheets.
- Do NOT write intermediate files (.txt, .log, .json, .tmp, etc.) to the current directory. Use `print()` for debugging output.
- If you absolutely must write temporary files, use `os.environ['SA_TMP_DIR']` or Python's `tempfile` module.

## Output formatting
- When presenting tabular data, multi-row results, or comparisons, ALWAYS use markdown table syntax (`| Column | Column |`).
- NEVER use plain-text space-aligned tables. They render poorly.
- Example:
  | Code | Title | Description |
  |------|-------|-------------|
  | VCU 520450-18 | Battery SOC Low | Charge timely |
- Keep tables compact: include only relevant columns, truncate long text with `...` if needed.

## Important
- NEVER skip step 2 (read_excel). You must inspect data before processing it.
- If a user mentions a file with @filename, it exists in the workspace — use it directly.
- You operate inside a specific directory within the workspace. Use relative paths (e.g., "file.xlsx") rather than full paths. Output files are also written to the current directory.
- Respond in the same language the user uses (Chinese prompt → Chinese reply).
"""

SYSTEM_PROMPT_ZH = """你是 SheetAgent，一个专业的数据处理助手。你帮助用户处理 Excel、CSV 和 Parquet 文件。

## 工具
- **list_files**：列出工作区中的文件。始终从这里开始。
- **read_excel**：读取文件的表结构（列名、数据类型）和样本行。在编写任何处理代码之前必须使用。对于多工作表的 Excel，请使用 `sheet_name` 参数。
- **read_document**：读取 Word 文档（.docx/.doc）并返回其文本内容和表格。
- **execute_python**：运行 Python 代码。可用库：polars（as pl）、fastexcel、openpyxl、xlsxwriter、docx。
- **write_result**：确认输出文件已创建。

## 工作流程（必须遵循）
1. list_files — 查看工作区中有哪些文件
2. read_excel / read_document — 在处理前先检查数据
3. execute_python — 编写并运行处理代码
4. write_result — 确认输出文件
5. 总结完成的工作

## 编码规则
- 始终使用 polars（pl）进行数据操作，它快速且内存高效。
- 对于 xlsx：使用 `pl.read_excel(path)`（默认 calamine 引擎）。多工作表：传 `sheet_name` 参数，或在代码中使用 `pl.read_excel(path, sheet_name="Sheet2")`。
- 对于含中文的 CSV：先尝试 `encoding='utf-8-sig'`，再尝试 `encoding='gbk'`。
- 对于 Word 文档：使用 `from docx import Document` 读取 .docx 文件。
- 使用 `df.write_excel("output.xlsx")` 或 `df.write_csv("output.csv")` 写入输出。
- 图表/可视化：使用 matplotlib。将图表保存为 .png 文件（如 `plt.savefig("chart.png", dpi=150, bbox_inches="tight")`）。matplotlib、seaborn 可用。
- 保持代码简洁，不要使用类或抽象。只需 读取 → 转换 → 写入。
- 如果代码失败，仔细阅读错误回溯并修复。常见问题：列名拼写错误、编码问题、空工作表。
- 不要在当前目录中写入中间文件（.txt、.log、.json、.tmp 等）。使用 `print()` 进行调试输出。
- 如果必须写入临时文件，请使用 `os.environ['SA_TMP_DIR']` 或 Python 的 `tempfile` 模块。

## 输出格式
- 展示表格数据、多行结果或比较时，务必使用 Markdown 表格语法（`| 列名 | 列名 |`）。
- 绝对不要使用纯文本空格对齐的表格，渲染效果很差。
- 示例：
  | 故障码 | 标题 | 说明 |
  |--------|------|------|
  | VCU 520450-18 | 电池 SOC 低 | 及时充电 |
- 保持表格紧凑：只包含相关列，长文本用 `...` 截断。

## 重要事项
- 绝对不要跳过第 2 步（read_excel），必须在处理前检查数据。
- 如果用户用 @文件名 提到文件，该文件已存在于工作区中，直接使用即可。
- 你在工作区内的特定目录中操作。使用相对路径（如 "file.xlsx"）而非完整路径。输出文件也写入当前目录。
- 始终使用中文回复用户。
"""

SYSTEM_PROMPTS = {
    "en": SYSTEM_PROMPT_EN,
    "zh": SYSTEM_PROMPT_ZH,
}

# Backward compat
SYSTEM_PROMPT = SYSTEM_PROMPT_EN


def get_system_prompt(lang: str = "en") -> str:
    return SYSTEM_PROMPTS.get(lang, SYSTEM_PROMPT_EN)


MAX_TURNS = 30
MAX_AUTO_RETRIES = 3  # max consecutive auto-fix attempts for execute_python


def _tool_result_message(tool_call_id: str, result: str) -> dict:
    """Build a tool result message in provider-agnostic format.
    Each provider adapter will convert this to its own format."""
    return {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "content": result,
    }


def _format_messages_for_claude(messages: list[dict]) -> list[dict]:
    """Convert generic messages to Claude API format."""
    result = []
    for m in messages:
        role = m["role"]
        if role == "system":
            continue  # system goes in a separate param
        elif role == "assistant":
            content = []
            if m.get("text"):
                content.append({"type": "text", "text": m["text"]})
            for tc in m.get("tool_calls", []):
                content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["arguments"],
                })
            result.append({"role": "assistant", "content": content})
        elif role == "tool":
            result.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": m["tool_call_id"],
                    "content": m["content"],
                }],
            })
        elif role == "user":
            result.append({"role": "user", "content": m["content"]})
    return result


def _format_messages_for_openai(messages: list[dict]) -> list[dict]:
    """Convert generic messages to OpenAI-compatible format."""
    result = []
    for m in messages:
        role = m["role"]
        if role == "system":
            result.append({"role": "system", "content": m["content"]})
        elif role == "assistant":
            msg = {"role": "assistant"}
            if m.get("tool_calls"):
                msg["content"] = None
                msg["tool_calls"] = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": json.dumps(tc["arguments"], ensure_ascii=False),
                        },
                    }
                    for tc in m["tool_calls"]
                ]
            else:
                msg["content"] = m.get("text", "")
            # DeepSeek thinking mode: must pass reasoning_content back
            if m.get("reasoning_content"):
                msg["reasoning_content"] = m["reasoning_content"]
            result.append(msg)
        elif role == "tool":
            result.append({
                "role": "tool",
                "tool_call_id": m["tool_call_id"],
                "content": m["content"],
            })
        elif role == "user":
            result.append({"role": "user", "content": m["content"]})
    return result


class AgentSession:
    """Manages a single agent conversation session."""

    def __init__(
        self,
        provider: LLMProvider,
        workspace: str,
        current_dir: str = "",
        max_turns: int = MAX_TURNS,
        session_id: str | None = None,
        messages: list[dict] | None = None,
        lang: str = "en",
    ):
        self.provider = provider
        self.workspace = workspace
        self.current_dir = current_dir
        self.max_turns = max_turns
        self.lang = lang
        self.messages: list[dict] = messages if messages is not None else [
            {"role": "system", "content": get_system_prompt(lang)},
        ]
        self.turn_count = 0
        self.session_id = session_id or str(uuid.uuid4())[:8]
        # Track consecutive execute_python failures for auto-retry
        self._consecutive_failures: dict[str, int] = {}

    @classmethod
    def create(
        cls,
        provider_name: str,
        workspace: str,
        current_dir: str = "",
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        lang: str = "en",
    ) -> "AgentSession":
        provider = create_provider(provider_name, api_key=api_key, model=model, base_url=base_url)
        return cls(provider=provider, workspace=workspace, current_dir=current_dir, lang=lang)

    @classmethod
    def from_dict(cls, data: dict) -> "AgentSession":
        """Restore a session from a saved dict."""
        provider_name = data.get("provider_name", "claude")
        model = data.get("model", "")
        api_key = data.get("api_key")
        base_url = data.get("base_url")
        provider = create_provider(provider_name, api_key=api_key, model=model, base_url=base_url)
        session = cls(
            provider=provider,
            workspace=data.get("workspace", ""),
            current_dir=data.get("current_dir", ""),
            session_id=data.get("session_id"),
            messages=data.get("messages", None),
            lang=data.get("lang", "en"),
        )
        session.turn_count = data.get("turn_count", 0)
        return session

    def to_dict(self) -> dict:
        """Serialize session state to dict for persistence."""
        return {
            "session_id": self.session_id,
            "provider_name": self.provider.name,
            "model": self.provider.model,
            "workspace": self.workspace,
            "current_dir": self.current_dir,
            "turn_count": self.turn_count,
            "messages": self.messages,
            "lang": self.lang,
        }

    def _get_formatted_messages(self) -> list[dict]:
        if self.provider.name == "claude":
            return _format_messages_for_claude(self.messages)
        else:
            return _format_messages_for_openai(self.messages)

    def _append_assistant(self, response: LLMResponse):
        msg = {"role": "assistant", "text": response.text or "", "tool_calls": []}
        if response.reasoning_content:
            msg["reasoning_content"] = response.reasoning_content
        if response.tool_calls:
            msg["tool_calls"] = [
                {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                for tc in response.tool_calls
            ]
        self.messages.append(msg)

    def _append_tool_result(self, tool_call: ToolCall, result: str):
        self.messages.append(_tool_result_message(tool_call.id, result))

    def _should_auto_retry(self, tool_call: ToolCall, result: str) -> bool:
        """Check if a failed execute_python should trigger auto-retry guidance."""
        if tool_call.name != "execute_python":
            return False
        try:
            parsed = json.loads(result)
            if parsed.get("success") is False:
                return True
        except Exception:
            pass
        return False

    def run(self, user_message: str) -> str:
        """Run agent loop synchronously. Returns final text response."""
        self.messages.append({"role": "user", "content": user_message})
        formatted = self._get_formatted_messages()

        for turn in range(self.max_turns):
            self.turn_count = turn + 1
            response = self.provider.chat(formatted, TOOLS)
            self._append_assistant(response)

            if response.done:
                return response.text or "Task completed."

            if not response.tool_calls:
                return response.text or "Task completed."

            # Execute tools
            for tc in response.tool_calls:
                result = execute_tool(tc, self.workspace, self.current_dir)
                self._append_tool_result(tc, result)

            # Refresh formatted messages
            formatted = self._get_formatted_messages()

        return "Reached maximum turns. Task may be incomplete."

    def run_stream(self, user_message: str) -> Generator[dict, None, None]:
        """Run agent loop with streaming. Yields event dicts for SSE."""
        self.messages.append({"role": "user", "content": user_message})

        for turn in range(self.max_turns):
            self.turn_count = turn + 1
            formatted = self._get_formatted_messages()
            collected_text = ""
            collected_tool_calls: list[ToolCall] = []
            collected_reasoning = ""

            yield {"type": "turn_start", "turn": turn + 1}

            for event_type, data in self.provider.chat_stream(formatted, TOOLS):
                if event_type == "text":
                    collected_text += data
                    yield {"type": "text", "content": data}
                elif event_type == "tool_call":
                    collected_tool_calls.append(data)
                    yield {
                        "type": "tool_call",
                        "name": data.name,
                        "arguments": data.arguments,
                    }
                elif event_type == "reasoning":
                    collected_reasoning = data
                elif event_type == "done":
                    pass  # handled below

            # Build response from collected data
            response = LLMResponse(
                text=collected_text or None,
                tool_calls=collected_tool_calls or None,
                done=len(collected_tool_calls) == 0,
                reasoning_content=collected_reasoning or None,
            )
            self._append_assistant(response)

            if response.done:
                yield {"type": "done", "content": response.text or ""}
                return

            # Execute tools
            auto_retry_hint = None
            for tc in response.tool_calls:
                yield {"type": "tool_exec_start", "name": tc.name}
                result = execute_tool(tc, self.workspace, self.current_dir)
                self._append_tool_result(tc, result)

                # Auto-retry logic: if execute_python failed, inject guidance
                if self._should_auto_retry(tc, result):
                    key = tc.id
                    self._consecutive_failures[key] = self._consecutive_failures.get(key, 0) + 1
                    if self._consecutive_failures[key] <= MAX_AUTO_RETRIES:
                        yield {
                            "type": "auto_fix",
                            "attempt": self._consecutive_failures[key],
                            "max": MAX_AUTO_RETRIES,
                        }
                        # 记录提示，等所有 tool result 添加完后再插入
                        auto_retry_hint = (
                            f"The previous execute_python failed (attempt {self._consecutive_failures[key]}/{MAX_AUTO_RETRIES}). "
                            "Read the error traceback carefully, fix the code, and try again. "
                            "Common fixes: check column names with read_excel first, handle encoding issues, check file path."
                        )
                else:
                    # Reset failure count on success
                    if tc.id in self._consecutive_failures:
                        del self._consecutive_failures[tc.id]

                yield {
                    "type": "tool_exec_end",
                    "name": tc.name,
                    "result": result[:500],  # truncate for display
                }

            # 所有 tool result 添加完后再插入 user hint
            if auto_retry_hint:
                self.messages.append({"role": "user", "content": auto_retry_hint})

                yield {
                    "type": "tool_exec_end",
                    "name": tc.name,
                    "result": result[:500],  # truncate for display
                }

        yield {"type": "max_turns", "content": "Reached maximum turns."}
