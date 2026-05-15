"""
telegramer — Telethon FastAPI service

Запускается на Hetzner VPS под systemd. Держит постоянное MTProto-соединение
с Telegram через Telethon, проксирует команды от telegramer-bridge Worker,
пушит входящие в Worker через webhook.

Запуск: uvicorn main:app --host 127.0.0.1 --port 8000

Endpoints:
  GET  /health
  POST /resolve               — резолв @username / +phone / user_id в каноническую форму
  POST /send                  — отправить сообщение
  POST /delete-message        — delete-for-everyone
  POST /notify-self           — пуш в Saved Messages
  POST /mode-updated          — уведомление от Worker что режим чата сменился
  POST /admin/export-encrypted-session  — экспорт зашифрованной сессии для бэкапа
"""

import os
import base64
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from fastapi import FastAPI, Request, HTTPException, Header
from pydantic import BaseModel, Field
from telethon import TelegramClient, events
from telethon.errors import (
    FloodWaitError, UserDeactivatedError, PhoneNumberBannedError,
    PeerIdInvalidError, UsernameNotOccupiedError,
)
from telethon.tl.types import User as TgUser

# ──────── config ────────

API_ID = int(os.environ['TG_API_ID'])
API_HASH = os.environ['TG_API_HASH']
PHONE = os.environ['TG_PHONE']
SESSION_PATH = os.environ.get('USER_DATA_DIR', './data') + '/userbot.session'
WORKER_WEBHOOK_URL = os.environ['WORKER_WEBHOOK_URL']
WORKER_VPS_SECRET = os.environ['TELEGRAMER_VPS_SECRET']
BRIDGE_SECRET = os.environ['TELEGRAMER_BRIDGE_SECRET']
COLD_LIMIT_PER_HOUR = int(os.environ.get('COLD_LIMIT_PER_HOUR', '3'))
RANDOM_DELAY_MIN_SEC = 180  # 3 минуты
RANDOM_DELAY_MAX_SEC = 480  # 8 минут

# ──────── SAFE TEST MODE ────────
# Когда залогинен под личным номером пользователя (а не отдельным userbot'ом),
# отключаем все авто-механизмы чтобы не вмешиваться в обычную переписку.
SAFE_TEST_MODE = os.environ.get('SAFE_TEST_MODE', 'false').lower() == 'true'

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger('telegramer')

# ──────── Telethon client ────────

client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
http_client: Optional[httpx.AsyncClient] = None
me_cache: Optional[TgUser] = None

# Простой rate limit для cold outreach
import time
import random
cold_history: List[float] = []  # timestamps первых сообщений


async def push_webhook(payload: dict):
    """Шлём событие в Cloudflare Worker."""
    if not http_client:
        return
    try:
        r = await http_client.post(
            WORKER_WEBHOOK_URL,
            json=payload,
            headers={'Authorization': f'Bearer {WORKER_VPS_SECRET}'},
            timeout=10.0,
        )
        if r.status_code >= 400:
            log.error(f'webhook POST failed: {r.status_code} {r.text[:200]}')
    except Exception as e:
        log.error(f'webhook push error: {e}')


@client.on(events.NewMessage(incoming=True))
async def on_incoming(event):
    """Hook на ВСЕ входящие сообщения — DM и группы. Группы нужны для bank-statement
    ingest из forum-topic чатов."""
    try:
        sender = await event.get_sender()
        is_dm = isinstance(sender, TgUser)

        # Игнорим только ботов в ЛС. Группы и каналы пропускаем дальше.
        if is_dm and sender.bot:
            return

        from_user = None
        if is_dm:
            from_user = {
                'id': sender.id,
                'username': sender.username,
                'first_name': sender.first_name,
                'last_name': sender.last_name,
                'is_bot': sender.bot,
            }
        else:
            # В группах sender — это участник, не сам чат
            from_user = {
                'id': getattr(sender, 'id', None),
                'username': getattr(sender, 'username', None),
                'first_name': getattr(sender, 'first_name', None),
                'last_name': getattr(sender, 'last_name', None),
                'is_bot': bool(getattr(sender, 'bot', False)),
            }

        # Forum topic id (если чат — forum)
        topic_id = None
        rt = event.message.reply_to
        if rt is not None:
            # В forum-чате верхнее сообщение треда хранится в reply_to_top_id, иначе в reply_to_msg_id
            topic_id = getattr(rt, 'reply_to_top_id', None) or getattr(rt, 'reply_to_msg_id', None)

        await push_webhook({
            'event': 'new_message',
            'tg_msg_id': event.message.id,
            'chat_id': event.chat_id,
            'is_group': not is_dm,
            'topic_id': topic_id,
            'has_media': bool(event.message.media),
            'from_user': from_user,
            'text': event.message.message or '',
            'received_at': event.message.date.astimezone(timezone.utc).isoformat(),
            'has_media': bool(event.message.media),
        })
    except Exception as e:
        log.error(f'on_incoming error: {e}')


