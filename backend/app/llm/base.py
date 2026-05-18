from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    text: str | None = None
    tool_calls: list[ToolCall] | None = None
    done: bool = False
    reasoning_content: str | None = None  # DeepSeek thinking mode

    @property
    def assistant_content(self) -> str:
        parts = []
        if self.text:
            parts.append(self.text)
        if self.tool_calls:
            for tc in self.tool_calls:
                parts.append(f"[Tool: {tc.name}({tc.arguments})]")
        return "\n".join(parts) if parts else ""


@dataclass
class ToolDef:
    name: str
    description: str
    parameters: dict[str, Any]


class LLMProvider(ABC):
    name: str = "base"
    model: str = ""

    def __init__(self, model: str, api_key: str | None = None, base_url: str | None = None):
        self.model = model
        self.api_key = api_key
        self.base_url = base_url

    @abstractmethod
    def chat(
        self,
        messages: list[dict],
        tools: list[ToolDef],
        *,
        stream: bool = False,
    ) -> LLMResponse:
        """Send messages and return LLM response. If stream=True, yields partial chunks."""
        pass

    @abstractmethod
    def chat_stream(
        self,
        messages: list[dict],
        tools: list[ToolDef],
    ):
        """Yield (event_type, data) tuples. event_type: 'text'|'tool_call'|'done'."""
        pass
