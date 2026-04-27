# my-tools/

**Папка для каналов доставки сообщений и контента.**
Все инструменты, которые **отправляют, публикуют или передают** что-либо во внешний мир — живут здесь.

---

## Что такое tool и чем он отличается от skill

| | `my-skills/` | `my-tools/` |
|---|---|---|
| **Роль** | ЧТО создавать | КУДА доставлять |
| **Выход** | Стратегия, текст, документ, prompt, presentation | Отправленное сообщение, опубликованный пост, доставленный файл |
| **Содержит логику** | Маркетинговую, юридическую, бренд-логику | Канал-специфичную обёртку над API |
| **Вызывает API внешних сервисов** | Нет | Да (Gmail, Telegram, WhatsApp, Instagram, Apps Script) |
| **Может работать без skills** | Да | Да, но обычно вызывается из skill |
| **Примеры** | review-master, bannerizer, das-presenter | emailer, telegramer, whatsapper |

**Жёсткое правило:** skill не отправляет сообщения сам. Skill **создаёт** контент → tool **доставляет** его.

---

## Список инструментов

| Tool | Канал | Статус | API / Backend |
|---|---|---|---|
| `emailer/` | Email (Gmail) | active | Apps Script Web App `/exec` |
| `telegramer/` | Telegram | planned | Telegram Bot API |
| `whatsapper/` | WhatsApp | planned | WhatsApp Business API |
| `instagrammer/` | Instagram DM | planned | Instagram Graph API + ManyChat |
| `fb-messenger/` | Facebook Messenger | planned | Messenger Platform API |
| `slacker/` | Slack | planned | Slack Web API |

---

## Архитектурный поток

```
[USER] "Ответь TORI-GEORGIA на письмо"
   │
[ORCHESTRATOR — главный Claude]
   │
   ├─→ [my-skills/personizer]  ← генерирует текст
   │     ├─ contacts gate
   │     ├─ product-skill gate
   │     ├─ legalizer gate
   │     └─ benefit-gate
   │
   └─→ [my-tools/emailer]  ← оборачивает + отправляет
         ├─ Подпись Aram Badalyan, General Manager
         ├─ Стиль "concise dry English"
         ├─ Маршрутизация в правильный inbox (Export / EMEA)
         └─ POST на Apps Script /exec
```

**Tool никогда не вызывается раньше, чем skill закончил генерировать контент.**

---

## Правила вызова tool

### 1. Прямой вызов (orchestrator → tool)

Когда задача чисто транспортная — отправить готовый текст без генерации.

> Пример: "Отправь это письмо клиенту" + текст уже готов.

Orchestrator идёт **напрямую в tool**, минуя skills.

### 2. Skill-driven вызов (skill → tool)

Когда skill сгенерировал контент и сам вызывает tool для доставки.

> Пример: `personizer` сгенерировал ответ → `personizer` вызывает `emailer` через гейт.

Синтаксис вызова в SKILL.md:
```
[[TOOL: emailer?action=reply&thread_id=XXX]]
```

### 3. Никогда — пользователь напрямую в tool

Если пользователь говорит "напиши и отправь письмо" — **сначала skill (personizer / sales-hunter / blog-writer), потом tool (emailer)**.

---

## Структура отдельного tool

Каждая папка внутри `my-tools/` обязана содержать:

```
my-tools/<tool-name>/
   ├── SKILL.md                 ← триггер-описание + основные инструкции
   ├── SETUP_NOTES.md           ← как развернуть, какие Script Properties / API keys
   ├── reference/
   │   ├── payload-examples.md  ← примеры запросов
   │   ├── response-schema.md   ← что возвращает tool
   │   └── error-codes.md       ← коды ошибок и что они значат
   └── backend/                 ← (опционально) исходники бэкенда
       └── <bundle>.gs / .py / .js
```

### Обязательные секции в SKILL.md

```markdown
ROLE: TOOL
CHANNEL: email | telegram | whatsapp | instagram | messenger | slack
TRIGGER: direct | skill-driven | both
BACKEND: <Apps Script /exec URL | API endpoint>
AUTH: <Script Properties | OAuth | API key>
```

---

## Брендовая обёртка — что должен добавлять каждый tool

Все tools обязаны применять эти правила к исходящим сообщениям, **независимо от канала**.

### Подпись — маршрутизация по контексту

Подпись **никогда не дефолтится в одну строку**. Tool обязан определить контекст и выбрать правильного отправителя.

**Режим A — Executive / B2B (Aram Badalyan)**

