/**
 * DriveManager.gs — moves freshly-created Docs into a target folder
 * and returns a shareable link (anyone with link can view).
 */

/**
 * saveToDrive — moves a Doc into a named folder (creating the folder if missing)
 * and sets sharing to "anyone with link can view".
 *
 * @param {string} docId      - Google Doc ID returned by DocBuilder.buildReport
 * @param {string} folderName - target folder name in My Drive root
 * @returns {string} shareable URL
 */
function saveToDrive(docId, folderName) {
  if (!docId) throw new Error('saveToDrive: docId is required.');
  if (!folderName) folderName = 'Emailer Reports';

  var file = DriveApp.getFileById(docId);
  var folder = getOrCreateFolder_(folderName);

  // Move file: add to target folder, remove from any other parents.
  folder.addFile(file);
  var parents = file.getParents();
  while (parents.hasNext()) {
    var p = parents.next();
    if (p.getId() !== folder.getId()) {
      p.removeFile(file);
    }
  }

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/**
 * getOrCreateFolder_ — returns the first folder matching `name` in My Drive root,
 * creating it if not found.
 *
 * @private
 * @param {string} name
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateFolder_(name) {
  var iter = DriveApp.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return DriveApp.createFolder(name);
}
