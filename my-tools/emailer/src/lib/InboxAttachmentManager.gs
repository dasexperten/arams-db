/**
 * InboxAttachmentManager.gs — manages per-sender subfolders inside
 * INBOX_ATTACHMENTS_FOLDER_ID and saves Gmail attachment blobs to Drive.
 *
 * Folder ID comes from Script Property INBOX_ATTACHMENTS_FOLDER_ID (never hardcoded).
 * Sanitisation logic is identical to Reporter.sanitizeEmailForFolder — shared by call.
 */

/**
 * getSenderSubfolder — resolves (or creates) per-sender subfolder inside
 * INBOX_ATTACHMENTS_FOLDER_ID.
 *
 * @param {string} senderEmail
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getSenderSubfolder(senderEmail) {
  var folderId = PropertiesService.getScriptProperties().getProperty('INBOX_ATTACHMENTS_FOLDER_ID');
  if (!folderId) throw new Error('Script property INBOX_ATTACHMENTS_FOLDER_ID is not set.');

  var rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(folderId);
  } catch (err) {
    throw new Error('Cannot access INBOX_ATTACHMENTS_FOLDER_ID ' + folderId + ': ' + String(err.message || err));
  }

  var subfolderName = sanitizeEmailForFolder(senderEmail);
  var iter = rootFolder.getFoldersByName(subfolderName);
  if (iter.hasNext()) return iter.next();
  return rootFolder.createFolder(subfolderName);
}

/**
 * saveAttachmentToDrive — saves a Gmail attachment blob into the given subfolder.
 *
 * @param {string} senderEmail        - used for folder path label only
 * @param {GoogleAppsScript.Gmail.GmailAttachment} attachmentBlob
 * @param {string} originalFilename
 * @param {GoogleAppsScript.Drive.Folder} [subfolder] - if omitted, getSenderSubfolder is called
 * @returns {{file_id: string, file_name: string, file_link: string}}
 */
function saveAttachmentToDrive(senderEmail, attachmentBlob, originalFilename, subfolder) {
  if (!subfolder) {
    subfolder = getSenderSubfolder(senderEmail);
  }

  var file = subfolder.createFile(attachmentBlob);
  file.setName(originalFilename || file.getName());
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    file_id: file.getId(),
    file_name: file.getName(),
    file_link: file.getUrl()
  };
}
