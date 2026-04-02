# Как починить подключения в Make.com

Чтобы Claude мог отправлять сообщения через Gmail и WhatsApp, нужно обновить подключения.

---

## Gmail — Переавторизация

1. Зайдите на https://www.make.com и войдите в аккаунт
2. В левом меню нажмите **Connections** (Подключения)
3. Найдите подключение **"My Google Restricted connection"**
4. Рядом с ним будет значок ⚠️ — нажмите на него
5. Нажмите **Reauthorize** (Переавторизовать)
6. Войдите в свой Google аккаунт
7. Разрешите доступ

После этого Claude сможет отправлять email через Gmail.

---

## WhatsApp Business — Переподключение

1. В Make.com зайдите в **Connections**
2. Найдите подключение **WhatsApp Business Cloud**
3. Нажмите **Reauthorize** или **Reconnect**
4. Следуйте инструкциям для входа в WhatsApp Business

⚠️ WhatsApp Business Cloud требует бизнес-аккаунт в Meta Business Suite.
Если у вас нет бизнес-аккаунта — создайте его на https://business.facebook.com

После этого Claude сможет отправлять WhatsApp сообщения блогерам.

---

## Проверка

После переавторизации напишите Claude:
- "Отправь тестовое письмо на мой email" — для проверки Gmail
- "Отправь тестовое сообщение в WhatsApp на мой номер" — для проверки WhatsApp