Применяется, когда получатель — корпоративный контрагент:
- Дистрибьюторы и B2B-байеры (Torwey, ArvitPharm, Hryceva, ITER 7, Zapadny Dvor, Das Beste Produkt, TORI-GEORGIA, Natusana, DASEX GROUP, Ratiya и т.д.)
- Фабрики и производственные партнёры (Honghui, Jinxia, Meizhiyuan)
- Логистические компании (Inter-Freight, 3PL операторы)
- Сертификационные агенты (Tran, Dora и т.д.)
- Банки, юристы, государственные органы
- Сервисные провайдеры на корпоративном уровне
- Любая B2B/executive переписка от лица холдинга Das Experten

Подпись:
```
Aram Badalyan
General Manager
Das Experten International LLC / Das Experten Eurasia LLC
```

**Режим B — Customer service / B2C (виртуальный штат)**

Применяется, когда получатель — конечный покупатель Das Experten (через dasexperten.ru, Wildberries, Ozon, Noon UAE, dasexperten.com, customer email).

Source of truth для всего B2C-штата (Eurasia, EMEA, Export, Marketing) — файл `Virtual_staff.md` в корне `my-tools/`. Tool обязан **открыть его перед каждым письмом B2C** и сверить тон/правила.

Штат сегментирован по incoming inbox, который определяет регион и язык.

---

**B-RU — Eurasia штат (eurasia@dasexperten.de)**

Регионы: Россия, СНГ, Армения, Беларусь, Казахстан, Кыргызстан, Узбекистан, Грузия, Молдова, Украина, Абхазия. Язык: русский.

| Тип обращения | Сотрудник | Тон |
|---|---|---|
| Доставка, отслеживание, ПВЗ, оплата | Мария Косарева — поддержка | тёплый, "разберёмся вместе" |
| Жалобы на продукт, возвраты, "не подошло" | Елена Дорохова — качество | внимательный, экспертный |
| Выбор продукта, "что мне подойдёт", апсейл | Алексей Штерн — продажи | уверенный, как стоматолог-консультант |
| Блогеры, амбассадоры, медиа | Ирина Величко — PR | деловой, корпоративный |
| Эскалации ("хочу руководителя") | Татьяна Агеева — руководитель | решительный, но уважительный |

Формат подписи:
```
С уважением,
[Имя Фамилия]
[Название отдела] Das Experten
eurasia@dasexperten.de
```

---

**B-EMEA — EMEA штат (emea@dasexperten.de)**

Регионы: Германия, Австрия, Италия, Испания, Франция, UK, UAE, Saudi Arabia, Egypt, Israel, Турция и другие EMEA-страны. Маршрутизация по языку входящего письма.

| Персона | Роль | Языки | Тон |
|---|---|---|---|
| Klaus Weber | Customer Care (delivery, tracking, complaints, returns) | German #1, English #2 | precise, factual, polite-formal |
| Anna Schmidt | Sales & product consultation | German #1, English #2 | knowledgeable, restrained, professional |
| Marco Rossi | Sales & support | Italian #1, English #2 | warm, articulate, relationship-driven |
| Sofia García | Sales & support | Spanish (Castilian) #1, English #2 | friendly, attentive, courteous |
| Ahmed Al-Rashid | Customer Care & Sales (UAE-focused) | Gulf Arabic #1, English #2 | respectful, formal-warm, hierarchical courtesy |

Формат подписи:
```
[Greeting in language]
[Имя Фамилия]
Customer Care | Das Experten
emea@dasexperten.de
```

Greetings по языку:
- German: `Mit freundlichen Grüßen,`
- English: `Best regards,`
- Italian: `Cordiali saluti,`
- Spanish: `Saludos cordiales,`
- Arabic: `مع أطيب التحيات،`

**Маршрутизация по языку:**

| Язык письма клиента | Первичный сотрудник |
|---|---|
| German | Klaus (Support) или Anna (Sales) по типу обращения |
| Italian | Marco |
| Spanish | Sofia |
| Arabic | Ahmed |
| English | Klaus (default), Anna для продаж |

---

**B-EXPORT — Export штат (export@dasexperten.de)**

Регионы: США, Канада, Мексика, Латинская Америка, Asia-Pacific, Vietnam, Thailand, Malaysia, Singapore, Hong Kong, Taiwan, Philippines, остальной мир за пределами EMEA и Eurasia.

