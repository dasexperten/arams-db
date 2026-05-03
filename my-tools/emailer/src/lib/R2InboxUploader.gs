/**
 * R2InboxUploader.gs — uploads Gmail attachment blobs to Cloudflare R2.
 *
 * Script Properties consumed (all four are required at runtime):
 *   R2_ACCOUNT_ID   — Cloudflare account ID
 *   R2_BUCKET       — R2 bucket name  (e.g. emailer-attachments)
 *   R2_PUBLIC_BASE  — public read base URL, trailing slash optional
 *   R2_API_TOKEN    — Cloudflare API token with R2 read+write permissions
 *
 * Path format:  inbox/<YYYY-MM-DD>/<sender_clean>_<filename_clean>_<MMDD>_<xxx>.<ext>
 *   sender_clean   — sanitized display name (or local-part fallback)
 *   filename_clean — sanitized basename without extension
 *   MMDD           — 4-digit month+day, derived from the same date as the folder
 *   xxx            — first 3 hex chars of SHA-256 (collision-prone after ~64 files
 *                    by design; Aram is aware)
 *   .ext           — original extension preserved (lowercased)
 *
 * Dedup:  hash-indexed via dedup/<full_sha256> — small text object containing the
 *         actual key. GET dedup/<sha> first; on 200 read the stored key and
 *         return its public URL. On 404 upload the file then write the index.
 * Size limit: 25 MB. Files above this are returned with skipped_reason:"too_large".
 */

var R2_SIZE_LIMIT_BYTES_ = 25 * 1024 * 1024;
var R2_DEDUP_PREFIX_ = 'dedup/';
var R2_KEY_MAX_PART_LEN_ = 40;

/**
 * uploadInboxAttachmentToR2 — resolves one Gmail attachment against R2.
 *
 * @param {GoogleAppsScript.Gmail.GmailAttachment} attachmentBlob
 * @param {string} originalFilename
 * @param {string} messageDateIso - ISO datetime of the containing message
 * @param {string} senderRaw      - raw From header ("Display <email>" or "<email>")
 * @returns {{
 *   filename:       string,
 *   size_bytes:     number,
 *   mime_type:      string,
 *   r2_url:         string|null,
 *   sha256:         string|null,
 *   skipped_reason: string|null
 * }}
 */