@client.on(events.NewMessage(outgoing=True))
async def on_outgoing(event):
    """Hook на исходящие — отлавливаем slash-команды управления."""
    # В safe test mode не реагируем на slash-команды — пользователь под личным аккаунтом
    if SAFE_TEST_MODE:
        return
    try:
        if not me_cache or event.sender_id != me_cache.id:
            return
        text = (event.message.message or '').strip()
        if not text.startswith('/'):
            return

        chat_id = event.chat_id
        # Команды
        if text.startswith('/auto '):
            duration_part = text[6:].strip()
            seconds = parse_duration(duration_part)
            if not seconds:
                return
            until = datetime.now(timezone.utc).timestamp() + seconds
            until_iso = datetime.fromtimestamp(until, tz=timezone.utc).isoformat()
            await delete_own_message(event.message)
            await update_mode_via_worker(chat_id, 'TIMEOUT-AUTO', until_iso)
            await notify_self(f'⏱ Chat {chat_id} → TIMEOUT-AUTO until {until_iso}')

        elif text == '/smart':
            await delete_own_message(event.message)
            await update_mode_via_worker(chat_id, 'SMART-AUTO', None)
            await notify_self(f'🧠 Chat {chat_id} → SMART-AUTO')

        elif text == '/off-hours':
            await delete_own_message(event.message)
            await update_mode_via_worker(chat_id, 'OFF-HOURS-AUTO', None)
            await notify_self(f'🌙 Chat {chat_id} → OFF-HOURS-AUTO')

        elif text == '/full':
            await delete_own_message(event.message)
            # Сохраняем pending FULL — ждём confirm в течение 60с
            full_pending[chat_id] = time.time() + 60
            await notify_self(f'⚠️ /full requested for chat {chat_id}. Send "/full confirm" within 60s to activate.')

        elif text == '/full confirm':
            await delete_own_message(event.message)
            if chat_id in full_pending and full_pending[chat_id] > time.time():
                del full_pending[chat_id]
                await update_mode_via_worker(chat_id, 'FULL-AUTO', None)
                await notify_self(f'🔥 Chat {chat_id} → FULL-AUTO (confirmed)')
            else:
                await notify_self(f'⌛ /full confirm — expired or not requested')

        elif text == '/manual':
            await delete_own_message(event.message)
            await update_mode_via_worker(chat_id, 'MANUAL', None)
            await notify_self(f'✋ Chat {chat_id} → MANUAL')

        elif text == '/status':
            await delete_own_message(event.message)
            # Worker не имеет endpoint для list-all — пушим через VPS-side scan
            # Простой вариант: notify-self с инструкцией
            await notify_self(f'📊 Status query for chat {chat_id} — see Worker logs (/queue/incoming, /chat/{chat_id}/status)')

        elif text.startswith('/pause '):
            duration_part = text[7:].strip()
            seconds = parse_duration(duration_part)
            if not seconds:
                return
            paused_chats[chat_id] = time.time() + seconds
            await delete_own_message(event.message)
            await notify_self(f'⏸ Chat {chat_id} paused for {duration_part}')

    except Exception as e:
        log.error(f'on_outgoing slash-command error: {e}')


