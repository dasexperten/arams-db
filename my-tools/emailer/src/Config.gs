/**
 * Config.gs — top-level configuration constants shared across the project.
 *
 * Kept separate so that whitelist edits don't touch handler code, and so the
 * paste-flow bundle can place this near the top of the concatenated file.
 */

// Sender inbox whitelist — used by send / reply / reply_all for from-validation
// and reply inbox auto-detection.

var ALLOWED_SENDER_INBOXES = [
  'eurasia@dasexperten.de',
  'emea@dasexperten.de',
  'export@dasexperten.de',
  'marketing@dasexperten.de',
  'sales@dasexperten.de',
  'support@dasexperten.de'
];