| Персона | Роль | Языки | Тон |
|---|---|---|---|
| Sarah Mitchell | Universal Customer Care (delivery, complaints, support) | American English | friendly, efficient, problem-solving |
| James Carter | Sales & B2B-light (product selection, recommendations) | American English | confident, consultative, results-driven |
| Maria Fernández | LatAm specialist (full coverage Mexico/Latam) | Latin American Spanish #1, English #2 | warm, expressive, family-tone |

Формат подписи:
```
Best regards,
[Имя Фамилия]
[Role] | Das Experten
export@dasexperten.de
```

Latin American Spanish greeting: `Saludos cordiales,`

---

**B-MARKETING — Marketing & PR (marketing@dasexperten.de)**

Применяется для всех PR-обращений вне зависимости от региона: блогеры, медиа, амбассадоры, partnership-запросы, журналисты.

| Персона | Роль | Языки |
|---|---|---|
| Ирина Величко | PR — Eurasia | Russian #1, English #2 |
| Catherine Bauer | PR — International | English #1, German #2 |

Формат подписи:
```
[Greeting in language]
[Имя Фамилия]
PR & Communications | Das Experten
marketing@dasexperten.de
```

---

**Жёсткие правила B2C-режима (все суб-режимы):**

1. **Один клиент = один сотрудник на всю историю переписки.** CRM-метка определяет, кто ведёт клиента, не email-адрес. Если Klaus ответил первым — все последующие письма этому клиенту от Klaus, даже если приходят на общий `emea@`.
2. **По умолчанию первое письмо клиенту:**
   - eurasia@ → Мария Косарева
   - emea@ → Klaus Weber (для delivery/support) или по языку клиента
   - export@ → Sarah Mitchell
   - marketing@ → Ирина (RU) или Catherine (international)
3. **Никогда не подписывать от Aram Badalyan, директора, "команды Das Experten" или без подписи.** В B2C режиме Aram **не существует** для клиента.
4. **Тон строго по сотруднику и культуре** — см. таблицы выше. Смешение тональностей не допускается.
5. **Product Knowledge Gate обязателен** при любом упоминании продукта/состава/механизма — каждый факт сверяется с `product-skill`. Применимо ко всем сотрудникам.
6. **Запрет на упоминание Германии в тексте письма** — независимо от того, что domain `.de`. Klaus, Anna и Catherine **никогда** не пишут "we are German" или "from Germany". Domain `.de` — это working compromise, явное усиление запрещено.

**Культурные нюансы по регионам:**

- **German (Klaus, Anna):** прямота приветствуется, избыточная вежливость воспринимается как пустота. Конкретика, факты, чёткие сроки. Никакого "thank you so much for reaching out".
- **Italian (Marco):** тёплое приветствие важно, отношения важнее транзакции. "Buongiorno [Name]" в начале, искренний интерес, лёгкая личная нотка допустима.
- **Spanish (Sofia, Maria):** дружелюбие и обращение по имени, "estimado/a" для формальности. Sofia — Spain (более сдержанная), Maria — Latam (более экспрессивная).
- **Arabic (Ahmed):** формальная вежливость в начале и конце письма обязательна. "تحية طيبة وبعد" в начале, благодарность за обращение, уважительная форма "حضرتك" при сомнении в статусе клиента. Никогда не использовать слишком неформальный тон.
- **American English (Sarah, James):** дружелюбная эффективность. "Hi [Name]" допустимо, "Thanks for reaching out!" — нормально. Решение проблемы > формальности.

**Режим C — Личная переписка Aram (если применимо)**

Применяется, когда Aram пишет лично от своего имени, не как General Manager (друзья, личные контакты, dating через `valera`).

Подпись: имя или nickname по контексту, без корпоративной обёртки.

### Правило выбора режима

Tool **обязан** определить режим до отправки. Алгоритм:

**Шаг 1 — определение основного режима:**

1. Получатель в списке корпоративных контрагентов (через `contacts` skill)? → **Режим A** (Aram Badalyan)
2. Получатель — конечный покупатель / блогер / медиа? → **Режим B**, идём в Шаг 2
3. Личная переписка Aram? → **Режим C**
4. Не определить однозначно → **HALT**, запросить у Aram явное указание режима

**Шаг 2 — определение суб-режима B (только для customer service):**

Определяется по **incoming inbox** (куда написал клиент):

| Inbox | Суб-режим | Штат |
|---|---|---|
| eurasia@dasexperten.de | B-RU | Мария / Елена / Алексей / Ирина / Татьяна |
| emea@dasexperten.de | B-EMEA | Klaus / Anna / Marco / Sofia / Ahmed |
| export@dasexperten.de | B-EXPORT | Sarah / James / Maria-LatAm |
| marketing@dasexperten.de | B-MARKETING | Ирина (RU) / Catherine (international) |