full_pending = {}  # chat_id -> expiration timestamp
paused_chats = {}  # chat_id -> until timestamp


async def delete_own_message(message):
    try:
        await message.delete(revoke=True)
    except Exception as e:
        log.error(f'delete_own_message error: {e}')


async def notify_self(text: str):
    if not me_cache:
        return
    try:
        await client.send_message('me', text)
    except Exception as e:
        log.error(f'notify_self error: {e}')


async def update_mode_via_worker(chat_id, mode, until):
    """Callback в Worker через bridge — пересоздаём режим."""
    # Worker primary key — user_id, не chat_id. В личных ЛС они совпадают.
    payload = {'mode': mode}
    if until:
        payload['until'] = until
    try:
        await http_client.post(
            f'{worker_base_url()}/chat/{chat_id}/mode',
            json=payload,
            headers={'Authorization': f'Bearer {BRIDGE_SECRET}'},
            timeout=10.0,
        )
    except Exception as e:
        log.error(f'update_mode_via_worker error: {e}')


def worker_base_url():
    # Worker base URL — выводим из WORKER_WEBHOOK_URL
    return WORKER_WEBHOOK_URL.rsplit('/webhook/incoming', 1)[0]


def parse_duration(s: str) -> Optional[int]:
    """'4h' -> 14400, '2d' -> 172800, '30m' -> 1800"""
    import re
    m = re.match(r'^(\d+)([hdm])$', s.strip())
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2)
    return n * (3600 if unit == 'h' else 86400 if unit == 'd' else 60)


# ──────── FastAPI app ────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client, me_cache
    http_client = httpx.AsyncClient()
    await client.start(phone=PHONE)
    me_cache = await client.get_me()
    log.info(f'Telethon started. Logged in as {me_cache.username} (id={me_cache.id})')
    # Background task: run Telethon client
    task = asyncio.create_task(client.run_until_disconnected())
    yield
    task.cancel()
    await client.disconnect()
    await http_client.aclose()


app = FastAPI(lifespan=lifespan, title='telegramer-service')


def require_bridge_auth(authorization: str = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='missing_auth')
    token = authorization[7:]
    if token != BRIDGE_SECRET:
        raise HTTPException(status_code=401, detail='invalid_secret')


# ──────── models ────────

class ResolveRequest(BaseModel):
    contact: str

class HistoryRequest(BaseModel):
    contact: str
    limit: int = 20

class SendRequest(BaseModel):
    to: str
    text: str
    reply_to_msg_id: Optional[int] = None
    attachments_urls: List[str] = []

class DeleteRequest(BaseModel):
    chat_id: int
    tg_msg_id: int
    revoke: bool = True

class NotifySelfRequest(BaseModel):
    text: str

class ModeUpdatedRequest(BaseModel):
    user_id: int
    mode: dict


# ──────── endpoints ────────

@app.get('/health')
async def health(authorization: str = Header(None)):
    require_bridge_auth(authorization)
    if not me_cache:
        return {'session_active': False, 'username': None, 'user_id': None}
    return {
        'session_active': client.is_connected(),
        'username': me_cache.username,
        'user_id': me_cache.id,
        'first_name': me_cache.first_name,
    }


@app.post('/resolve')
async def resolve_contact(req: ResolveRequest, authorization: str = Header(None)):
    require_bridge_auth(authorization)
    contact = req.contact.strip()

    try:
        entity = await client.get_entity(contact)
    except (UsernameNotOccupiedError, PeerIdInvalidError, ValueError) as e:
        raise HTTPException(status_code=404, detail=f'contact_not_found: {e}')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'resolve_error: {e}')

    if not isinstance(entity, TgUser):
        raise HTTPException(status_code=400, detail='not_a_user')

    display = f"{entity.first_name or ''} {entity.last_name or ''}".strip() or (entity.username or f'user_{entity.id}')
    return {
        'user_id': entity.id,
        'chat_id': entity.id,  # for private chats они равны
        'username': entity.username,
        'display_name': display,
        'phone': entity.phone,
        'is_bot': entity.bot,
    }


