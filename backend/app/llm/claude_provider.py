from __future__ import annotations
import anthropic
import json
from typing import Any, Generator

from .base import LLMProvider, LLMResponse, ToolCall, ToolDef


class ClaudeProvider(LLMProvider):
    name = "claude"

    def __init__(self, model: str = "claude-haiku-4-5-20251001", api_key: str | None = None, base_url: str | None = None):
        super().__init__(model, api_key, base_url)
        self.client = anthropic.Anthropic(api_key=api_key, base_url=base_url)

    def _convert_tools(self, tools: list[ToolDef]) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": {
                    "type": "object",
                    "properties": t.parameters,
                    "required": [k for k, v in t.parameters.items() if v.get("required", False)],
                },
            }
            for t in tools
        ]

    def _parse_response(self, resp) -> LLMResponse:
        text_parts = []
        tool_calls = []

        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, arguments=block.input)
                )

        done = resp.stop_reason == "end_turn"
        return LLMResponse(
            text="\n".join(text_parts) if text_parts else None,
            tool_calls=tool_calls if tool_calls else None,
            done=done,
        )

    def _build_messages(self, messages: list[dict]) -> tuple[str, list[dict]]:
        system = ""
        chat_msgs = []
        for m in messages:
            if m["role"] == "system":
                system = m["content"]
            else:
                chat_msgs.append(m)
        return system, chat_msgs

    def chat(self, messages: list[dict], tools: list[ToolDef], *, stream: bool = False) -> LLMResponse:
        system, chat_msgs = self._build_messages(messages)
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": chat_msgs,
            "tools": self._convert_tools(tools),
        }
        if system:
            kwargs["system"] = system

        resp = self.client.messages.create(**kwargs)
        return self._parse_response(resp)

    def chat_stream(self, messages: list[dict], tools: list[ToolDef]) -> Generator[tuple[str, Any], None, None]:
        system, chat_msgs = self._build_messages(messages)
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": chat_msgs,
            "tools": self._convert_tools(tools),
        }
        if system:
            kwargs["system"] = system

        with self.client.messages.stream(**kwargs) as stream:
            current_tool_id = None
            current_tool_name = None
            current_tool_args = ""

            for event in stream:
                if event.type == "content_block_start":
                    if event.content_block.type == "tool_use":
                        current_tool_id = event.content_block.id
                        current_tool_name = event.content_block.name
                        current_tool_args = ""
                elif event.type == "content_block_delta":
                    delta = event.delta
                    if delta.type == "text_delta":
                        yield ("text", delta.text)
                    elif delta.type == "input_json_delta":
                        current_tool_args += delta.partial_json
                elif event.type == "content_block_stop":
                    if current_tool_id:
                        try:
                            args = json.loads(current_tool_args) if current_tool_args else {}
                        except json.JSONDecodeError:
                            args = {}
                        yield ("tool_call", ToolCall(id=current_tool_id, name=current_tool_name, arguments=args))
                        current_tool_id = None
                        current_tool_name = None
                        current_tool_args = ""
                elif event.type == "message_stop":
                    yield ("done", None)
