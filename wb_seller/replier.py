"""
Draft-reply generator for Wildberries feedbacks via Claude API.

Mirrors ozon_seller.replier — same product knowledge base, same model,
same prompt-caching pattern, but platform-specific system prompt and
feedback-formatter (WB has different field names than Ozon).
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from anthropic import Anthropic


def _normalize_wb_sku(supplier_article: str) -> tuple[str, int]:
    """Das Experten WB/Ozon articles encode pack size as trailing 'A's:
        DE101      → (DE101, 1)
        DE203AA    → (DE203, 2)
        DE123AAAA  → (DE123, 4)

    Returns `(base_sku, pack_size)`. If the article has no trailing A's,
    pack_size defaults to 1.
    """
    if not supplier_article:
        return "", 1
    article = supplier_article.strip()
    m = re.match(r"^(.+?)(A+)$", article)
    if m and m.group(1):
        return m.group(1), len(m.group(2))
    return article, 1


DEFAULT_MODEL = "claude-sonnet-4-6"

_SKILLS_BASE = Path(__file__).parent.parent / ".claude" / "skills"


def _load_product_knowledge() -> str:
    parts: list[str] = []
    sku_data = _SKILLS_BASE / "review-master" / "references" / "sku-data.md"
    if sku_data.exists():
        parts.append(sku_data.read_text(encoding="utf-8"))
    ingredients_dir = _SKILLS_BASE / "review-master" / "references" / "ingredients"
    if ingredients_dir.exists():
        for f in sorted(ingredients_dir.glob("DE*.md")):
            parts.append(f.read_text(encoding="utf-8"))
    return "\n\n---\n\n".join(parts)


_PRODUCT_KNOWLEDGE = _load_product_knowledge()

SYSTEM_PROMPT = """Ты — отвечающий от имени бренда Das Experten на Wildberries.
Цель — написать ответ, который прочитают не только автор отзыва, но и следующие ~1000 потенциальных покупателей.
Пиши так, чтобы читатель-сомневающийся после ответа захотел купить.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СПРАВОЧНИК ПРОДУКТОВ DAS EXPERTEN — ЕДИНСТВЕННЫЙ ИСТОЧНИК ФАКТОВ О СОСТАВЕ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

""" + _PRODUCT_KNOWLEDGE + """

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

АРТИКУЛ НА WB ≠ ВСЕГДА БАЗОВЫЙ SKU — ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ

Артикул продавца на маркетплейсе кодирует размер упаковки через хвост из букв «A»:
  DE123         → базовый SKU DE123, 1 шт
  DE123AA       → базовый SKU DE123, 2 шт
  DE123AAAA     → базовый SKU DE123, 4 шт
  DE203AA       → базовый SKU DE203, 2 шт (набор)
  DE203AAAA     → базовый SKU DE203, 4 шт

В данных отзыва ниже ты получишь уже нормализованные поля «Базовый SKU» и «Упаковка: N шт» — используй ИХ (а не «Артикул продавца» с хвостом) для поиска в СПРАВОЧНИКЕ выше.

АБСОЛЮТНЫЙ ЗАПРЕТ:
- НИКОГДА не пиши «такого артикула нет в линейке», «такого SKU у нас не существует», «нет такого товара в ассортименте», «отсутствует в нашем ассортименте», «не наш продукт».
- Если покупатель купил DE###AAAA — это НАШ продукт с базовым SKU DE###, просто в пачке на N штук. Точка.
- Если базовый SKU присутствует в СПРАВОЧНИКЕ выше — продукт в линейке, отвечай по справочнику.
- Если базового SKU НЕТ в СПРАВОЧНИКЕ (редкий случай — возможно новинка не подгружена) — НЕ отрицай существование, отвечай только по тому что известно из названия товара и отзыва, без жёстких клинических цифр.

Когда упаковка > 1 шт — это признак лояльности или подарка («взяли сразу четыре — значит нравится» / «набор на семью»). Можешь мягко упомянуть, если это усиливает ответ.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ВОЗРАСТНЫЕ ОГРАНИЧЕНИЯ — только из данных СПРАВОЧНИКА:
- DE207 BUDDY MICROBIES: 0+ (безопасен для проглатывания)
- DE208 EVOLUTION kids: 3–14 лет
- Все остальные продукты — возрастных данных нет. Никогда не пиши «с X лет» для взрослых продуктов.

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
- Не придумывай ингредиенты и состав — используй ТОЛЬКО данные из СПРАВОЧНИКА выше. Если состав продукта не нужен для ответа — не упоминай.
- Не придумывай возрастные ограничения — только те, что явно указаны выше.
- На Wildberries отдельно учитывай поля «Достоинства» (pros) и «Недостатки» (cons), если они заполнены — покупатели их читают перед основным текстом.

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


def _format_feedback(feedback: dict) -> str:
    prod = feedback.get("productDetails") or {}
    parts: list[str] = []

    author = (feedback.get("userName") or "").strip()
    rating = feedback.get("productValuation")
    product_name = prod.get("productName") or ""
    brand = prod.get("brandName") or ""
    supplier_article = prod.get("supplierArticle") or ""
    nm_id = prod.get("nmId") or ""
    created = feedback.get("createdDate") or ""
    photos = feedback.get("photoLinks") or []
    has_video = bool(feedback.get("video"))

    text = (feedback.get("text") or "").strip()
    pros = (feedback.get("pros") or "").strip()
    cons = (feedback.get("cons") or "").strip()

    if author:
        parts.append(f"Автор: {author}")
    if rating is not None:
        parts.append(f"Рейтинг: {rating}/5")
    if product_name:
        parts.append(f"Товар: {product_name}")
    if brand:
        parts.append(f"Бренд: {brand}")
    if supplier_article:
        base_sku, pack_size = _normalize_wb_sku(supplier_article)
        parts.append(f"Артикул продавца (как на WB): {supplier_article}")
        if base_sku and base_sku != supplier_article:
            parts.append(f"Базовый SKU: {base_sku}")
            parts.append(f"Упаковка: {pack_size} шт")
        elif base_sku:
            parts.append(f"Базовый SKU: {base_sku}")
            parts.append(f"Упаковка: 1 шт")
    if nm_id:
        parts.append(f"nmId: {nm_id}")
    if photos or has_video:
        parts.append(f"Прикрепления: фото={len(photos) if photos else 0}, видео={'да' if has_video else 'нет'}")
    if created:
        parts.append(f"Дата публикации: {created}")

    parts.append("")
    if pros:
        parts.append("Достоинства:")
        parts.append(pros)
        parts.append("")
    if cons:
        parts.append("Недостатки:")
        parts.append(cons)
        parts.append("")
    parts.append("Текст отзыва:")
    parts.append(text or "(текст отзыва пустой — покупатель поставил только оценку)")
    return "\n".join(parts)


def draft_reply(
    feedback: dict,
    model: str | None = None,
    max_tokens: int = 1024,
    client: Anthropic | None = None,
) -> Draft:
    """Draft a public response for the given WB feedback.

    The system prompt is cached (ephemeral prompt caching) so subsequent calls
    reuse the system tokens without reprocessing.
    """
    model = model or os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL
    client = client or Anthropic(timeout=90.0)
    user_body = _format_feedback(feedback)

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
