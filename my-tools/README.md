# my-tools/

**Папка для каналов доставки сообщений и контента.**
Все инструменты, которые **отправляют, публикуют или передают** что-либо во внешний мир — живут здесь.

---

## Что такое tool и чем он отличается от skill

|                                  | `my-skills/`                                              | `my-tools/`                                                |
|----------------------------------|-----------------------------------------------------------|------------------------------------------------------------|
| **Роль**                         | ЧТО создавать                                             | КУДА доставлять                                            |
| **Выход**                        | Стратегия, текст, документ, prompt, presentation          | Отправленное сообщение, опубликованный пост, файл          |
| **Содержит логику**              | Маркетинговую, юридическую, бренд-логику                  | Канал-специфичную обёртку над API                          |
| **Вызывает API внешних сервисов**| Нет                                                       | Да (Gmail, Telegram, WhatsApp, Instagram, Apps Script)     |
| **Может работать без skills**    | Да                                                        | Да, но обычно вызывается из skill                          |
| **Примеры**                      | review-master, bannerizer, das-presenter                  | emailer, telegramer, whatsapper                            |

**Жёсткое правило:** skill не отправляет сообщения сам. Skill **создаёт** контент → tool **доставляет** его.

---

## Список инструментов

| Tool             | Канал               | Статус   | API / Backend                       |
|------------------|---------------------|----------|-------------------------------------|
| `emailer/`       | Email (Gmail)       | active   | Apps Script Web App `/exec`         |
| `telegramer/`    | Telegram            | planned  | Telegram Bot API                    |
| `whatsapper/`    | WhatsApp            | planned  | WhatsApp Business API               |
| `instagrammer/`  | Instagram DM        | planned  | Instagram Graph API + ManyChat      |
| `fb-messenger/`  | Facebook Messenger  | planned  | Messenger Platform API              |
| `slacker/`       | Slack               | planned  | Slack Web API                       |

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

> Пример: «Отправь это письмо клиенту» + текст уже готов.

Orchestrator идёт **напрямую в tool**, минуя skills.

### 2. Skill-driven вызов (skill → tool)

Когда skill сгенерировал контент и сам вызывает tool для доставки.

> Пример: `personizer` сгенерировал ответ → `personizer` вызывает `emailer` через гейт.

Синтаксис вызова в `SKILL.md`:

```
[[TOOL: emailer?action=reply&thread_id=XXX]]
```

### 3. Никогда — пользователь напрямую в tool

Если пользователь говорит «напиши и отправь письмо» — **сначала skill (personizer / sales-hunter / blog-writer), потом tool (emailer)**.

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

### Обязательные секции в `SKILL.md`

```markdown
ROLE: TOOL
CHANNEL: email | telegram | whatsapp | instagram | messenger | slack
TRIGGER: direct | skill-driven | both
BACKEND: <Apps Script /exec URL | API endpoint>
AUTH: <Script Properties | OAuth | API key>
```

---

## Брендовая обёртка — что должен добавлять каждый tool

Все tools обязаны применять эти правила к исходящим сообщениям, **независимо от канала**:

1. **Подпись:** «Aram Badalyan, General Manager» — никогда «Команда» / «Team»
2. **Язык:** русский для русскоязычных получателей; английский для всех остальных по умолчанию
3. **Стиль EN:** concise, dry, business-style. Минимум извинений. Короткие прямые предложения.
4. **Стиль RU:** прямой, без витиеватости, без помпезных фраз
5. **Стиль WhatsApp / Telegram:** дружелюбный, краткий, структурированный (неформально, но профессионально)
6. **Запрещено:** «ёлочки» — только `"..."` или `'...'`
7. **Запрещено:** аффективные фразы, вопросы о самочувствии, ссылки на прошлые советы

Tool **не должен** генерировать контент — он **только применяет обёртку** к тому, что пришло от skill.

---

## Безопасность

- **Никогда не фабриковать** банковские реквизиты, IBAN, SWIFT, налоговые ID, контрактные номера. Если данных нет — tool возвращает ошибку, а не подставляет правдоподобное.
- **Все credentials живут в Script Properties / env vars**, не в коде. Никогда не hardcode-ить.
- **Логирование:** каждая отправка пишется в лог-Sheet (или эквивалент для канала). Доступ к логам — у Aram.
- **Архивирование:** каждое исходящее сообщение архивируется в `Drive/REPORTER_FOLDER_ID/<recipient>/` для аудита.

---

## Добавление нового tool — чек-лист

При создании нового tool (telegramer, whatsapper и т.д.):

- [ ] Создана папка `my-tools/<tool-name>/`
- [ ] `SKILL.md` с правильным ROLE и CHANNEL
- [ ] `SETUP_NOTES.md` с инструкцией по deploy
- [ ] Backend deployed (Apps Script / serverless / API gateway)
- [ ] Credentials спрятаны в Script Properties / env
- [ ] Брендовая обёртка реализована (подпись, стиль, язык)
- [ ] Логирование настроено
- [ ] Архивирование настроено
- [ ] Tool протестирован на одном реальном сообщении
- [ ] README этой папки обновлён — статус сменён с `planned` на `active`

---

## История

| Дата       | Изменение                                              |
|------------|--------------------------------------------------------|
| 2026-04-27 | Папка создана. Emailer мигрирован из репо-корня.       |

---

**Source of truth:** этот README.
**При конфликте между этим README и отдельным `SKILL.md` tool — приоритет у README.**
