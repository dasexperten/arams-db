"""
LLM router for Ozon review/question pipeline.

Routing policy (updated 2026-06-06 — Aram directive):
  - ALL cron LLM tasks (reviews with text, reviews without text, Q&A) run on
    DeepSeek V4 Pro. No exceptions, no codex/gpt-5.5 path.
  - Primary  : direct DeepSeek API (api.deepseek.com, model deepseek-v4-pro).
  - Fallback : Atlas Cloud (deepseek-ai/deepseek-v4-pro) — same engine via gateway,
               used only if the direct call fails.

Models are pinned in code so a stale env value cannot downgrade the engine.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.request
from dataclasses import dataclass

# --- DeepSeek V4 Pro, direct API (primary) ----------------------------------
DEEPSEEK_URL = os.environ.get("DEEPSEEK_URL", "https://api.deepseek.com/v1/chat/completions")
DEEPSEEK_MODEL = "deepseek-v4-pro"  # pinned — Aram directive 2026-06-06

# --- DeepSeek V4 Pro, Atlas Cloud gateway (fallback) ------------------------
ATLAS_URL = os.environ.get("ATLAS_URL", "https://api.atlascloud.ai/v1/chat/completions")
ATLAS_MODEL = "deepseek-ai/deepseek-v4-pro"  # pinned

# --- legacy codex/gpt-5.5 — dead reference code, never called ----------------
CODEX_BIN = os.environ.get("CODEX_BIN", "codex")
CODEX_MODEL = os.environ.get("CODEX_MODEL", "gpt-5.5")
CODEX_TIMEOUT = int(os.environ.get("CODEX_TIMEOUT", "240"))


@dataclass
class LLMResult:
    text: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0


def _chat(url: str, key: str, model: str, system: str, user: str,
          max_tokens: int, temperature: float, provider: str) -> LLMResult:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json",
                 "User-Agent": "das-experten-ozon-replier/1.0"},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf-8"))
    if "choices" not in data:
        raise RuntimeError(f"{provider} error: {str(data)[:300]}")
    usage = data.get("usage") or {}
    text = (data["choices"][0]["message"]["content"] or "").strip()
    if not text:
        raise RuntimeError(f"{provider} returned empty content")
    return LLMResult(
        text=text,
        provider=f"{provider}:{model}",
        input_tokens=int(usage.get("prompt_tokens") or 0),
        output_tokens=int(usage.get("completion_tokens") or 0),
    )


def call_deepseek(system: str, user: str, max_tokens: int = 900,
                  temperature: float = 0.4) -> LLMResult:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")
    return _chat(DEEPSEEK_URL, key, DEEPSEEK_MODEL, system, user,
                 max_tokens, temperature, "deepseek")


def call_atlas(system: str, user: str, max_tokens: int = 900,
               temperature: float = 0.4) -> LLMResult:
    key = os.environ.get("ATLASCLOUD_API_KEY")
    if not key:
        raise RuntimeError("ATLASCLOUD_API_KEY is not set")
    return _chat(ATLAS_URL, key, ATLAS_MODEL, system, user,
                 max_tokens, temperature, "atlas")


def call_codex(system: str, user: str) -> LLMResult:
    """Dead reference code — no longer routed to. Kept for history."""
    prompt = (
        system
        + "\n\n=== ЗАДАЧА ===\n" + user
        + "\n\n=== ФОРМАТ ===\nВыведи ТОЛЬКО готовый текст ответа покупателю."
          " Без рассуждений, без пояснений, без префиксов."
    )
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                     encoding="utf-8") as f:
        f.write(prompt)
        pf = f.name
    out = pf + ".out"
    try:
        with open(pf, encoding="utf-8") as stdin_f:
            subprocess.run(
                [CODEX_BIN, "exec", "--skip-git-repo-check", "-s", "read-only",
                 "-m", CODEX_MODEL, "-o", out, "-"],
                stdin=stdin_f,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=CODEX_TIMEOUT,
                check=True,
                cwd="/tmp",
            )
        with open(out, encoding="utf-8") as f:
            text = f.read().strip()
        if not text:
            raise RuntimeError("codex returned empty last message")
        return LLMResult(text=text, provider=f"codex:{CODEX_MODEL}")
    finally:
        for p in (pf, out):
            try:
                os.unlink(p)
            except OSError:
                pass


def generate(system: str, user: str, has_text: bool,
             max_tokens: int = 1024) -> LLMResult:
    """Route one generation call.

    Every cron LLM task — with or without review text — runs on DeepSeek V4 Pro
    (Aram directive 2026-06-06). Primary: direct DeepSeek API. Fallback: Atlas
    Cloud, same deepseek-v4-pro engine. No codex/gpt-5.5.
    """
    mt = max_tokens if has_text else min(max_tokens, 500)
    try:
        return call_deepseek(system, user, max_tokens=mt)
    except Exception:
        return call_atlas(system, user, max_tokens=mt)
