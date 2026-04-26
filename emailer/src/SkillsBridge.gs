/**
 * SkillsBridge.gs — interface between Emailer and the Das Experten skills
 * stored in arams-db/.claude/skills/.
 *
 * IMPORTANT: Apps Script CANNOT read arbitrary local repository files at runtime.
 * Skills from arams-db/.claude/skills/ are loaded into PropertiesService
 * via a deploy-time clasp push script (see SETUP_NOTES.md).
 * At runtime, callSkill reads the skill template from Properties and applies
 * payload variables before returning content for the email body / Doc artifact.
 *
 * Supported skill names (loaded keys):
 *   bannerizer, das-presenter, technolog, review-master, blog-writer,
 *   marketolog, personizer, productcardmaker, legalizer, invoicer,
 *   pricer, product-skill, contacts, logist, benefit-gate, ozon-skill,
 *   wb_seller, ozon-fbo-calculator, wb-fbo, sales-hunter
 *
 * @typedef {Object} SkillResult
 * @property {string} content   - rendered text (may include markdown-lite for DocBuilder)
 * @property {Object} metadata  - { skill, loaded_at_runtime, template_present, ... }
 */

/**
 * callSkill — applies a skill template to a payload and returns rendered content.
 *
 * If no template has been deployed for `skillName` yet, the function returns
 * a clearly-marked stub so the rest of the pipeline (DocBuilder, GmailSender)
 * still runs end-to-end during development.
 *
 * @param {string} skillName - one of: bannerizer, das-presenter, technolog,
 *                             review-master, blog-writer, etc.
 * @param {object} payload   - skill-specific input
 * @returns {SkillResult}
 */
function callSkill(skillName, payload) {
  if (!skillName) throw new Error('callSkill: skillName is required.');
  payload = payload || {};

  var template = loadSkillTemplate(skillName);

  if (!template) {
    return {
      content: stubSkillContent_(skillName, payload),
      metadata: {
        skill: skillName,
        template_present: false,
        loaded_at_runtime: false,
        note: 'Skill template not deployed. Load arams-db/.claude/skills/' + skillName +
              '/SKILL.md into PropertiesService key skill_' + skillName +
              ' (see SETUP_NOTES.md).'
      }
    };
  }

  var rendered = renderTemplate_(template, payload);

  return {
    content: rendered,
    metadata: {
      skill: skillName,
      template_present: true,
      loaded_at_runtime: true,
      template_chars: template.length
    }
  };
}

/**
 * loadSkillTemplate — reads the skill template content from PropertiesService.
 *
 * Convention: deploy-time loader stores the contents of
 *   arams-db/.claude/skills/<skillName>/SKILL.md
 * under PropertiesService key `skill_<skillName>`.
 *
 * @param {string} skillName
 * @returns {?string} template content, or null if missing
 */
function loadSkillTemplate(skillName) {
  if (!skillName) return null;
  var key = 'skill_' + skillName;
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value && value.length ? value : null;
}

/**
 * Lists currently-deployed skill template keys (for diagnostics).
 *
 * @returns {string[]} skill names with templates present in PropertiesService
 */
function listLoadedSkills() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var names = [];
  for (var k in props) {
    if (props.hasOwnProperty(k) && k.indexOf('skill_') === 0) {
      names.push(k.substring('skill_'.length));
    }
  }
  return names.sort();
}

/**
 * Trivial mustache-lite renderer: replaces {{key}} with payload[key] (string-cast).
 * Unknown keys are left as-is so the template is still readable in stubs.
 *
 * @private
 * @param {string} template
 * @param {object} payload
 * @returns {string}
 */
function renderTemplate_(template, payload) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (match, key) {
    var parts = key.split('.');
    var cur = payload;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return match;
      cur = cur[parts[i]];
    }
    return cur == null ? match : String(cur);
  });
}

/**
 * Builds a development stub when no skill template is deployed yet.
 * @private
 */
function stubSkillContent_(skillName, payload) {
  var brief = payload && payload.brief ? payload.brief : '(no brief provided)';
  var ctx = payload && payload.context ? payload.context : '';
  return ''
    + '## Skill stub: ' + skillName + '\n\n'
    + 'Skill template not yet deployed to PropertiesService.\n\n'
    + '## Brief\n\n' + brief + '\n\n'
    + (ctx ? '## Context\n\n' + ctx + '\n\n' : '')
    + '## Next step\n\n'
    + '- Load arams-db/.claude/skills/' + skillName + '/SKILL.md into PropertiesService\n'
    + '- Key: skill_' + skillName + '\n'
    + '- See SETUP_NOTES.md for the clasp-based loader.\n';
}
