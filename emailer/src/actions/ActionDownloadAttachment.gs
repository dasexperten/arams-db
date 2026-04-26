/**
 * ActionDownloadAttachment.gs — handler for action: "download_attachment".
 *
 * Looks up an attachment in a Gmail message (by name or by index) and saves
 * it to Drive under a per-sender subfolder inside INBOX_ATTACHMENTS_FOLDER_ID.
 */

/**
 * @param {object} payload - {
 *   action: 'download_attachment',
 *   message_id: string,                  // required
 *   attachment_name: string,             // required (or attachment_index)
 *   attachment_index: number,            // optional, used only if attachment_name is missing
 *   target_subfolder_override: string    // optional, advanced — overrides per-sender folder
 * }
 * @returns {object} response envelope with file metadata on success
 */
function ActionDownloadAttachment_handle(payload) {
  var resp = {
    success: false,
    action: 'download_attachment',
    file_id: null,
    file_name: null,
    file_link: null,
    saved_to_folder: null,
    sender: null,
    size_bytes: null,
    mime_type: null,
    result_summary: null,
    log_id: null,
    error: null
  };

  try {
    if (!payload.message_id) throw new Error("Missing required field: message_id");
    if (!payload.attachment_name && payload.attachment_index == null) {
      throw new Error("Missing required field: attachment_name (or attachment_index)");
    }

    var message;
    try { message = GmailApp.getMessageById(payload.message_id); }
    catch (e) { throw new Error("Inaccessible message_id: " + payload.message_id + " (" + e + ")"); }
    if (!message) throw new Error("Message not found: " + payload.message_id);

    var atts = message.getAttachments({ includeInlineImages: false, includeAttachments: true }) || [];
    if (!atts.length) {
      throw new Error("Message " + payload.message_id + " has no attachments");
    }

    var blob = null;
    if (payload.attachment_name) {
      for (var i = 0; i < atts.length; i++) {
        if (atts[i].getName() === payload.attachment_name) {
          blob = atts[i];
          break;
        }
      }
      if (!blob) {
        throw new Error("Attachment '" + payload.attachment_name + "' not found in message " + payload.message_id);
      }
    } else {
      var idx = Number(payload.attachment_index);
      if (!isFinite(idx) || idx < 0 || idx >= atts.length) {
        throw new Error("attachment_index out of range: " + payload.attachment_index +
          " (message has " + atts.length + " attachments)");
      }
      blob = atts[idx];
    }

    var senderRaw = message.getFrom() || 'unknown';
    var sender = extractSenderEmail_(senderRaw);
    var folder;
    var folderLabel;

    if (payload.target_subfolder_override) {
      folder = resolveOverrideFolder_(payload.target_subfolder_override);
      folderLabel = 'Override / ' + payload.target_subfolder_override;
    } else {
      folder = getSenderSubfolder(sender);
      folderLabel = 'Inbox Attachments / ' + sanitizeEmailForFolder(sender);
    }

    var saved = saveAttachmentToDrive(sender, blob, blob.getName(), folder);

    resp.success = true;
    resp.file_id = saved.file_id;
    resp.file_name = saved.file_name;
    resp.file_link = saved.file_link;
    resp.saved_to_folder = folderLabel;
    resp.sender = sender;
    resp.size_bytes = blob.getBytes().length;
    resp.mime_type = blob.getContentType() || '';
    resp.result_summary = 'Attachment saved (' + resp.size_bytes + ' bytes)';
  } catch (err) {
    resp.success = false;
    resp.error = String(err && err.message ? err.message : err);
  }

  try { resp.log_id = logOperation(payload, resp); } catch (logErr) {}
  return resp;
}

/** @private */
function extractSenderEmail_(addr) {
  if (!addr) return 'unknown';
  var m = String(addr).match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return String(addr).trim();
}

/**
 * resolveOverrideFolder_ — accepts either a Drive folder ID or a folder name
 * (looked up under INBOX_ATTACHMENTS_FOLDER_ID, created if missing).
 * @private
 */
function resolveOverrideFolder_(override) {
  // Try ID first.
  try {
    return DriveApp.getFolderById(override);
  } catch (e) {
    // Not an ID — treat as a name under the inbox parent.
  }
  var inboxId = PropertiesService.getScriptProperties().getProperty('INBOX_ATTACHMENTS_FOLDER_ID');
  if (!inboxId) {
    throw new Error('INBOX_ATTACHMENTS_FOLDER_ID is not set; cannot resolve override folder name: ' + override);
  }
  var parent = DriveApp.getFolderById(inboxId);
  var iter = parent.getFoldersByName(override);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(override);
}