@app.post('/chat/history')
async def chat_history(req: HistoryRequest, authorization: str = Header(None)):
    """Returns last N messages from chat with the given contact.
    For Saved Messages pass contact='me'. Limit max 100."""
    require_bridge_auth(authorization)
    contact_raw = req.contact.strip()
    # Strip '#topic' suffix if present — we filter by topic_id after fetching
    if '#' in contact_raw:
        contact_str, _ = contact_raw.split('#', 1)
    else:
        contact_str = contact_raw
    # Coerce numeric ids to int so Telethon can find the channel/supergroup
    try:
        contact = int(contact_str) if contact_str.lstrip('-').isdigit() else contact_str
    except ValueError:
        contact = contact_str
    limit = max(1, min(int(req.limit or 20), 200))

    try:
        entity = await client.get_entity(contact)
    except (UsernameNotOccupiedError, PeerIdInvalidError, ValueError) as e:
        raise HTTPException(status_code=404, detail=f'contact_not_found: {e}')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'resolve_error: {e}')

    own_id = me_cache.id if me_cache else None

    messages = []
    try:
        async for msg in client.iter_messages(entity, limit=limit):
            topic_id = None
            if msg.reply_to is not None:
                topic_id = getattr(msg.reply_to, 'reply_to_top_id', None) or getattr(msg.reply_to, 'reply_to_msg_id', None)
            messages.append({
                'tg_msg_id': msg.id,
                'direction': 'out' if (own_id and msg.sender_id == own_id) else 'in',
                'text': msg.message or '',
                'sent_at': msg.date.astimezone(timezone.utc).isoformat() if msg.date else None,
                'has_media': bool(msg.media),
                'reply_to_msg_id': msg.reply_to.reply_to_msg_id if msg.reply_to else None,
                'topic_id': topic_id,
                'sender_id': msg.sender_id,
            })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'history_error: {e}')

    # iter_messages возвращает в порядке newest-first; реверсим в chronological для удобства чтения
    messages.reverse()
    return {
        'contact': contact,
        'chat_id': entity.id,
        'count': len(messages),
        'messages': messages,
    }


@app.post('/send')
async def send_message(req: SendRequest, authorization: str = Header(None)):
    require_bridge_auth(authorization)

    # Resolve
    try:
        entity = await client.get_entity(req.to)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f'cannot_resolve_to: {e}')

    # Check pause
    if entity.id in paused_chats and paused_chats[entity.id] > time.time():
        raise HTTPException(status_code=423, detail='chat_paused')

    # Random delay before cold outreach — анти-бан
    # (если has prior outgoing — мы это не определим тут, доверяем Worker check)

    try:
        sent_msgs = []
        if req.attachments_urls:
            # Скачиваем файлы и шлём через send_file
            files = []
            for url in req.attachments_urls:
                r = await http_client.get(url, timeout=60.0)
                if r.status_code != 200:
                    continue
                # Сохраняем во временный файл с правильным расширением
                ext = url.rsplit('.', 1)[-1].split('?')[0].lower()
                if len(ext) > 5 or '/' in ext:
                    ext = 'bin'
                tmp_path = f'/tmp/tgsend_{int(time.time()*1000)}.{ext}'
                with open(tmp_path, 'wb') as f:
                    f.write(r.content)
                files.append(tmp_path)
            if files:
                msg = await client.send_file(
                    entity,
                    files,
                    caption=req.text,
                    reply_to=req.reply_to_msg_id,
                )
                sent_msgs = msg if isinstance(msg, list) else [msg]
                # cleanup
                for p in files:
                    try: os.remove(p)
                    except: pass
            else:
                # Не удалось скачать ни один — fallback: текст без вложений
                msg = await client.send_message(entity, req.text, reply_to=req.reply_to_msg_id)
                sent_msgs = [msg]
        else:
            msg = await client.send_message(entity, req.text, reply_to=req.reply_to_msg_id)
            sent_msgs = [msg]

        primary = sent_msgs[0]
        return {
            'tg_msg_id': primary.id,
            'chat_id': entity.id,
            'sent_at': primary.date.astimezone(timezone.utc).isoformat(),
        }
    except FloodWaitError as e:
        raise HTTPException(status_code=423, detail={'error': 'flood_wait', 'retry_after': e.seconds})
    except (UserDeactivatedError, PhoneNumberBannedError) as e:
        # Критично — алерт
        log.critical(f'ACCOUNT BANNED OR DEACTIVATED: {e}')
        await emergency_alert(str(e))
        raise HTTPException(status_code=403, detail='account_banned')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'send_error: {e}')


