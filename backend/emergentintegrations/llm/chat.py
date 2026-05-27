"""Multi-provider LLM integration: OpenAI, Anthropic, Gemini, Ollama."""
import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger("llm")

OPENAI_BASE = "https://api.openai.com/v1"
ANTHROPIC_BASE = "https://api.anthropic.com/v1"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
OLLAMA_BASE = "http://localhost:11434"


class UserMessage:
    def __init__(self, text: str):
        self.text = text


class LlmChat:
    def __init__(self, api_key: str = None, session_id: str = None, system_message: str = None):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self.provider = "openai"
        self.model = "gpt-4o-mini"
        self._messages: list[dict] = []
        if system_message:
            self._messages.append({"role": "system", "content": system_message})

    def with_model(self, provider: str, model: str):
        self.provider = provider
        self.model = model
        return self

    async def send_message(self, message: UserMessage) -> str:
        self._messages.append({"role": "user", "content": message.text})
        try:
            if self.provider == "gemini":
                return await self._call_gemini()
            if self.provider == "anthropic":
                return await self._call_anthropic()
            if self.provider == "ollama":
                return await self._call_ollama()
            return await self._call_openai()
        except Exception as e:
            logger.error(f"LLM call failed ({self.provider}): {e}")
            raise

    async def _call_openai(self) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model or "gpt-4o-mini",
            "messages": self._messages,
            "temperature": 0.3,
            "max_tokens": 2048,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{OPENAI_BASE}/chat/completions", headers=headers, json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"OpenAI error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            self._messages.append({"role": "assistant", "content": text})
            return text

    async def _call_anthropic(self) -> str:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        sys_msg = None
        messages = []
        for m in self._messages:
            if m["role"] == "system":
                sys_msg = m["content"]
            else:
                messages.append({"role": m["role"], "content": m["content"]})
        body = {
            "model": self.model or "claude-3-haiku-20240307",
            "max_tokens": 2048,
            "messages": messages,
        }
        if sys_msg:
            body["system"] = sys_msg
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{ANTHROPIC_BASE}/messages", headers=headers, json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"Anthropic error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            text = data["content"][0]["text"]
            self._messages.append({"role": "assistant", "content": text})
            return text

    async def _call_gemini(self) -> str:
        sys_instruction = None
        contents = []
        for m in self._messages:
            if m["role"] == "system":
                sys_instruction = m["content"]
            else:
                role = "user" if m["role"] == "user" else "model"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})
        body = {"contents": contents, "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048}}
        if sys_instruction:
            body["systemInstruction"] = {"parts": [{"text": sys_instruction}]}
        key = self.api_key or os.environ.get("GEMINI_API_KEY", "")
        model = self.model or "gemini-2.0-flash-lite"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{GEMINI_BASE}/models/{model}:generateContent?key={key}", json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            self._messages.append({"role": "assistant", "content": text})
            return text

    async def _call_ollama(self) -> str:
        messages = []
        for m in self._messages:
            role = m["role"]
            if role == "system":
                role = "system"
            else:
                role = "user" if m["role"] == "user" else "assistant"
            messages.append({"role": role, "content": m["content"]})
        body = {
            "model": self.model or "llama3.2",
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.3},
        }
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=body)
            if resp.status_code != 200:
                raise RuntimeError(f"Ollama error {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            text = data["message"]["content"]
            self._messages.append({"role": "assistant", "content": text})
            return text
