"""Shared LLM helper — direct OpenRouter + provider-specific calls, replaces emergentintegrations.llm.chat."""
import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions"

MODEL_COSTS = {
    "google/gemini-2.0-flash-lite-001": {"input": 0.075e-6, "output": 0.3e-6},
    "google/gemini-2.0-flash-001": {"input": 0.15e-6, "output": 0.6e-6},
    "openai/gpt-4o-mini": {"input": 0.15e-6, "output": 0.6e-6},
    "openai/gpt-4o": {"input": 2.5e-6, "output": 10e-6},
    "anthropic/claude-3-haiku": {"input": 0.25e-6, "output": 1.25e-6},
    "anthropic/claude-sonnet-4": {"input": 3e-6, "output": 15e-6},
    "anthropic/claude-opus-4": {"input": 15e-6, "output": 75e-6},
}

def _model_key(model: str) -> str:
    for k in sorted(MODEL_COSTS, key=len, reverse=True):
        if model.startswith(k):
            return k
    return "openai/gpt-4o-mini"

def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    k = _model_key(model)
    costs = MODEL_COSTS.get(k, {"input": 0.15e-6, "output": 0.6e-6})
    return round(prompt_tokens * costs["input"] + completion_tokens * costs["output"], 6)


async def call_llm(
    system: str,
    prompt: str,
    model: str = "openrouter/free",
    api_key: str = None,
    max_tokens: int = 4096,
    temperature: float = 0.1,
    json_mode: bool = True,
) -> tuple[str, str, str, int, int, float]:
    """Call LLM via OpenRouter. Returns (response_text, provider, model, prompt_toks, completion_toks, cost)."""
    key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("No API key configured for LLM calls")

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("FRONTEND_URL", ""),
    }

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(OPENROUTER_API, headers=headers, json=body)
        if resp.status_code != 200:
            logger.error(f"OpenRouter error {resp.status_code}: {resp.text[:500]}")
            raise RuntimeError(f"LLM call failed ({resp.status_code})")
        data = resp.json()

    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("LLM returned no choices")

    content = choices[0].get("message", {}).get("content", "")
    usage = data.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    cost = estimate_cost(model, prompt_tokens, completion_tokens)
    used_model = data.get("model", model)
    provider = "openrouter"
    if "claude" in used_model:
        provider = "anthropic"
    elif "gpt" in used_model:
        provider = "openai"
    elif "gemini" in used_model:
        provider = "google"

    return content, provider, used_model, prompt_tokens, completion_tokens, cost


async def track_ai_usage(session, user_id: str, provider: str, model: str,
                         prompt_tokens: int, completion_tokens: int, cost: float,
                         endpoint: str = "general") -> None:
    from db import AiUsage
    try:
        usage = AiUsage(
            user_id=user_id, date=datetime.now(timezone.utc),
            prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
            cost=cost, provider=provider, endpoint=endpoint,
        )
        session.add(usage)
        await session.commit()
    except Exception as e:
        logger.warning(f"AI usage tracking failed: {e}")


def parse_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        start = t.find("{")
        end = t.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(t[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise ValueError("Could not parse JSON from LLM response")