@app.post('/delete-message')
async def delete_message(req: DeleteRequest, authorization: str = Header(None)):
    require_bridge_auth(authorization)
    try:
        await client.delete_messages(req.chat_id, [req.tg_msg_id], revoke=req.revoke)
        return {'status': 'deleted'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'delete_error: {e}')


@app.post('/notify-self')
async def notify_self_endpoint(req: NotifySelfRequest, authorization: str = Header(None)):
    require_bridge_auth(authorization)
    await notify_self(req.text)
    return {'status': 'sent'}


@app.post('/mode-updated')
async def mode_updated(req: ModeUpdatedRequest, authorization: str = Header(None)):
    require_bridge_auth(authorization)
    # Здесь можно реагировать на смену режима в realtime (например, обработать pending входящее)
    # MVP: просто логируем
    log.info(f'Mode for user {req.user_id} -> {req.mode}')
    return {'status': 'noted'}


@app.post('/admin/export-encrypted-session')
async def export_encrypted_session(authorization: str = Header(None)):
    require_bridge_auth(authorization)
    import subprocess
    passphrase_file = os.environ.get('GPG_PASSPHRASE_FILE', '/home/telegramer/.gpg_pass')
    if not os.path.exists(passphrase_file):
        raise HTTPException(status_code=500, detail='gpg_passphrase_file_missing')

    out_path = SESSION_PATH + '.export.gpg'
    try:
        subprocess.run(
            ['gpg', '--batch', '--yes', '--symmetric', '--cipher-algo', 'AES256',
             '--passphrase-file', passphrase_file, '--output', out_path, SESSION_PATH],
            check=True, capture_output=True,
        )
        with open(out_path, 'rb') as f:
            encrypted = f.read()
        os.remove(out_path)
        return {'encrypted_session_b64': base64.b64encode(encrypted).decode('ascii')}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f'gpg_error: {e.stderr.decode()[:200]}')

# ──────── models for media/get-file/backfill (added v1.3) ────────

class GetFileRequest(BaseModel):
    chat_id: int
    tg_msg_id: int

class MediaHistoryRequest(BaseModel):
    contact: str                 # @username, +phone, or -100<id> (with optional '#topic_id' suffix)
    limit: int = 100             # max 500
    offset_id: int = 0           # for pagination: pass last seen tg_msg_id
    topic_id: Optional[int] = None  # filter to a specific forum topic
    only_with_media: bool = True


@app.post('/get-file')
async def get_file(req: GetFileRequest, authorization: str = Header(None)):
    """Download a single message's media attachment via Telethon. Returns the
    file as base64 with filename + mime. Cap: ~25 MB per file."""
    require_bridge_auth(authorization)

    try:
        msg = await client.get_messages(req.chat_id, ids=req.tg_msg_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f'message_not_found: {e}')

    if not msg:
        raise HTTPException(status_code=404, detail='message_not_found')
    if not msg.media:
        raise HTTPException(status_code=400, detail='no_media_in_message')

    # Filename + mime extraction
    filename = 'attachment.bin'
    mime_type = 'application/octet-stream'
    doc = getattr(msg, 'document', None)
    if doc is not None:
        mime_type = doc.mime_type or mime_type
        for attr in (doc.attributes or []):
            fn = getattr(attr, 'file_name', None)
            if fn:
                filename = fn
                break
    photo = getattr(msg, 'photo', None)
    if photo is not None and filename == 'attachment.bin':
        filename = f'photo_{msg.id}.jpg'
        mime_type = 'image/jpeg'

    # Download to memory. Telethon supports BytesIO via file=bytes.
    from io import BytesIO
    buf = BytesIO()
    try:
        await client.download_media(msg, file=buf)
    except FloodWaitError as e:
        raise HTTPException(status_code=429, detail=f'flood_wait:{e.seconds}')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'download_error: {e}')

    data = buf.getvalue()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f'file_too_large:{len(data)}')

    return {
        'chat_id': req.chat_id,
        'tg_msg_id': req.tg_msg_id,
        'filename': filename,
        'mime_type': mime_type,
        'size': len(data),
        'data_base64': base64.b64encode(data).decode('ascii'),
    }


