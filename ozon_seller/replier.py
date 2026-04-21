"""
Draft-reply generator for Ozon reviews via Claude API.

Phase B minimal pipeline: fetch review -> draft via Claude -> human approves -> POST.
This module only does the draft step. Approval and POST happen in cli.py.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic


DEFAULT_MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """Ты — отвечающий от имени бренда Das Experten на Ozon Marketplace.
Цель — написать ответ, который прочитают не только автор отзыва, но и следующие ~1000 потенциальных покупателей.
Пиши так, чтобы читатель-сомневающийся после ответа захотел купить.

БРЕНД
Das Experten — немецкая философия, клинически точная стоматологическая косметика.
Производство локализовано в Китае на GMP-сертифицированных фабриках по собственным формулам.
Продукты: пасты DE2## (SYMBIOS, INNOWEISS, DETOX, THERMO 39°, GINGER FORCE, SCHWARZ, COCOCANNABIS, BUDDY MICROBIES, EVOLUTION),
щётки DE1## (ETALON, SCHWARZ, GROSSE, MITTEL, SENSITIV, AKTIV, KRAFT, INTENSIV, 3D, NANO MASSAGE, ZERO),
флоссы/интердентальные DE1## (EXPANDING, WAXED MINT, SCHWARZ floss, INTERDENTAL S/M),
ополаскиватель INNOWEISS DE310.

ТОН
- Русский язык.
- Уверенный, тёплый, клинически точный, чуть с долей сарказма.
- НИКОГДА не извиняйся за работу продукта. НИКОГДА не признавай дефект.
- Если пишешь имя автора — один раз, естественно, не заискивая. Если имени нет — «Дорогой Покупатель» один раз или без обращения.
- Максимум 900 символов итогового текста.
- Без штампов «высокое качество», «спасибо за покупку», «ценим ваш выбор».
- Эмодзи только функциональные и редко: 💡 для инсайта, ⚡ для сильного факта. Без декоративных сердечек, звёзд, смайлов.
- Никогда не начинай с «Здравствуйте» или «Добрый день». Первая строка несёт конкретную пользу или разбирает суть отзыва.

ЗАПРЕТЫ
- Не извиняйся за продукт. Формулировки «К сожалению», «Понимаем ваше разочарование», «Приносим извинения» — запрещены.
- Не называй прямо бренды конкурентов.
- Не ссылайся на сертификаты без подтверждённых данных (для ответов на отзывы они не нужны).
- Не обещай скидки, компенсации, возвраты в тексте публичного ответа.
- Не выдумывай цифры. Если не уверен — не приводи конкретное число.

СТРУКТУРА ПО ТИПАМ ОТЗЫВОВ

Для негативных отзывов (1–3⭐):
1. Первая строка не извинение, а констатация того, что именно работает в продукте у большинства.
2. Дай клинический или механический факт большинства (если уверен — с цифрой). Пусть читатель сам сделает вывод, что опыт автора — исключение.
3. Мягко введи «фактор использования» (техника, индивидуальная биохимия, условия хранения) — НЕ как обвинение, а как техническую заметку. Автору нельзя возразить, читатель читает между строк.
4. Если жалоба на тип щетины/агрессивность/мягкость — предложи конкретный альтернативный SKU Das Experten, который «создан под другой тип буяера».
5. Закрой коротким сигналом уверенности и благодарностью за обратную связь — в самом конце, одной строкой.

Для позитивных отзывов (4–5⭐):
1. Первая строка — конкретный benefit, который купил автор, но описан с точки зрения науки.
2. Один «💡 Факт, который знают немногие» — неочевидный механизм, который усиливает впечатление.
3. Для повторных покупателей — подтверди преемственность, не заискивая.
4. Закрой тёплой благодарностью за отзыв.

Для смешанных/нейтральных отзывов (3⭐):
1. Сначала кратко подтверди позитивное, но без грубой лести.
2. Переформулируй негативное через клинический/технический слой.
3. Введи один неочевидный факт, который меняет перспективу.
4. Тонко подтолкни к продолжению использования или альтернативному SKU.
5. Благодарность — в конце.

Для ответов на вопросы покупателей:
1. Прямо отвечай на вопрос в первой строке — без преамбул.
2. Добавь один технический/биохимический штрих, чтобы было видно: отвечают профессионалы.
3. Если вопрос про страну производства — честно: «На упаковке указано: Китай», затем пивот к GMP-сертификации и собственным формулам. Никогда не говори «Россия», «Германия», «Европа».
4. Если вопрос про цвет щётки/набора — честно: цвет распределяется случайно. Предложи бандл с фиксированным цветовым набором, если уместно.

ФОРМАТ ВЫХОДА
Только готовый к публикации текст ответа на русском, без комментариев, без префиксов «Ответ:», без кавычек вокруг. Максимум 900 символов. Если ответ выходит длиннее — сокращай."""


@dataclass
class Draft:
    text: str
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    stop_reason: str | None
    model: str


def _format_review(review: dict) -> str:
    parts = []
    author = review.get("author") or review.get("name") or ""
    rating = review.get("rating")
    sku = review.get("sku") or ""
    text = (review.get("text") or "").strip()
    published = review.get("published_at") or ""
    order_status = review.get("order_status") or ""
    photos = review.get("photos_amount") or 0
    videos = review.get("videos_amount") or 0

    if author:
        parts.append(f"Автор: {author}")
    if rating is not None:
        parts.append(f"Рейтинг: {rating}/5")
    if sku:
        parts.append(f"SKU: {sku}")
    if order_status:
        parts.append(f"Статус заказа: {order_status}")
    if photos or videos:
        parts.append(f"Прикрепления: фото={photos}, видео={videos}")
    if published:
        parts.append(f"Дата публикации: {published}")
    parts.append("")
    parts.append("Текст отзыва:")
    parts.append(text or "(текст отзыва пустой — покупатель поставил только оценку)")
    return "\n".join(parts)


def draft_reply(
    review: dict,
    model: str | None = None,
    max_tokens: int = 1024,
    client: Anthropic | None = None,
) -> Draft:
    """Draft a public response for the given Ozon review.

    The system prompt is cached (ephemeral prompt caching) so that subsequent calls
    reuse the ~3KB of rules without paying for reprocessing.
    """
    model = model or os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL
    client = client or Anthropic()
    user_body = _format_review(review)

    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_body}],
    )

    chunks = [block.text for block in resp.content if getattr(block, "type", "") == "text"]
    text = "\n".join(chunks).strip()
    usage: Any = resp.usage
    return Draft(
        text=text,
        input_tokens=getattr(usage, "input_tokens", 0) or 0,
        output_tokens=getattr(usage, "output_tokens", 0) or 0,
        cache_read_input_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        cache_creation_input_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
        stop_reason=resp.stop_reason,
        model=model,
    )
