from __future__ import annotations
import json
from typing import Any, Generator

from openai import OpenAI

from .base import LLMProvider, LLMResponse, ToolCall, ToolDef


class OpenAIProvider(LLMProvider):
    """Works with OpenAI, DeepSeek, Qwen, Ollama, and any OpenAI-compatible API."""

    name = "openai"

    def __init__(self, model: str = "gpt-4o-mini", api_key: str | None = None, base_url: str | None = None):
        super().__init__(model, api_key, base_url)
        self.client = OpenAI(api_key=api_key or "not-needed", base_url=base_url)

    def _convert_tools(self, tools: list[ToolDef]) -> list[dict]:
        result = []
        for t in tools:
            props = {}
            required = []
            for k, v in t.parameters.items():
                prop = {"type": v.get("type", "string"), "description": v.get("description", "")}
                if "enum" in v:
                    prop["enum"] = v["enum"]
                if "default" in v:
                    prop["default"] = v["default"]
                props[k] = prop
                if v.get("required", False):
                    required.append(k)

            result.append({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": {
                        "type": "object",
                        "properties": props,
                        "required": required,
                    },
                },
            })
        return result

    def _parse_response(self, resp) -> LLMResponse:
        choice = resp.choices[0]
        msg = choice.message
        text = msg.content if msg.content else None
        reasoning = getattr(msg, 'reasoning_content', None) or getattr(msg, 'reasoning', None)
        tool_calls = None
        if msg.tool_calls:
            tool_calls = [
                ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=json.loads(tc.function.arguments),
                )
                for tc in msg.tool_calls
            ]
        done = choice.finish_reason in ("stop", "length")
        return LLMResponse(text=text, tool_calls=tool_calls, done=done, reasoning_content=reasoning)

    def chat(self, messages: list[dict], tools: list[ToolDef], *, stream: bool = False) -> LLMResponse:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=self._convert_tools(tools),
            max_tokens=4096,
        )
        return self._parse_response(resp)

    def chat_stream(self, messages: list[dict], tools: list[ToolDef]) -> Generator[tuple[str, Any], None, None]:
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=self._convert_tools(tools),
            max_tokens=4096,
            stream=True,
        )

        current_tool_id = None
        current_tool_name = None
        current_tool_args = ""
        collected_reasoning = ""

        for chunk in stream:
            if not chunk.choices:
                continue

            choice = chunk.choices[0]
            delta = choice.delta

            # Collect reasoning_content from DeepSeek thinking models
            rc = getattr(delta, 'reasoning_content', None)
            if rc:
                collected_reasoning += rc

            if delta.content:
                yield ("text", delta.content)

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    # tc.id is only set on the first chunk of a new tool call
                    if tc.id:
                        # Flush previous tool call if any
                        if current_tool_id:
                            try:
                                args = json.loads(current_tool_args) if current_tool_args else {}
                            except json.JSONDecodeError:
                                args = {}
                            yield ("tool_call", ToolCall(id=current_tool_id, name=current_tool_name, arguments=args))

                        current_tool_id = tc.id
                        current_tool_name = tc.function.name if tc.function else None
                        current_tool_args = ""

                    if tc.function and tc.function.arguments:
                        current_tool_args += tc.function.arguments

            # finish_reason: "stop" = done, "tool_calls" = wants to call tools, "length" = hit limit
            finish = choice.finish_reason
            if finish in ("stop", "tool_calls", "length"):
                # Flush pending tool call
                if current_tool_id:
                    try:
                        args = json.loads(current_tool_args) if current_tool_args else {}
                    except json.JSONDecodeError:
                        args = {}
                    yield ("tool_call", ToolCall(id=current_tool_id, name=current_tool_name, arguments=args))
                    current_tool_id = None
                    current_tool_name = None
                    current_tool_args = ""
                # Emit reasoning_content if any (DeepSeek thinking mode)
                if collected_reasoning:
                    yield ("reasoning", collected_reasoning)
                yield ("done", None)
