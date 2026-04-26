/**
 * InboxAttachmentManager.gs — manages per-sender subfolders inside
 * INBOX_ATTACHMENTS_FOLDER_ID and writes attachment blobs to Drive.
 *
 * Sanitization rule is identical to Reporter.sanitizeEmailForFolder
 * (we call it directly — it's a top-level function in Reporter.gs).
 */

/**
 * getSenderSubfolder — resolves the per-sender subfolder inside
 * INBOX_ATTACHMENTS_FOLDER_ID, creating it if missing.
 *
 * @param {string} senderEmail
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getSenderSubfolder(senderEmail) {
  var inboxId = PropertiesService.getScriptProperties().getProperty('INBOX_ATTACHMENTS_FOLDER_ID');
  if (!inboxId) {
    throw new Error('INBOX_ATTACHMENTS_FOLDER_ID is not set in Script Properties. ' +
      'Set it to the Drive folder ID where inbound attachments should be stored.');
  }
  var parent;
  try { parent = DriveApp.getFolderById(inboxId); }
  catch (err) {
    throw new Error('INBOX_ATTACHMENTS_FOLDER_ID points to an inaccessible folder: ' +
      inboxId + ' (' + err + ')');
  }

  var name = sanitizeEmailForFolder(senderEmail);
  var iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(name);
}

/**
 * saveAttachmentToDrive — writes a Gmail attachment blob to the given folder.
 * Sets sharing to "anyone with link can view".
 *
 * @param {string} senderEmail        - used only when folder is null (caller didn't pre-resolve)
 * @param {Blob}   attachmentBlob     - GmailAttachment from message.getAttachments()
 * @param {string} originalFilename   - filename from the email
 * @param {?GoogleAppsScript.Drive.Folder} folder - target folder; if null, resolves via sender
 * @returns {{file_id: string, file_name: string, file_link: string}}
 */
function saveAttachmentToDrive(senderEmail, attachmentBlob, originalFilename, folder) {
  if (!attachmentBlob) throw new Error('saveAttachmentToDrive: attachmentBlob is required.');
  var targetFolder = folder || getSenderSubfolder(senderEmail);
  var fileName = originalFilename || attachmentBlob.getName() || 'attachment';

  var blob = attachmentBlob.copyBlob();
  blob.setName(fileName);

  var file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    file_id: file.getId(),
    file_name: file.getName(),
    file_link: file.getUrl()
  };
}
