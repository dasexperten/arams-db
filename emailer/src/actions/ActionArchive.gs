/**
 * ActionArchive.gs — handles action "archive". Creates a Reporter-style Doc
 * in REPORTER_FOLDER_ID without sending or drafting any email.
 *
 * Use case: any read-only or external operation (Gmail search, analysis run,
 * data export, etc.) that wants a permanent Drive trail of what it did.
 *
 * Required payload fields: title, body_plain or body_html
 * Optional:
 *   archive_label  — folder name under REPORTER_FOLDER_ID. Default 'system-archive'.
 *                    For search results pass e.g. 'gmail-search'.
 *   context        — caller-supplied context string included in the Doc.
 *
 * Returns the standard Reporter response (archive_doc_link + archive_doc_id).
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

    var result = {
      success: false,
      action: 'archive',
      archive_doc_link: null,
      archive_doc_id: null,
      archive_label: label,
      error: null
    };

    try {
      var archive = buildArchive({
        from: Session.getActiveUser().getEmail(),
        to: label,
        subject: payload.title,
        date: new Date().toISOString(),
        body_plain: payload.body_plain || null,
        body_html: payload.body_html || null,
        context: payload.context || null,
        mode: 'archive'
      });
      result.success = true;
      result.archive_doc_link = archive.archive_doc_link;
      result.archive_doc_id = archive.archive_doc_id;
      result.result_summary = 'Archive Doc created in ' + label;
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  return { handle: handle };
})();
