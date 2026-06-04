"""
LLM router for Ozon review/question pipeline.

Routing policy (decided 2026-06-04):
  - review WITH text  -> gpt-5.5 via local `codex exec` (ChatGPT Plus OAuth,
                         auto-refreshing auth on hermes-vps), fallback -> Atlas DeepSeek
  - review WITHOUT text -> DeepSeek V3 via Atlas Cloud (cheap, compact prompt)

Direct DeepSeek API (api.deepseek.com) is NOT used: balance is empty as of
2026-06-04. To switch back, change ATLAS_URL/ATLAS_MODEL/key env.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.request
from dataclasses import dataclass

ATLAS_URL = os.environ.get("ATLAS_URL", "https://api.atlascloud.ai/v1/chat/completions")
ATLAS_MODEL = os.environ.get("ATLAS_MODEL", "deepseek-ai/DeepSeek-V3-0324")
CODEX_BIN = os.environ.get("CODEX_BIN", "codex")
CODEX_MODEL = os.environ.get("CODEX_MODEL", "gpt-5.5")
CODEX_TIMEOUT = int(os.environ.get("CODEX_TIMEOUT", "240"))


@dataclass
class LLMResult:
    text: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0


def call_atlas(system: str, user: str, max_tokens: int = 900,
               temperature: float = 0.4) -> LLMResult:
    key = os.environ.get("ATLASCLOUD_API_KEY")
    if not key:
        raise RuntimeError("ATLASCLOUD_API_KEY is not set")
    payload = {
        "model": ATLAS_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        ATLAS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json",
                 "User-Agent": "das-experten-ozon-replier/1.0"},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf-8"))
    if "choices" not in data:
        raise RuntimeError(f"Atlas error: {str(data)[:300]}")
    usage = data.get("usage") or {}
    text = (data["choices"][0]["message"]["content"] or "").strip()
    if not text:
        raise RuntimeError("Atlas returned empty content")
    return LLMResult(
        text=text,
        provider=f"atlas:{ATLAS_MODEL}",
        input_tokens=int(usage.get("prompt_tokens") or 0),
        output_tokens=int(usage.get("completion_tokens") or 0),
    )


def call_codex(system: str, user: str) -> LLMResult:
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
    """Route one generation call. has_text=False -> cheap engine only."""
    if has_text:
        try:
            return call_codex(system, user)
        except Exception:
            return call_atlas(system, user, max_tokens=max_tokens)
    return call_atlas(system, user, max_tokens=min(max_tokens, 500))
