# Inbox Routing — Operational Reference

**Source of truth:** `my-tools/Virtual_staff.md` (для конкретных персон, тонов, подписей).
**Этот файл:** алгоритм определения **какая** persona отвечает, **на каком** языке, в **каком** sub-mode.

Emailer применяет 4 шага **детерминированно** — без угадываний. Если на любом шаге результат неоднозначен → HALT и запрос Aram.

---

## Step 1 — Inbox detection

Анализ поля **`To`** входящего письма (или **`From`** исходящего, если уже есть thread).

| Inbox | Sub-mode | Default persona если Step 2-4 не сработали |
|---|---|---|
| `eurasia@dasexperten.de` | **B-RU** | Мария Косарева |
| `emea@dasexperten.de` | **B-EMEA** | Klaus Weber (для EN или unknown language) |
| `export@dasexperten.de` | **B-EXPORT** | Sarah Mitchell |
| `marketing@dasexperten.de` | **B-MARKETING** | Catherine Bauer (EN) / Ирина Величко (RU) |

**Если письмо пришло на любой другой адрес** (например, прямо на `aram@dasexperten.de`) → это **Mode A** (Aram), не Mode B. Дальнейшие шаги не выполняются.

---

## Step 2 — Language detection

Анализ языка **body** письма клиента (не subject — subject часто на английском по умолчанию).

### Признаки языка

| Признаки в тексте | Detected language | Code |
|---|---|---|
| Кириллица + русские слова (привет, здравствуйте, заказ, доставка) | Russian | `ru` |
| Кириллица + украинские маркеры (дякую, добрий день, є, ї) | Ukrainian | `uk` |
| Umlauts (ä ö ü ß) + немецкая лексика (Bestellung, Lieferung, danke) | German | `de` |
| Итальянские артикли (il, la, lo, gli, le) + accented vowels (è, à, ò) | Italian | `it` |
| Spanish ñ + español lexicon (gracias, pedido, ¿, ¡) | Spanish | `es` |
| Arabic script | Arabic | `ar` |
| French articles (le, la, les) + accented (é, è, à, ç) | French | `fr` |
| Turkish dotless ı + ğ ş ç | Turkish | `tr` |
| Plain English без accent marks | English | `en` |
| Не определяется однозначно | Unknown | `unknown` |

### Routing language → persona

**B-RU (eurasia@):**

| Language | Persona |
|---|---|
| `ru`, `uk` (other Slavic) | По типу обращения (Step 3) — Мария / Елена / Алексей / Ирина / Татьяна |
| Иной язык на eurasia@ | HALT — eurasia inbox обрабатывает только русскоязычных, любой другой язык требует уточнения у Aram |

**B-EMEA (emea@):**

| Language | Persona |
|---|---|
| `de` | Klaus (support) или Anna (sales) — по Step 3 |
| `it` | Marco |
| `es` | Sofia (Castilian) |
| `ar` | Ahmed (Gulf Arabic) |
| `en` | Klaus default, Anna для sales |
| `fr`, `tr`, иные | **HALT** — gap в штате, запросить у Aram: ответить на EN через Klaus или ждать расширения штата |

**B-EXPORT (export@):**

| Language | Persona |
|---|---|
| `es` (Latam markers — usted/ustedes плюс mexicano/argentino lexicon) | Maria Fernández |
| `en` | Sarah default, James для sales |
| Иные (vietnamese, thai, malay, chinese, japanese, korean) | **Fallback на EN через Sarah** — explicit fallback, не HALT |

**B-MARKETING (marketing@):**

| Language | Persona |
|---|---|
| `ru` | Ирина Величко |
| `en`, `de`, иные | Catherine Bauer |

---

## Step 3 — Conversation type

Только для **B-RU** (где штат разделён по функциям). Для EMEA/Export/Marketing — Step 3 не нужен, persona уже определена в Step 2.

### Признаки типа обращения в B-RU

| Маркеры в тексте | Тип обращения | Persona |
|---|---|---|
| "где мой заказ", "не пришёл", "ПВЗ", "трек-номер", "доставка", "оплата", "номер телефона" | Delivery / support | **Мария Косарева** |
| "не подошло", "верните деньги", "брак", "плохое качество", "разочарован", "возврат" | Quality / returns | **Елена Дорохова** |
| "какую выбрать", "что лучше для X", "что посоветуете", "хочу заказать", "сколько стоит", "есть ли" | Sales / consultation | **Алексей Штерн** |
| "я блогер", "сотрудничество", "интеграция", "обзор", "PR", "медиа", "журналист" | PR | **Ирина Величко** |
| "хочу руководителя", "это безобразие", "буду жаловаться", "пожалуйтесь моему начальству", "Роспотребнадзор" | Escalation | **Татьяна Агеева** |
| Смешанное / неопределимое | Default | **Мария Косарева** (она передаст профильному коллеге если нужно) |

### Правила приоритета при смешанном обращении

Если в письме несколько типов одновременно (жалоба + вопрос о продукте, выбор + доставка):

```
жалоба/возврат  >  выбор продукта  >  общие вопросы
```

То есть: жалоба + "а ещё посоветуйте новую пасту" → Елена (жалоба приоритетнее).

---

## Step 4 — CRM check (override всех предыдущих шагов)

**Самый важный шаг** — он переопределяет Step 2 и Step 3.

### Проверка существующей переписки

emailer ищет email клиента в `LOG_SHEET` (Script Property `LOG_SHEET_ID`):

