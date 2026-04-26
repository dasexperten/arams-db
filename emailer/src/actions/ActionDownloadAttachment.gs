/**
 * ActionDownloadAttachment.gs — handles action "download_attachment".
 *
 * Required payload fields: message_id, attachment_name (or attachment_index)
 * Optional:  target_subfolder_override (advanced — defaults to per-sender subfolder)
 *
 * Saves the attachment to INBOX_ATTACHMENTS_FOLDER_ID/<sanitized_sender>/ in Drive,
 * sets sharing to "anyone with link can view", returns file metadata.
 * Reporter does NOT run (this is an inbox read action, not an outgoing send).
 */

var ActionDownloadAttachment = (function () {

  function handle(payload) {
    payload = payload || {};

    if (!payload.message_id) {
      return { success: false, action: 'download_attachment', error: 'Missing required field: message_id.' };
    }
    if (payload.attachment_name === undefined && payload.attachment_index === undefined) {
      return {
        success: false,
        action: 'download_attachment',
        error: 'Missing required field: attachment_name or attachment_index (at least one required).'
      };
    }

    var result = {
      success: false,
      action: 'download_attachment',
      file_id: null,
      file_name: null,
      file_link: null,
      saved_to_folder: null,
      sender: null,
      size_bytes: null,
      mime_type: null,
      error: null
    };

    try {
      var message = GmailApp.getMessageById(payload.message_id);
      if (!message) throw new Error('Message not found: ' + payload.message_id);

      var attachments = message.getAttachments();
      if (!attachments || attachments.length === 0) {
        throw new Error('No attachments found in message ' + payload.message_id);
      }

      var attachment = findAttachment_(attachments, payload.attachment_name, payload.attachment_index);
      if (!attachment) {
        var lookupDesc = payload.attachment_name
          ? ("'" + payload.attachment_name + "'")
          : ('index ' + payload.attachment_index);
        throw new Error('Attachment ' + lookupDesc + ' not found in message ' + payload.message_id);
      }

      var sender = message.getFrom() || 'unknown';
      var senderEmail = extractBareEmail_(sender);

      var subfolder = payload.target_subfolder_override
        ? resolveOverrideFolder_(payload.target_subfolder_override)
        : getSenderSubfolder(senderEmail);

      var savedFile = saveAttachmentToDrive(senderEmail, attachment, attachment.getName(), subfolder);

      result.success = true;
      result.file_id = savedFile.file_id;
      result.file_name = savedFile.file_name;
      result.file_link = savedFile.file_link;
      result.saved_to_folder = 'Inbox Attachments / ' + sanitizeEmailForFolder(senderEmail);
      result.sender = sender;
      result.size_bytes = attachment.getSize();
      result.mime_type = attachment.getContentType();
      result.result_summary = 'Attachment saved: ' + savedFile.file_name;
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function findAttachment_(attachments, name, index) {
    if (name !== undefined && name !== null) {
      for (var i = 0; i < attachments.length; i++) {
        if (attachments[i].getName() === name) return attachments[i];
      }
      return null;
    }
    var idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= attachments.length) return null;
    return attachments[idx];
  }

  function extractBareEmail_(str) {
    if (!str) return 'unknown';
    var m = str.match(/<([^>]+)>/);
    return m ? m[1].trim() : str.trim();
  }

  function resolveOverrideFolder_(overrideName) {
    var iter = DriveApp.getFoldersByName(overrideName);
    if (iter.hasNext()) return iter.next();
    return DriveApp.createFolder(overrideName);
  }

  return { handle: handle };
})();
