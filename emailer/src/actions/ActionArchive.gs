/**
 * ActionArchive.gs — handles action "archive". Writes a plain markdown / text
 * file to REPORTER_FOLDER_ID/<archive_label>/ without sending or drafting any
 * email. Bypasses DocumentApp entirely so it scales to large bodies (Reporter's
 * polished Doc layout fails on bodies > ~80KB due to Apps Script DocumentApp
 * service limits — gmail-search transcripts hit that immediately).
 *
 * Use case: any read-only or external operation (Gmail search, analysis run,
 * data export, etc.) that wants a permanent Drive trail of what it did.
 *
 * Required payload fields: title, body_plain or body_html
 * Optional:
 *   archive_label  — folder name under REPORTER_FOLDER_ID. Default 'system-archive'.
 *                    For search results pass e.g. 'gmail-search'.
 *   context        — caller-supplied context string included as a header line.
 *   mime_type      — override mime type. Default 'text/markdown'. Use 'text/plain'
 *                    when the body is not markdown.
 *
 * Returns:
 *   archive_doc_link  — shareable URL to the file (anyone with link can view).
 *   archive_doc_id    — Drive file ID.
 *   archive_label     — echoes the resolved label.
 *   archive_filename  — final filename written.
 */

var ActionArchive = (function () {

  function handle(payload) {
    payload = payload || {};

    if (!payload.title || typeof payload.title !== 'string') {
      return { success: false, action: 'archive', error: 'Missing required field: title.' };
    }
    if (!payload.body_plain && !payload.body_html) {
      return { success: false, action: 'archive', error: 'Missing required field: body_plain or body_html.' };
    }

    var label = payload.archive_label || 'system-archive';
    var mimeType = payload.mime_type || 'text/markdown';

    var result = {
      success: false,
      action: 'archive',
      archive_doc_link: null,
      archive_doc_id: null,
      archive_label: label,
      archive_filename: null,
      error: null
    };

    try {
      var reporterFolderId = PropertiesService.getScriptProperties().getProperty('REPORTER_FOLDER_ID');
      if (!reporterFolderId) {
        throw new Error('Script property REPORTER_FOLDER_ID is not set.');
      }

      var reporterFolder;
      try {
        reporterFolder = DriveApp.getFolderById(reporterFolderId);
      } catch (err) {
        throw new Error('Cannot access REPORTER_FOLDER_ID ' + reporterFolderId + ': ' + String(err.message || err));
      }

      // Resolve / create label subfolder
      var labelFolder;
      var iter = reporterFolder.getFoldersByName(label);
      if (iter.hasNext()) {
        labelFolder = iter.next();
      } else {
        labelFolder = reporterFolder.createFolder(label);
      }

      // Build content
      var body = payload.body_plain || stripHtmlForArchive_(payload.body_html || '');
      var headerLines = [];
      headerLines.push('# ' + payload.title);
      headerLines.push('');
      var tz = Session.getScriptTimeZone() || 'Europe/Moscow';
      var stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
      headerLines.push('_Archived: ' + stamp + '_');
      if (payload.context) {
        headerLines.push('');
        headerLines.push('> ' + String(payload.context));
      }
      headerLines.push('');
      headerLines.push('---');
      headerLines.push('');
      var content = headerLines.join('\n') + body;

      // Build filename: <safe-title> — <stamp>.md
      var safeTitle = String(payload.title)
        .replace(/[\/\\:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
      var ext = (mimeType === 'text/markdown') ? '.md' : '.txt';
      var filename = safeTitle + ' — ' + stamp + ext;

      // Write to Drive
      var file = labelFolder.createFile(filename, content, mimeType);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      result.success = true;
      result.archive_doc_link = file.getUrl();
      result.archive_doc_id = file.getId();
      result.archive_filename = filename;
      result.result_summary = 'Archive file created: ' + filename;
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  return { handle: handle };
})();
