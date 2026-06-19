/**
 * SendAsManager.gs — manages Gmail Send-as aliases programmatically.
 *
 * Requires scope `https://www.googleapis.com/auth/gmail.settings.sharing`.
 *
 * Two purposes:
 *   1. addSendAsAlias_(email, displayName) — creates a Send-as alias record
 *      via Gmail Advanced Service. After creation, Google sends a verification
 *      email to the alias address that must be clicked to activate.
 *   2. listSendAsAliases_() — returns all currently configured aliases for the
 *      authenticated account, with verification status.
 *
 * Both functions are also exposed as Web App actions for one-off CLI use:
 *   {"action": "list_send_as"}
 *   {"action": "add_send_as", "email": "sales@dasexperten.de", "name": "Emma Sinclair"}
 *
 * The user only needs to run setupSalesAlias() ONCE from the Apps Script editor
 * to authorize the new scope; afterwards the bridge can be called from anywhere.
 */


/**
 * One-shot bootstrap function. Adds sales@dasexperten.de as Send-as alias.
 * Run this once from Apps Script editor to trigger authorization prompt for
 * the new gmail.settings.sharing scope. Safe to re-run — idempotent.
 *
 * Returns log of result. Check Stackdriver for details if it errors.
 */
function setupSalesAlias() {
  var email = 'sales@dasexperten.de';
  var name = 'Emma Sinclair';

  Logger.log('Setting up Send-as alias: ' + email + ' (' + name + ')');

  var existing = listSendAsAliases_();
  Logger.log('Currently configured aliases:');
  existing.forEach(function (a) {
    Logger.log('  - ' + a.sendAsEmail + '  verified=' + a.verificationStatus + '  default=' + (a.isDefault || false));
  });

  var alreadyThere = existing.some(function (a) {
    return (a.sendAsEmail || '').toLowerCase() === email.toLowerCase();
  });

  if (alreadyThere) {
    Logger.log('Alias ' + email + ' is ALREADY configured. No action taken.');
    Logger.log('If verificationStatus is not "accepted", check the inbox for the verification email and click the link.');
    return { success: true, action: 'already_exists', email: email };
  }

  Logger.log('Alias ' + email + ' is NOT configured yet. Creating now...');

  var resp = addSendAsAlias_(email, name);
  Logger.log('Created. Response:');
  Logger.log(JSON.stringify(resp, null, 2));
  Logger.log('NEXT STEP: Google has sent a verification email to ' + email + '. Open that inbox, click the verification link, and the alias will become usable.');

  return { success: true, action: 'created', email: email, response: resp };
}


/**
 * Adds a new Send-as alias. Triggers Google to send verification email.
 *
 * @param {string} email   - alias email address (e.g. sales@dasexperten.de)
 * @param {string} name    - display name (e.g. "Emma Sinclair")
 * @returns {Object} the SendAs resource as returned by Gmail API
 */
function addSendAsAlias_(email, name) {
  if (!email) throw new Error('addSendAsAlias_: email is required.');

  var resource = {
    sendAsEmail: email,
    displayName: name || '',
    treatAsAlias: true
  };

  return Gmail.Users.Settings.SendAs.create(resource, 'me');
}


/**
 * Lists all Send-as aliases for the authenticated account.
 *
 * @returns {Array<Object>} list of SendAs resources, each with sendAsEmail,
 *                          displayName, isDefault, isPrimary, verificationStatus
 */
function listSendAsAliases_() {
  var resp = Gmail.Users.Settings.SendAs.list('me');
  return resp.sendAs || [];
}


/**
 * Web App action dispatcher entry points (called from Main.gs router).
 */

function action_list_send_as(payload) {
  var aliases = listSendAsAliases_();
  return {
    success: true,
    action: 'list_send_as',
    count: aliases.length,
    aliases: aliases.map(function (a) {
      return {
        email: a.sendAsEmail,
        display_name: a.displayName || null,
        is_default: a.isDefault || false,
        is_primary: a.isPrimary || false,
        treat_as_alias: a.treatAsAlias || false,
        verification_status: a.verificationStatus || null
      };
    }),
    error: null
  };
}


function action_add_send_as(payload) {
  var email = payload.email;
  var name = payload.name || '';

  if (!email) {
    return { success: false, action: 'add_send_as', error: 'Missing required field: email' };
  }

  try {
    var existing = listSendAsAliases_();
    var dup = existing.some(function (a) {
      return (a.sendAsEmail || '').toLowerCase() === email.toLowerCase();
    });

    if (dup) {
      return {
        success: true,
        action: 'add_send_as',
        result: 'already_exists',
        email: email,
        error: null
      };
    }

    var created = addSendAsAlias_(email, name);
    return {
      success: true,
      action: 'add_send_as',
      result: 'created',
      email: email,
      verification_status: created.verificationStatus || null,
      note: 'Google sent a verification email to ' + email + '. Click the link to activate.',
      error: null
    };
  } catch (err) {
    return {
      success: false,
      action: 'add_send_as',
      email: email,
      error: String(err)
    };
  }
}