@app.post('/chat/media-history')
async def chat_media_history(req: MediaHistoryRequest, authorization: str = Header(None)):
    """Iterate chat history (paginated) and return messages — optionally only
    those carrying media, optionally filtered to a specific forum topic_id."""
    require_bridge_auth(authorization)

    contact_raw = req.contact.strip()
    if '#' in contact_raw:
        contact_str, suffix = contact_raw.split('#', 1)
        # if topic_id not explicitly passed, take it from suffix
        if req.topic_id is None and suffix.isdigit():
            req.topic_id = int(suffix)
    else:
        contact_str = contact_raw

    try:
        contact = int(contact_str) if contact_str.lstrip('-').isdigit() else contact_str
    except ValueError:
        contact = contact_str

    limit = max(1, min(int(req.limit or 100), 500))

    try:
        entity = await client.get_entity(contact)
    except (UsernameNotOccupiedError, PeerIdInvalidError, ValueError) as e:
        raise HTTPException(status_code=404, detail=f'contact_not_found: {e}')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'resolve_error: {e}')

    own_id = me_cache.id if me_cache else None
    messages = []
    last_id = req.offset_id

    iter_kwargs = {'limit': limit}
    if req.offset_id and req.offset_id > 0:
        iter_kwargs['offset_id'] = req.offset_id

    try:
        async for msg in client.iter_messages(entity, **iter_kwargs):
            last_id = msg.id
            if req.only_with_media and not msg.media:
                continue
            t_id = None
            if msg.reply_to is not None:
                t_id = getattr(msg.reply_to, 'reply_to_top_id', None) or getattr(msg.reply_to, 'reply_to_msg_id', None)
            if req.topic_id is not None and t_id != req.topic_id:
                continue

            sender = await msg.get_sender() if msg.sender_id else None
            sender_username = getattr(sender, 'username', None) if sender else None
            sender_name = None
            if sender:
                sender_name = f"{getattr(sender, 'first_name', '') or ''} {getattr(sender, 'last_name', '') or ''}".strip() or None

            # Media metadata
            filename = None
            mime_type = None
            size = None
            doc = getattr(msg, 'document', None)
            if doc is not None:
                mime_type = doc.mime_type
                size = doc.size
                for attr in (doc.attributes or []):
                    fn = getattr(attr, 'file_name', None)
                    if fn:
                        filename = fn
                        break

            messages.append({
                'tg_msg_id': msg.id,
                'direction': 'out' if (own_id and msg.sender_id == own_id) else 'in',
                'text': msg.message or '',
                'sent_at': msg.date.astimezone(timezone.utc).isoformat() if msg.date else None,
                'has_media': bool(msg.media),
                'topic_id': t_id,
                'reply_to_msg_id': msg.reply_to.reply_to_msg_id if msg.reply_to else None,
                'sender_id': msg.sender_id,
                'sender_username': sender_username,
                'sender_name': sender_name,
                'media': {
                    'filename': filename,
                    'mime_type': mime_type,
                    'size': size,
                } if msg.media else None,
            })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'history_error: {e}')

    return {
        'contact': contact_raw,
        'chat_id': entity.id,
        'count': len(messages),
        'last_seen_id': last_id,
        'messages': messages,
    }



async def emergency_alert(reason: str):
    """При банe аккаунта — пушим алерт через rumailer или другой канал."""
    # MVP: лог + healthcheck падает
    log.critical(f'EMERGENCY: {reason}')
    # TODO: вызов rumailer через bridge
