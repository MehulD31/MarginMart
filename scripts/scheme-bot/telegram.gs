/**
 * K.D. Foods scheme bot — Telegram side (Google Apps Script, free). Same pattern as VAJRA's approvals bot.
 * Every minute it reads new Telegram updates and starts the GitHub workflow "scheme.yml".
 * Only the "KD Schemes" group and the allowed Telegram users are answered.
 *
 * Script properties (Project settings → Script properties):
 *   BOT_TOKEN   bot token from @BotFather
 *   CHAT_ID     the KD Schemes group id (negative number)
 *   ALLOWED     comma-separated Telegram user ids of Mehul and Shobhit
 *   GH_TOKEN    GitHub token with "actions: write" on the MarginMart repo
 *   GH_REPO     e.g. MehulD31/MarginMart
 * Setup: paste this file, save, run installTrigger() once. To find ids, send a message in the group and run whoIsHere().
 */
function installTrigger() {
  tg_('deleteWebhook', {});
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();
  pollTelegram();
}

function pollTelegram() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var P = PropertiesService.getScriptProperties();
    var offset = Number(P.getProperty('OFFSET') || 0);
    var res = JSON.parse(tg_('getUpdates', { offset: offset, timeout: 0, allowed_updates: ['message', 'callback_query'] }).getContentText());
    if (!res.ok) { Logger.log(JSON.stringify(res)); return; }
    res.result.forEach(function (u) {
      P.setProperty('OFFSET', String(u.update_id + 1));  // save first, so nothing runs twice
      try { if (u.callback_query) tap_(u.callback_query, P); else if (u.message) message_(u.message, P); }
      catch (e) { Logger.log(e); }
    });
  } finally { lock.releaseLock(); }
}

function allowed_(from, chatId, P) {
  var ids = String(P.getProperty('ALLOWED') || '').split(',').map(function (s) { return s.trim(); });
  return String(chatId) === String(P.getProperty('CHAT_ID')) && from && ids.indexOf(String(from.id)) >= 0;
}

function message_(m, P) {
  if (!allowed_(m.from, m.chat.id, P)) return;
  var text = (m.text || m.caption || '').trim();
  if (!text || text.charAt(0) === '/') {
    if (/^\/start|^\/help/.test(text)) send_(P, 'Pepsi wale ka scheme message yahan paste ya forward karo. Main matlab samjhaunga, poster banaunga, aur ✅ Approve par app me scheme chalu kar dunga.');
    return;
  }
  // A reply to the bot's message = correction: send the original + the correction together.
  var orig = m.reply_to_message && m.reply_to_message.from && m.reply_to_message.from.is_bot ? (m.reply_to_message.caption || m.reply_to_message.text || '') : '';
  var task = orig ? 'Pehle bot ne ye samjha tha:\n' + orig.slice(0, 900) + '\n\nSahi baat (isko maano):\n' + text : text;
  send_(P, '⏳ Samajh raha hun, 1 minute…');
  dispatch_(P, { mode: 'explain', task: task.slice(0, 1900), who: m.from.first_name || '' });
}

function tap_(q, P) {
  if (!allowed_(q.from, q.message && q.message.chat.id, P)) { tg_('answerCallbackQuery', { callback_query_id: q.id, text: 'Sirf owners' }); return; }
  var mm = /^(ok|no):([0-9a-f-]{36})$/i.exec(q.data || '');
  if (!mm) return;
  tg_('answerCallbackQuery', { callback_query_id: q.id, text: mm[1] === 'ok' ? 'App me save kar raha hun…' : 'Theek hai' });
  tg_('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  dispatch_(P, { mode: 'approve', action: mm[1], draft: mm[2], who: q.from.first_name || '' });
}

function dispatch_(P, inputs) {
  var r = UrlFetchApp.fetch('https://api.github.com/repos/' + P.getProperty('GH_REPO') + '/actions/workflows/scheme.yml/dispatches', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + P.getProperty('GH_TOKEN'), Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main', inputs: inputs }) });
  if (r.getResponseCode() >= 300) send_(P, '⚠️ GitHub start nahi hua: ' + r.getContentText().slice(0, 200));
}

function send_(P, text) { tg_('sendMessage', { chat_id: P.getProperty('CHAT_ID'), text: text }); }

function tg_(method, payload) {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  return UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
}

/** Helper for setup: logs chat ids and user ids from recent messages. */
function whoIsHere() {
  var res = JSON.parse(tg_('getUpdates', { timeout: 0 }).getContentText());
  (res.result || []).forEach(function (u) {
    var m = u.message || (u.callback_query && u.callback_query.message);
    var f = (u.message && u.message.from) || (u.callback_query && u.callback_query.from);
    if (m) Logger.log('chat ' + m.chat.id + ' (' + (m.chat.title || m.chat.type) + ')  from ' + (f && f.id) + ' ' + (f && f.first_name));
  });
}