function uploadInboxAttachmentToR2(attachmentBlob, originalFilename, messageDateIso, senderRaw) {
  var filename = String(originalFilename || 'attachment');
  var mimeType = attachmentBlob.getContentType() || 'application/octet-stream';
  var bytes = attachmentBlob.getBytes();
  var sizeBytes = bytes.length;

  if (sizeBytes > R2_SIZE_LIMIT_BYTES_) {
    return {
      filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
      r2_url: null, sha256: null, skipped_reason: 'too_large'
    };
  }

  // SHA-256 → hex string
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var sha256 = digest.map(function (b) {
    var h = (b & 0xFF).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');

  var dateFolder = messageDateIso
    ? String(messageDateIso).slice(0, 10)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');

  var props = PropertiesService.getScriptProperties();
  var accountId = props.getProperty('R2_ACCOUNT_ID');
  var bucket    = props.getProperty('R2_BUCKET');
  var pubBase   = props.getProperty('R2_PUBLIC_BASE');
  var apiToken  = props.getProperty('R2_API_TOKEN');

  if (!accountId || !bucket || !pubBase || !apiToken) {
    var missing = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_PUBLIC_BASE', 'R2_API_TOKEN']
      .filter(function (k) { return !props.getProperty(k); });
    return {
      filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
      r2_url: null, sha256: sha256,
      skipped_reason: 'upload_failed: missing Script Properties: ' + missing.join(', ')
    };
  }

  var apiBase    = 'https://api.cloudflare.com/client/v4/accounts/' + accountId +
                   '/r2/buckets/' + bucket + '/objects/';
  var pubBaseTrim = pubBase.replace(/\/$/, '');
  var authHeader  = { 'Authorization': 'Bearer ' + apiToken };

  // Hash-indexed dedup: GET dedup/<sha> — if present, return URL pointing to the
  // stored key (which may use any historical or future format).
  var dedupKey = R2_DEDUP_PREFIX_ + sha256;
  var dedupUrl = apiBase + encodeURIComponent(dedupKey);
  try {
    var dedupResp = UrlFetchApp.fetch(dedupUrl, {
      method: 'get', headers: authHeader, muteHttpExceptions: true
    });
    if (dedupResp.getResponseCode() === 200) {
      var existingKey = String(dedupResp.getContentText() || '').trim();
      if (existingKey) {
        return {
          filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
          r2_url: pubBaseTrim + '/' + existingKey, sha256: sha256, skipped_reason: null
        };
      }
    }
  } catch (dedupErr) {
    // Network error — fall through to upload attempt
  }

  var r2Key = buildR2Key_(senderRaw, filename, dateFolder, sha256);
  var objectUrl = apiBase + encodeURIComponent(r2Key);
  var publicUrl = pubBaseTrim + '/' + r2Key;

  // PUT upload
  var putResp;
  try {
    putResp = UrlFetchApp.fetch(objectUrl, {
      method: 'put',
      headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': mimeType },
      payload: bytes,
      muteHttpExceptions: true
    });
  } catch (putErr) {
    return {
      filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
      r2_url: null, sha256: sha256,
      skipped_reason: 'upload_failed: ' + String(putErr.message || putErr)
    };
  }

  var putCode = putResp.getResponseCode();
  if (putCode !== 200 && putCode !== 201) {
    return {
      filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
      r2_url: null, sha256: sha256,
      skipped_reason: 'upload_failed: HTTP ' + putCode + ': ' + putResp.getContentText().slice(0, 200)
    };
  }

  // Best-effort write of dedup index — failure here does not break the response.
  try {
    UrlFetchApp.fetch(dedupUrl, {
      method: 'put',
      headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'text/plain' },
      payload: r2Key,
      muteHttpExceptions: true
    });
  } catch (idxErr) {
    // Swallow — file is uploaded; missing index just means next call re-uploads.
  }

  return {
    filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
    r2_url: publicUrl, sha256: sha256, skipped_reason: null
  };
}

/**
 * sanitizeForKey_ — lowercase, replace illegal chars and whitespace with -,
 * collapse runs of -, trim, truncate to maxLength.
 */
function sanitizeForKey_(input, maxLength) {
  var s = String(input == null ? '' : input).toLowerCase();
  s = s.replace(/[\/\\:*?"<>|()\s.]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  if (maxLength && s.length > maxLength) s = s.slice(0, maxLength).replace(/-+$/, '');
  return s;
}

/**
 * extractDisplayName_ — pull display name from a raw From header.
 * Falls back to the local-part of the email when no display name is present.
 * Always returns the sanitized form (or 'unknown' if both sources are empty).
 */
function extractDisplayName_(senderRaw) {
  var raw = String(senderRaw == null ? '' : senderRaw).trim();
  if (!raw) return 'unknown';

  var emailMatch = raw.match(/<\s*([^>]+)\s*>/);
  var emailAddr = emailMatch ? emailMatch[1].trim() : (raw.indexOf('@') !== -1 ? raw : '');
  var displayPart = emailMatch ? raw.slice(0, emailMatch.index).trim() : '';

  // Strip surrounding quotes around display name
  displayPart = displayPart.replace(/^["']+|["']+$/g, '').trim();

  var clean = sanitizeForKey_(displayPart, R2_KEY_MAX_PART_LEN_);
  if (clean) return clean;

  if (emailAddr) {
    var localPart = emailAddr.split('@')[0];
    var cleanLocal = sanitizeForKey_(localPart, R2_KEY_MAX_PART_LEN_);
    if (cleanLocal) return cleanLocal;
  }

  return 'unknown';
}

/**
 * formatMMDD_ — MMDD from a YYYY-MM-DD prefix; returns '0000' if unparseable.
 */
function formatMMDD_(isoDateOrPrefix) {
  var s = String(isoDateOrPrefix == null ? '' : isoDateOrPrefix);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '0000';
  return m[2] + m[3];
}

/**
 * buildR2Key_ — assembles the R2 object key per the human-readable spec.
 */
function buildR2Key_(senderRaw, originalFilename, dateFolder, sha256) {
  var sender = extractDisplayName_(senderRaw);

  var name = String(originalFilename || 'attachment');
  var dotIdx = name.lastIndexOf('.');
  var base, ext;
  if (dotIdx > 0 && dotIdx < name.length - 1) {
    base = name.slice(0, dotIdx);
    ext  = name.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]+/g, '');
  } else {
    base = name;
    ext  = '';
  }

  var baseClean = sanitizeForKey_(base, R2_KEY_MAX_PART_LEN_) || 'file';
  var mmdd = formatMMDD_(dateFolder);
  var shortHash = String(sha256 || '').slice(0, 3) || '000';

  var filenamePart = sender + '_' + baseClean + '_' + mmdd + '_' + shortHash;
  if (ext) filenamePart += '.' + ext;

  return 'inbox/' + dateFolder + '/' + filenamePart;
}
