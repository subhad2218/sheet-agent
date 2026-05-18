from .base import LLMProvider, ToolDef, ToolCall, LLMResponse
from .claude_provider import ClaudeProvider
from .openai_provider import OpenAIProvider


PROVIDERS: dict[str, type[LLMProvider]] = {
    "claude": ClaudeProvider,
    "openai": OpenAIProvider,
    "deepseek": OpenAIProvider,  # DeepSeek is OpenAI-compatible
    "qwen": OpenAIProvider,      # Qwen is OpenAI-compatible
    "ollama": OpenAIProvider,     # Ollama is OpenAI-compatible
}

# Default models and base URLs per provider
PROVIDER_DEFAULTS: dict[str, dict] = {
    "claude": {
        "model": "claude-haiku-4-5-20251001",
        "base_url": None,
    },
    "openai": {
        "model": "gpt-4o-mini",
        "base_url": None,
    },
    "deepseek": {
        "model": "deepseek-chat",
        "base_url": "https://api.deepseek.com/v1",
    },
    "qwen": {
        "model": "qwen-plus",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    "ollama": {
        "model": "gemma4:e4b",
        "base_url": "http://localhost:11434/v1",
    },
}


def create_provider(provider_name: str, api_key: str | None = None, model: str | None = None, base_url: str | None = None) -> LLMProvider:
    if provider_name not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider_name}. Available: {list(PROVIDERS.keys())}")

    defaults = PROVIDER_DEFAULTS.get(provider_name, {})
    cls = PROVIDERS[provider_name]

    return cls(
        model=model or defaults.get("model", ""),
        api_key=api_key,
        base_url=base_url or defaults.get("base_url"),
    )


__all__ = [
    "LLMProvider", "ToolDef", "ToolCall", "LLMResponse",
    "ClaudeProvider", "OpenAIProvider",
    "PROVIDERS", "PROVIDER_DEFAULTS", "create_provider",
]