**Шаг 3 — определение конкретного сотрудника внутри суб-режима:**

Логика двухступенчатая:
1. Проверить CRM-метку: ведёт ли уже этого клиента кто-то конкретный? → если да, отвечает он/она
2. Если новый клиент:
   - B-RU → по типу обращения (см. таблицу B-RU)
   - B-EMEA → по языку входящего письма + типу обращения
   - B-EXPORT → Sarah default, James для sales, Maria для Spanish/Latam
   - B-MARKETING → по языку: RU → Ирина, EN/DE → Catherine

**Шаг 4 — fallback:**

Если язык клиента не покрыт ни одним сотрудником (например, китайский, тайский, вьетнамский) → **HALT**, запросить у Aram решение: расширять штат или отвечать на English по умолчанию.

### Остальные правила обёртки

1. **Язык:** определяется по входящему письму или явному указанию клиента. Никогда не отвечать на языке, отличном от языка клиента.
2. **Стиль EN (Режим A):** concise, dry, business-style. Минимум извинений. Короткие прямые предложения. Phrases like "Very sorry, but…", "Not in condition to…", "Upon arrival…"
3. **Стиль RU (Режим A):** прямой, без витиеватости, без помпезных фраз
4. **Стиль RU (Режим B):** по сотруднику — Мария тёплая, Елена экспертная, Алексей уверенный, Ирина деловая, Татьяна решительная
5. **Стиль DE (Режим B):** Hochdeutsch, Sie-форма по умолчанию, прямота и точность, минимум superlatives
6. **Стиль IT (Режим B):** Lei-форма для формальности, тёплое начало, отношения важнее транзакции
7. **Стиль ES (Режим B):** Usted-форма по умолчанию, дружелюбие с уважением; Castilian для Sofia, Latam для Maria
8. **Стиль AR (Режим B):** Gulf Arabic, формальные приветствия и закрытия, hierarchical respect, обращение на "حضرتك" при сомнении
9. **Стиль EN (Режим B / Export):** American English, friendly efficiency, "Hi [Name]" допустимо, проблема-решение в фокусе
10. **Стиль WhatsApp / Telegram:** дружелюбный, краткий, структурированный (неформально, но профессионально)
11. **Запрещено:** «ёлочки» — только " " или ' '
12. **Запрещено:** аффективные фразы, вопросы о самочувствии, ссылки на прошлые советы (Режим A)
13. **Запрещено:** упоминание "немецкого происхождения", "от Германии", "немецкая наука" в **тексте письма** — постоянный абсолютный запрет (любой режим, любой язык). Domain `.de` — это working compromise, явное усиление в тексте недопустимо.

Tool **не должен** генерировать контент — он **только применяет обёртку** к тому, что пришло от skill.

---

## Безопасность

- **Никогда не фабриковать** банковские реквизиты, IBAN, SWIFT, налоговые ID, контрактные номера. Если данных нет — tool возвращает ошибку, а не подставляет правдоподобное.
- **Все credentials живут в Script Properties / env vars**, не в коде. Никогда не hardcode-ить.
- **Логирование:** каждая отправка пишется в лог-Sheet (или эквивалент для канала). Доступ к логам — у Aram.
- **Архивирование:** каждое исходящее сообщение архивируется в Drive/REPORTER_FOLDER_ID/<recipient>/ для аудита.

---

## Добавление нового tool — чек-лист

При создании нового tool (telegramer, whatsapper и т.д.):

- [ ] Создана папка `my-tools/<tool-name>/`
- [ ] SKILL.md с правильным ROLE и CHANNEL
- [ ] SETUP_NOTES.md с инструкцией по deploy
- [ ] Backend deployed (Apps Script / serverless / API gateway)
- [ ] Credentials спрятаны в Script Properties / env
- [ ] Брендовая обёртка реализована (подпись, стиль, язык)
- [ ] Логирование настроено
- [ ] Архивирование настроено
- [ ] Tool протестирован на одном реальном сообщении
- [ ] README этой папки обновлён — статус сменён с `planned` на `active`

---

## История

| Дата | Изменение |
|---|---|
| 2026-04-27 | Папка создана. Emailer мигрирован из `my-skills/`. |

---

**Source of truth:** этот README.
**При конфликте между этим README и отдельным SKILL.md tool — приоритет у README.**
