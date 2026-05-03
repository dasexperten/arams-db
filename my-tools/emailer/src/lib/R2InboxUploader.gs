/**
 * R2InboxUploader.gs — uploads Gmail attachment blobs to Cloudflare R2.
 *
 * Script Properties consumed (all four are required at runtime):
 *   R2_ACCOUNT_ID   — Cloudflare account ID
 *   R2_BUCKET       — R2 bucket name  (e.g. emailer-attachments)
 *   R2_PUBLIC_BASE  — public read base URL, trailing slash optional
 *   R2_API_TOKEN    — Cloudflare API token with R2 read+write permissions
 *
 * Path format:  inbox/<YYYY-MM-DD>/<sha256>_<sanitized_filename>
 * Dedup:        HEAD request before PUT — skip upload if key already exists.
 * Size limit:   25 MB. Files above this limit are returned with
 *               skipped_reason: "too_large", no upload attempted.
 */

var R2_SIZE_LIMIT_BYTES_ = 25 * 1024 * 1024;

/**
 * uploadInboxAttachmentToR2 — resolves one Gmail attachment against R2.
 *
 * @param {GoogleAppsScript.Gmail.GmailAttachment} attachmentBlob
 * @param {string} originalFilename
 * @param {string} messageDateIso - ISO datetime of the containing message
 * @returns {{
 *   filename:       string,
 *   size_bytes:     number,
 *   mime_type:      string,
 *   r2_url:         string|null,
 *   sha256:         string|null,
 *   skipped_reason: string|null
 * }}
 */
function uploadInboxAttachmentToR2(attachmentBlob, originalFilename, messageDateIso) {
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

  // Date folder: first 10 chars of ISO string (YYYY-MM-DD)
  var dateFolder = messageDateIso
    ? String(messageDateIso).slice(0, 10)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');

  // Sanitize filename — replace path-illegal chars with _
  var safeFilename = filename.replace(/[\/\\:*?"<>|]/g, '_');
  var r2Key = 'inbox/' + dateFolder + '/' + sha256 + '_' + safeFilename;

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

  var apiBase   = 'https://api.cloudflare.com/client/v4/accounts/' + accountId +
                  '/r2/buckets/' + bucket + '/objects/';
  var objectUrl = apiBase + encodeURIComponent(r2Key);
  var publicUrl = pubBase.replace(/\/$/, '') + '/' + r2Key;
  var authHeader = { 'Authorization': 'Bearer ' + apiToken };

  // Dedup: HEAD check — 200 means object already exists
  try {
    var headResp = UrlFetchApp.fetch(objectUrl, {
      method: 'get',
      headers: authHeader,
      muteHttpExceptions: true
    });
    if (headResp.getResponseCode() === 200) {
      return {
        filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
        r2_url: publicUrl, sha256: sha256, skipped_reason: null
      };
    }
  } catch (headErr) {
    // Network error on existence check — fall through to upload attempt
  }

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

  return {
    filename: filename, size_bytes: sizeBytes, mime_type: mimeType,
    r2_url: publicUrl, sha256: sha256, skipped_reason: null
  };
}