```
SELECT recipient, [persona who answered last time]
FROM log_sheet
WHERE recipient = <customer_email>
ORDER BY timestamp DESC
LIMIT 1
```

### Логика

| Результат поиска | Действие |
|---|---|
| Клиент найден, отвечала Klaus | **Klaus продолжает** — независимо от того, что показал Step 2 или Step 3 |
| Клиент найден, отвечала Мария | **Мария продолжает** |
| Клиент не найден (новый клиент) | Применяются Step 2 + Step 3 |
| Клиент найден, но прошло > 6 месяцев | "Тёплый restart" — применяется Step 2/3, но в письме упоминается "ваше прошлое обращение" |

### Передача между сотрудниками

Передача допустима **только** через явное упоминание в тексте письма:
- "Передаю ваш вопрос моей коллеге Елене Дороховой из отдела качества — она ответит вам в ближайшее время"

После передачи — следующее письмо клиенту от **новой persona**, и в LOG_SHEET записывается обновлённая привязка.

---

## Полная блок-схема алгоритма

```
INCOMING EMAIL
   │
   ├─ Step 1: To = eurasia@? ──── sub-mode B-RU
   │          To = emea@?    ──── sub-mode B-EMEA
   │          To = export@?  ──── sub-mode B-EXPORT
   │          To = marketing@? ── sub-mode B-MARKETING
   │          To = иной       ── Mode A (Aram), выход из Mode B логики
   │
   ├─ Step 4 (CRM check, выполняется ПЕРВЫМ внутри Mode B):
   │          Клиент в LOG_SHEET за < 6 мес? 
   │             ├─ Да → продолжает та же persona (FINAL)
   │             └─ Нет → переход к Step 2
   │
   ├─ Step 2: Detect language of body
   │          Routing language → persona внутри sub-mode (см. таблицы выше)
   │             ├─ Persona определена → если sub-mode = B-RU, переход к Step 3
   │             ├─ Persona определена → если sub-mode != B-RU, FINAL
   │             └─ Language unknown / not covered → HALT (или fallback для Export)
   │
   └─ Step 3: Detect conversation type (только для B-RU)
              Routing type → конкретная persona в B-RU
                 ├─ Тип определён → FINAL
                 └─ Тип неоднозначен → Мария Косарева (default)
```

---

## HALT сценарии

emailer **никогда** не дефолтит наугад. При следующих ситуациях возвращает HALT и запрашивает Aram:

1. **Step 1 fail** — `To` не соответствует ни одному из 4 known inbox, и не выглядит как Aram personal (нет в contacts skill).
2. **Step 2 fail в B-RU** — пришло письмо на eurasia@ на не-русском языке.
3. **Step 2 fail в B-EMEA** — язык не покрыт штатом (французский, турецкий, иной).
4. **Step 4 conflict** — CRM показывает одну persona, но клиент явно изменил тип обращения (например, Мария вела клиента по доставке, теперь клиент пишет с жалобой на продукт). В этом случае emailer запрашивает Aram: "продолжать через Марию или передать Елене?".

Формат HALT-сообщения для Aram:

```
HALT — emailer routing requires manual decision.

Incoming email:
  From:    <customer email>
  To:      <inbox>
  Subject: <subject>
  Snippet: <first 200 chars of body>

Detected:
  Sub-mode: <B-RU / B-EMEA / B-EXPORT / B-MARKETING>
  Language: <detected or unknown>
  CRM:      <previous persona or "new customer">
  
Reason for HALT: <specific reason>

Options:
  (a) <option 1>
  (b) <option 2>
  (c) <other>
```

---

## Тестовые кейсы (для валидации алгоритма)

### Test 1: Existing RU customer with new question type

```
From: customer@gmail.com
To: eurasia@dasexperten.de
Body: "Здравствуйте! У меня плохо снимается налёт. Какую пасту посоветуете?"
CRM: 3 месяца назад писал Марии про доставку.

Expected routing:
  Step 1 → B-RU
  Step 4 → Мария (CRM hit)
  Final  → Мария (она передаст вопрос Алексею в письме)
```

### Test 2: New German customer

```
From: thomas@example.de
To: emea@dasexperten.de
Body: "Sehr geehrte Damen und Herren, ich möchte gerne eine Bestellung aufgeben..."
CRM: not found.

Expected routing:
  Step 1 → B-EMEA
  Step 4 → not found
  Step 2 → German detected → Klaus (если support) или Anna (если sales)
  Анализ типа: "möchte eine Bestellung aufgeben" = sales intent
  Final  → Anna Schmidt
```

### Test 3: French customer on emea@ (gap)

```
From: marie@example.fr
To: emea@dasexperten.de
Body: "Bonjour, j'ai reçu votre dentifrice mais j'ai des questions sur les ingrédients..."
CRM: not found.

Expected routing:
  Step 1 → B-EMEA
  Step 4 → not found
  Step 2 → French detected → язык не в штате EMEA
  Final  → HALT с запросом Aram: "ответить EN через Klaus или ждать расширения штата?"
```

### Test 4: Vietnamese customer on export@ (fallback)

```
From: nguyen@example.vn
To: export@dasexperten.de
Body: "Xin chào, tôi muốn hỏi về sản phẩm..."
CRM: not found.

Expected routing:
  Step 1 → B-EXPORT
  Step 4 → not found
  Step 2 → Vietnamese detected → язык не в штате Export, но Export имеет explicit fallback
  Final  → Sarah Mitchell отвечает на EN: "Hello! I noticed your message — could you reply in English so I can assist you better?"
```

---

**Версия:** 1.0 — initial
**Created:** 2026-04-27
