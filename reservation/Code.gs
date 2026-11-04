/**
 * Lab computer booking — Google Apps Script web app (French / English).
 *
 * All data lives in the Google Sheet this script is attached to:
 *   Config     – settings (lab name, slot length, reminder timing, admins, ...)
 *   Computers  – the bookable computers (untick "Available" to take one offline)
 *   Bookings   – every booking, including cancelled ones
 *   Users      – registered emails, their personal sign-in tokens and preferred language
 *
 * One-time setup: run setup() (menu "Lab booking" → "Set up / repair"), then deploy as a web app.
 * See README.md for the step-by-step guide.
 */

const SHEET = { CONFIG: 'Config', COMPUTERS: 'Computers', BOOKINGS: 'Bookings', USERS: 'Users' };

// Status values stored in the Bookings sheet (the page translates them for display)
const STATUS = {
  BOOKED: 'Booked',
  AWAITING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled'
};
const ACTIVE_STATUSES = [STATUS.BOOKED, STATUS.AWAITING, STATUS.CONFIRMED];

// Bookings sheet columns (1-based)
const B = { ID: 1, COMPUTER: 2, START: 3, END: 4, EMAIL: 5, STATUS: 6, CREATED: 7, REMINDED: 8, CONFIRMED: 9, CANCELLED: 10, REASON: 11, KEY: 12 };
const BOOKING_HEADERS = ['Booking ID', 'Computer', 'Start', 'End', 'Email', 'Status', 'Created', 'Reminder sent', 'Confirmed at', 'Cancelled at', 'Cancel reason', 'Email action key'];
const USER_HEADERS = ['Email', 'Personal link token', 'Registered', 'Last link sent', 'Language'];

const DEFAULT_CONFIG = [
  ['LAB_NAME', 'CIQSS – Laboratoire UQAM-INRS', 'Name shown on the booking page and in emails'],
  ['LAB_ADDRESS', '320, rue Sainte-Catherine Est, 5e étage, local DS-5560, Montréal (Québec) H2X 1L7 (métro Berri-UQAM)', 'Shown on the booking page and in emails'],
  ['LAB_CONTACT', 'acces@ciqss.org · 514 987-3000, poste 4969', 'Who to contact with questions (shown on the page and in emails)'],
  ['REPLY_TO', '', 'If set, replies to booking emails go to this address instead of the lab Gmail'],
  ['WEB_APP_URL', '', 'Paste the web app URL here after you deploy (it ends in /exec)'],
  ['ADMIN_EMAILS', 'reservation.ciqss.uqam@gmail.com, munteanu.andrei@uqam.ca', 'Admin emails, comma-separated. Admins see who booked each slot and can cancel any booking'],
  ['ALLOWED_EMAIL_DOMAINS', '', 'Who may register, e.g. uqam.ca, umontreal.ca. Leave blank to allow any email address'],
  ['SLOT_MINUTES', '60', 'Length of one time slot, in minutes'],
  ['DAY_START', '09:00', 'Opening time: start of the first slot (24-hour HH:MM)'],
  ['DAY_END', '17:00', 'Closing time: end of the last slot (24-hour HH:MM)'],
  ['OPEN_DAYS', 'Mon,Tue,Wed,Thu,Fri', 'Days the lab is open (Mon,Tue,Wed,Thu,Fri,Sat,Sun)'],
  ['BOOKING_WEEKS', '4', 'How many weeks the calendar shows, one below the other (the current week is the first). Every open day in them can be booked'],
  ['MAX_SLOTS_PER_BOOKING', '8', 'Longest single booking, in slots (8 one-hour slots = a full day)'],
  ['MAX_UPCOMING_BOOKINGS', '5', 'Most upcoming bookings one person can hold at once (admins are exempt)'],
  ['CONFIRM_REMINDER_HOURS', '48', 'Hours before the start when the confirm-your-booking email goes out. Bookings made after that time are confirmed right away. Several values are allowed (e.g. 48, 24): later ones go out only while the booking is unconfirmed'],
  ['CONFIRM_DEADLINE_HOURS', '8', 'Bookings not confirmed by this many hours before the start are cancelled and the slot released']
];

// The lab's computers (plan of November 2026): name, RAM (GB), available, note (French), note (English).
// A computer with a note gets an asterisk on the booking page and the note is shown under the grid.
// Unavailable computers stay on the page, greyed out, and cannot be booked.
const COMPUTERS_HEADERS = ['Computer', 'RAM (GB)', 'Available', 'Notes', 'Notes (English)'];
const DEFAULT_COMPUTERS = [
  ['Poste 1', 16, true, '', ''],
  ['Poste 2', 16, true, '', ''],
  ['Poste 3', 64, true, '', ''],
  ['Poste 4', 64, true, '', ''],
  ['Poste 5', 16, false, '', ''],
  ['Poste 6', 16, true, '', ''],
  ['Poste 7', 64, true, '', ''],
  ['Poste 8', 64, false, '', ''],
  ['Poste 9', 64, true, '', ''],
  ['Poste Antoine', 64, true,
    'Utilisable seulement si Antoine Genest-Grégoire n\'est pas là.',
    'Only usable when Antoine Genest-Grégoire is not there.']
];
// Old computer names (first version of the sheet) → new names, used by loadLabComputers() to keep existing bookings attached
const OLD_COMPUTER_NAMES = {
  'PC-01': 'Poste 1', 'PC-02': 'Poste 2', 'PC-03': 'Poste 3', 'PC-04': 'Poste 4', 'PC-05': 'Poste 5',
  'PC-06': 'Poste 6', 'PC-07': 'Poste 7', 'PC-08': 'Poste 8', 'PC-09': 'Poste 9', 'PC-10': 'Poste Antoine'
};

const HOUR = 3600 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* Language: French by default, English on request                     */
/* ------------------------------------------------------------------ */

let LANG_ = 'fr';
function setLang_(lang) { LANG_ = lang === 'en' ? 'en' : 'fr'; return LANG_; }
function cleanLang_(lang) { return lang === 'en' || lang === 'fr' ? lang : ''; }

// [French, English]. {0}, {1}, ... are filled in by T_().
const MSG = {
  invalidDate: ['Date invalide.', 'Invalid date.'],
  dateNotBookable: ['Cette date ne peut pas être réservée.', 'That date cannot be booked.'],
  invalidEmail: ['Veuillez entrer une adresse courriel valide.', 'Please enter a valid email address.'],
  domainOnly: ['Seules les adresses de ces domaines peuvent s\'inscrire : {0}', 'Only addresses from these domains can register: {0}'],
  linkRecent: ['Un lien a été envoyé à {0} il y a un instant. Vérifiez votre boîte de réception et vos courriels indésirables.',
    'A link was sent to {0} a moment ago. Please check your inbox and spam folder.'],
  linkSent: ['Nous avons envoyé un lien de connexion à {0}. Ouvrez-le pour réserver (vérifiez vos courriels indésirables s\'il n\'arrive pas).',
    'We sent a sign-in link to {0}. Open it to start booking (check spam if it doesn\'t arrive).'],
  linkSubject: ['{0} : votre lien de réservation', '{0}: your booking link'],
  linkIntro: ['<p>Utilisez ce lien personnel pour réserver les ordinateurs du laboratoire :</p>', '<p>Use this personal link to book lab computers:</p>'],
  linkKeep: ['<p>Ajoutez-le à vos favoris : il vous connecte automatiquement. Ne le partagez pas.</p>',
    '<p>Bookmark it — it signs you in. Please don\'t share it.</p>'],
  openPage: ['Ouvrir la page de réservation', 'Open the booking page'],
  questions: ['Questions : {0}', 'Questions: {0}'],
  linkInvalid: ['Ce lien de connexion n\'est plus valide. Veuillez en demander un nouveau.', 'This sign-in link is no longer valid. Please request a new one.'],
  notAvailable: ['Cet ordinateur n\'est pas disponible pour la réservation.', 'That computer is not available for booking.'],
  invalidSlot: ['Plage horaire invalide.', 'Invalid time slot.'],
  invalidLength: ['Durée de réservation invalide.', 'Invalid booking length.'],
  passed: ['Cette plage horaire est déjà passée.', 'That time has already passed.'],
  justBooked: ['Désolé, quelqu\'un vient de réserver une partie de cette plage. Veuillez en choisir une autre.',
    'Sorry, someone just booked part of that time. Please pick another slot.'],
  clash: ['Vous avez déjà réservé {0} à ce moment-là ({1}). Vous ne pouvez utiliser qu\'un ordinateur à la fois.',
    'You already have {0} booked at that time ({1}). You can book one computer at a time.'],
  maxUpcoming: ['Vous avez déjà {0} réservations à venir, soit le maximum. Annulez-en une pour en faire une autre.',
    'You already have {0} upcoming bookings, the maximum. Cancel one to book another.'],
  bookedAuto: ['Réservé : {0}, {1}. La séance commence bientôt, la réservation est donc déjà confirmée.',
    'Booked {0}, {1}. It starts soon, so it is already confirmed.'],
  bookedLater: ['Réservé : {0}, {1}. Environ {2} avant le début, vous recevrez un courriel vous demandant de la confirmer (au plus tard {3} h avant le début).',
    'Booked {0}, {1}. About {2} before it starts you will get an email asking you to confirm it (by {3} h before the start at the latest).'],
  noLonger: ['Cette réservation n\'existe plus.', 'That booking no longer exists.'],
  onlyOwnCancel: ['Vous ne pouvez annuler que vos propres réservations.', 'You can only cancel your own bookings.'],
  onlyOwnConfirm: ['Vous ne pouvez confirmer que vos propres réservations.', 'You can only confirm your own bookings.'],
  ended: ['Cette réservation est déjà terminée.', 'That booking has already ended.'],
  cancelledMsg: ['Réservation annulée.', 'Booking cancelled.'],
  confirmedMsg: ['Réservation confirmée.', 'Booking confirmed.'],
  adminsOnly: ['Réservé aux administrateurs.', 'Admins only.'],
  adminCancelSubject: ['Réservation annulée : {0}, {1}', 'Booking cancelled: {0}, {1}'],
  adminCancelBody: ['<p>Un administrateur a annulé votre réservation de <b>{0}</b> pour <b>{1}</b>.</p>',
    '<p>An administrator cancelled your booking of <b>{0}</b> for <b>{1}</b>.</p>'],
  linkNotValid: ['Ce lien n\'est pas valide.', 'This link is not valid.'],
  alreadyCancelled: ['Cette réservation a déjà été annulée.', 'This booking was already cancelled.'],
  confirmedWhat: ['Confirmée : {0}, {1}.', 'Confirmed: {0}, {1}.'],
  cancelledFree: ['Annulée. La plage est maintenant libre pour d\'autres personnes.', 'Cancelled. The slot is now free for others.'],
  btnStillNeed: ['Oui, j\'en ai encore besoin', 'Yes, I still need it'],
  btnCancelThis: ['Annuler cette réservation', 'Cancel this booking'],
  btnCancelIt: ['L\'annuler', 'Cancel it'],
  statusLabel: ['Statut : {0}', 'Status: {0}'],
  releasedSubject: ['Réservation libérée : {0}, {1}', 'Booking released: {0}, {1}'],
  releasedBody: ['<p>Votre réservation de <b>{0}</b> pour <b>{1}</b> n\'a pas été confirmée à temps. Elle a donc été annulée et la plage a été libérée.</p>' +
    '<p>Si vous avez encore besoin d\'un ordinateur, vous pouvez réserver de nouveau si une plage est libre.</p>',
    '<p>Your booking of <b>{0}</b> for <b>{1}</b> was not confirmed in time, so it has been cancelled and the slot released to others.</p>' +
    '<p>If you still need a computer, you can book again if a slot is free.</p>'],
  confirmSubject: ['Veuillez confirmer : {0}, {1}', 'Please confirm: {0}, {1}'],
  confirmBody: ['<p>Vous avez réservé <b>{0}</b> pour <b>{1}</b>.</p>' +
    '<p>Veuillez confirmer que vous en avez encore besoin. Sans confirmation d\'ici le <b>{2}</b>, la réservation sera annulée automatiquement et la plage sera libérée.</p>',
    '<p>You have <b>{0}</b> booked for <b>{1}</b>.</p>' +
    '<p>Please confirm you still need it. If it is not confirmed by <b>{2}</b>, it will be cancelled automatically and the slot released to others.</p>'],
  ram: [' ({0} Go de RAM)', ' ({0} GB RAM)'],
  pageTitle: ['{0} – réservation des ordinateurs', '{0} – computer booking'],
  actionTitle: ['{0} – réservation', '{0} – booking'],
  status_Booked: ['Réservée', 'Booked'],
  'status_Awaiting confirmation': ['En attente de confirmation', 'Awaiting confirmation'],
  status_Confirmed: ['Confirmée', 'Confirmed'],
  status_Cancelled: ['Annulée', 'Cancelled'],
  rules: ['Ouvert : {0}, de {1} à {2}. Chaque plage dure {3} minutes et une réservation peut compter jusqu\'à {4} plage(s). ' +
    'Vous pouvez utiliser un seul ordinateur à la fois et avoir jusqu\'à {5} réservations à venir. ' +
    'Vous recevrez un courriel vous demandant de confirmer chaque réservation {6} avant son début (tant qu\'elle n\'est pas confirmée). ' +
    'Si elle n\'est pas confirmée {7} h avant le début, elle est annulée et la plage est libérée. ' +
    'Les autres personnes ne voient pas qui a réservé une plage.',
    'Open {0}, {1}–{2}. Slots are {3} minutes; one booking can be up to {4} slot(s). ' +
    'You can use one computer at a time and hold up to {5} upcoming bookings. ' +
    'You will get an email asking you to confirm each booking {6} before it starts (while it is still unconfirmed). ' +
    'If it is not confirmed {7} h before the start, it is cancelled and the slot is released to others. ' +
    'Other users cannot see who booked a slot.'],
  everyDay: ['tous les jours', 'every day'],
  and: [' et ', ' and ']
};

function T_(key) {
  const pair = MSG[key];
  let s = pair ? pair[LANG_ === 'en' ? 1 : 0] : key;
  for (let i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
  return s;
}

const EN_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NAMES = {
  fr: {
    dShort: ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'],
    dLong: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
    mShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    mLong: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  },
  en: {
    dShort: EN_DAYS,
    dLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    mShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    mLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  }
};

function parts_(d) {
  return { dow: EN_DAYS.indexOf(fmt_(d, 'EEE')), day: Number(fmt_(d, 'd')), mon: Number(fmt_(d, 'MM')) - 1, h: Number(fmt_(d, 'HH')), m: fmt_(d, 'mm') };
}
// "9 h", "9 h 30" in French; "09:00" in English
function time_(d) {
  const p = parts_(d);
  return LANG_ === 'en' ? fmt_(d, 'HH:mm') : p.h + ' h' + (p.m !== '00' ? ' ' + p.m : '');
}
// "mar. 5 nov." / "Tue 5 Nov"
function dayShort_(d) { const p = parts_(d), n = NAMES[LANG_]; return n.dShort[p.dow] + ' ' + p.day + ' ' + n.mShort[p.mon]; }
// "Mardi 5 novembre" / "Tuesday 5 November"
function dayLong_(d) {
  const p = parts_(d), n = NAMES[LANG_];
  const s = n.dLong[p.dow] + ' ' + p.day + ' ' + n.mLong[p.mon];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// "48 h et 24 h" / "48 h and 24 h"
function hoursList_(hs) {
  const parts = hs.map(h => h + ' h');
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + T_('and') + parts[parts.length - 1] : parts.join('');
}
function span_(start, end) { return dayShort_(start) + ', ' + time_(start) + '–' + time_(end); }
function whenLabel_(b) { return span_(b.start, b.end); }

/* ------------------------------------------------------------------ */
/* Menu and one-time setup                                             */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Lab booking')
    .addItem('Set up / repair', 'setup')
    .addItem('Run reminder check now', 'processBookings')
    .addItem('Load the CIQSS computer list (overwrites the Computers tab)', 'loadLabComputers')
    .addToUi();
}

/**
 * Replaces the Computers tab with DEFAULT_COMPUTERS (Poste 1–9 + Poste Antoine, Postes 5 and 8 unavailable)
 * and renames bookings made under the old names (PC-01 … PC-10) so they stay attached to a computer.
 */
function loadLabComputers() {
  const msg = withLock_(() => {
    const ss = ss_();
    const sh = ss.getSheetByName(SHEET.COMPUTERS) || ss.insertSheet(SHEET.COMPUTERS);
    sh.clearContents();
    sh.getRange('A:E').clearDataValidations();
    sh.getRange(1, 1, 1, COMPUTERS_HEADERS.length).setValues([COMPUTERS_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 3, DEFAULT_COMPUTERS.length, 1).insertCheckboxes(); // must come before the values (it resets cells to unticked)
    sh.getRange(2, 1, DEFAULT_COMPUTERS.length, COMPUTERS_HEADERS.length).setValues(DEFAULT_COMPUTERS);

    // Keep existing bookings attached: PC-01 → Poste 1, …, PC-10 → Poste Antoine
    const bk = sheet_(SHEET.BOOKINGS);
    let renamed = 0;
    if (bk.getLastRow() > 1) {
      const col = bk.getRange(2, B.COMPUTER, bk.getLastRow() - 1, 1);
      const names = col.getValues().map(r => {
        const nu = OLD_COMPUTER_NAMES[String(r[0]).trim()];
        if (nu) { renamed++; return [nu]; }
        return [r[0]];
      });
      if (renamed) col.setValues(names);
    }
    return 'Computers tab loaded (' + DEFAULT_COMPUTERS.length + ' computers). Bookings renamed to the new computer names: ' + renamed + '.';
  });
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());

  // Config
  const cfgSh = ensureSheet_(ss, SHEET.CONFIG, ['Setting', 'Value', 'What it does']);
  cfgSh.getRange('B:B').setNumberFormat('@'); // keep values as plain text (avoids "08:00" turning into a date)
  // BOOKING_HORIZON_DAYS was replaced by BOOKING_WEEKS (the calendar shows whole weeks): remove the old row
  const cfgRows = cfgSh.getDataRange().getValues();
  for (let i = cfgRows.length - 1; i >= 1; i--) {
    if (String(cfgRows[i][0]).trim() === 'BOOKING_HORIZON_DAYS') cfgSh.deleteRow(i + 1);
  }
  const existing = cfgSh.getDataRange().getValues().slice(1).map(r => String(r[0]).trim());
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  DEFAULT_CONFIG.forEach(d => {
    if (existing.indexOf(d[0]) >= 0) return;
    let v = d[1];
    if (d[0] === 'ADMIN_EMAILS' && me && v.toLowerCase().indexOf(me) < 0) v = me + ', ' + v; // the account running setup is always an admin
    cfgSh.appendRow([d[0], v, d[2]]);
  });

  // Computers
  const comp = ensureSheet_(ss, SHEET.COMPUTERS, COMPUTERS_HEADERS);
  if (comp.getLastRow() < 2) {
    comp.getRange(2, 3, DEFAULT_COMPUTERS.length, 1).insertCheckboxes();
    comp.getRange(2, 1, DEFAULT_COMPUTERS.length, COMPUTERS_HEADERS.length).setValues(DEFAULT_COMPUTERS);
  }
  if (!comp.getRange(1, 5).getValue()) comp.getRange(1, 5).setValue('Notes (English)').setFontWeight('bold'); // added with the computer notes

  // Bookings and users
  const bk = ensureSheet_(ss, SHEET.BOOKINGS, BOOKING_HEADERS);
  bk.getRange('C:D').setNumberFormat('yyyy-mm-dd hh:mm');
  bk.getRange('G:J').setNumberFormat('yyyy-mm-dd hh:mm');
  const us = ensureSheet_(ss, SHEET.USERS, USER_HEADERS);
  if (!us.getRange(1, 5).getValue()) us.getRange(1, 5).setValue('Language').setFontWeight('bold'); // added in the bilingual version

  // Remove the empty default sheet, if any
  const s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Feuille 1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);

  // Reminder / auto-cancel check every 15 minutes
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processBookings')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processBookings').timeBased().everyMinutes(15).create();

  const msg = 'Setup done. Times use the time zone ' + Session.getScriptTimeZone() +
    ' (change it under Extensions → Apps Script → Project Settings if that is wrong). Next: deploy the web app and paste its URL into Config → WEB_APP_URL.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function ensureSheet_(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ------------------------------------------------------------------ */
/* Helpers: spreadsheet, config, dates, mail                           */
/* ------------------------------------------------------------------ */

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" sheet is missing. Run "Lab booking → Set up / repair" in the spreadsheet.');
  return sh;
}

let CFG_ = null;
function cfg_() {
  if (CFG_) return CFG_;
  const raw = {};
  sheet_(SHEET.CONFIG).getDataRange().getValues().slice(1).forEach(r => {
    if (r[0]) raw[String(r[0]).trim()] = r[1];
  });
  const pos = (k, d) => { const n = Number(raw[k]); return isFinite(n) && n > 0 ? n : d; };
  const nonNeg = (k, d) => { const n = Number(raw[k]); return raw[k] !== '' && isFinite(n) && n >= 0 ? n : d; };
  const list = v => String(v || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);

  const c = {
    labName: String(raw.LAB_NAME || 'Lab').trim(),
    address: String(raw.LAB_ADDRESS || '').trim(),
    contact: String(raw.LAB_CONTACT || '').trim(),
    replyTo: String(raw.REPLY_TO || '').trim(),
    webUrl: String(raw.WEB_APP_URL || '').trim().split('?')[0],
    admins: list(raw.ADMIN_EMAILS),
    domains: list(raw.ALLOWED_EMAIL_DOMAINS).map(d => d.replace(/^@/, '')),
    slotMin: Math.round(pos('SLOT_MINUTES', 60)),
    dayStart: toMinutes_(raw.DAY_START, 9 * 60),
    dayEnd: toMinutes_(raw.DAY_END, 17 * 60),
    openDays: list(raw.OPEN_DAYS).map(s => s.slice(0, 3)),
    weeks: Math.round(pos('BOOKING_WEEKS', 4)),
    maxSlots: Math.round(pos('MAX_SLOTS_PER_BOOKING', 8)),
    maxUpcoming: Math.round(pos('MAX_UPCOMING_BOOKINGS', 5)),
    deadlineH: nonNeg('CONFIRM_DEADLINE_HOURS', 8)
  };
  // Reminder emails: a list of hours before the start, e.g. "48, 24" (largest first). Only hours before the deadline count.
  c.reminders = String(raw.CONFIRM_REMINDER_HOURS == null || raw.CONFIRM_REMINDER_HOURS === '' ? '48' : raw.CONFIRM_REMINDER_HOURS)
    .split(/[,;\s]+/).map(Number).filter(h => isFinite(h) && h > c.deadlineH)
    .sort((a, b) => b - a);
  if (!c.reminders.length) c.reminders = [c.deadlineH + 1];
  c.reminderH = c.reminders[c.reminders.length - 1]; // the last reminder: bookings made after it are confirmed right away
  CFG_ = c;
  return c;
}

function toMinutes_(v, dflt) {
  if (v instanceof Date) v = Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'HH:mm');
  const m = /^(\d{1,2})[:h](\d{2})$/.exec(String(v || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : dflt;
}

function webUrl_() {
  return cfg_().webUrl || ScriptApp.getService().getUrl() || '';
}

function tz_() { return Session.getScriptTimeZone(); }
function fmt_(d, pattern) { return Utilities.formatDate(d, tz_(), pattern); }

function ymd_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error(T_('invalidDate'));
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}
// Date for a day (yyyy-MM-dd) plus a number of minutes after midnight, in the script time zone
function dayAt_(s, minutes) { const a = ymd_(s); return new Date(a[0], a[1], a[2], 0, minutes); }
function addDays_(s, n) { const a = ymd_(s); return fmt_(new Date(a[0], a[1], a[2] + n, 12), 'yyyy-MM-dd'); }
function today_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
function slotCount_(c) { return Math.max(0, Math.floor((c.dayEnd - c.dayStart) / c.slotMin)); }
function slotTime_(s, i, c) { return dayAt_(s, c.dayStart + i * c.slotMin); }

function isOpenDay_(s, c) {
  return !c.openDays.length || c.openDays.indexOf(fmt_(dayAt_(s, 720), 'EEE').toLowerCase().slice(0, 3)) >= 0;
}

// Day of the week of a yyyy-MM-dd date: 0 = Monday … 6 = Sunday
function dow_(s) { return EN_DAYS.indexOf(fmt_(dayAt_(s, 720), 'EEE')); }

// Monday of the first calendar week: the week of the next open day (so on a weekend the calendar starts next week)
function calendarStart_(c) {
  const t = today_();
  let first = t;
  for (let i = 0; i < 7; i++) {
    const d = addDays_(t, i);
    if (isOpenDay_(d, c)) { first = d; break; }
  }
  return addDays_(first, -dow_(first));
}

// Days of the week shown as calendar columns (0 = Monday), in order
function calendarCols_(c) {
  return [0, 1, 2, 3, 4, 5, 6].filter(k => !c.openDays.length || c.openDays.indexOf(EN_DAYS[k].toLowerCase()) >= 0);
}

// Bookable days: open days from today to the end of the last calendar week
function bookableDates_(c) {
  const out = [];
  const t = today_();
  const start = calendarStart_(c);
  for (let i = 0; i < c.weeks * 7; i++) {
    const d = addDays_(start, i);
    if (d >= t && isOpenDay_(d, c)) out.push({ value: d, label: dayShort_(dayAt_(d, 720)) });
  }
  return out;
}

/**
 * The calendar: one row per week, one cell per open day. Each cell says how many
 * computer-slots are still free and whether the person has a booking that day.
 */
function calendar_(c, comps, active, email) {
  const t = today_();
  const start = calendarStart_(c);
  const cols = calendarCols_(c);
  const n = slotCount_(c);
  const now = Date.now();
  const usable = comps.filter(cp => cp.available);
  const names = NAMES[LANG_];
  const weeks = [];
  for (let w = 0; w < c.weeks; w++) {
    weeks.push(cols.map(k => {
      const d = addDays_(start, w * 7 + k);
      const p = parts_(dayAt_(d, 720));
      const cell = { value: d, day: p.day, mon: names.mShort[p.mon] };
      const dayStart = slotTime_(d, 0, c).getTime();
      const dayEnd = slotTime_(d, n, c).getTime();
      if (d < t || dayEnd <= now) { cell.st = 'past'; return cell; }
      const dayBks = active.filter(b => b.start.getTime() < dayEnd && b.end.getTime() > dayStart);
      let free = 0, total = 0;
      for (let i = 0; i < n; i++) {
        const s = slotTime_(d, i, c).getTime(), e = slotTime_(d, i + 1, c).getTime();
        if (e <= now) continue;
        usable.forEach(cp => {
          total++;
          if (!dayBks.some(b => b.computer === cp.name && b.start.getTime() < e && b.end.getTime() > s)) free++;
        });
      }
      cell.st = free > 0 ? 'open' : 'full';
      cell.free = free;
      cell.total = total;
      cell.mine = dayBks.some(b => b.email === email);
      return cell;
    }));
  }
  return { heads: cols.map(k => names.dShort[k]), weeks: weeks };
}

function checkDate_(s, c) {
  if (!bookableDates_(c).some(d => d.value === s)) throw new Error(T_('dateNotBookable'));
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function button_(href, label) {
  return '<a href="' + esc_(href) + '" style="display:inline-block;padding:10px 18px;margin:4px 8px 4px 0;background:#1a5fb4;color:#fff;text-decoration:none;border-radius:6px">' + esc_(label) + '</a>';
}

function sendMail_(to, subject, bodyHtml, addPageLink) {
  const c = cfg_();
  let html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">' + bodyHtml;
  html += '<p style="margin-top:24px;font-size:13px;color:#666">';
  if (addPageLink) html += '<a href="' + esc_(personalLink_(to)) + '">' + esc_(T_('openPage')) + '</a><br>';
  html += esc_(c.labName) + (c.address ? '<br>' + esc_(c.address) : '') + (c.contact ? '<br>' + esc_(T_('questions', c.contact)) : '') + '</p>';
  html += '</div>';
  const msg = { to: to, subject: subject, htmlBody: html, name: c.labName };
  if (c.replyTo) msg.replyTo = c.replyTo;
  MailApp.sendEmail(msg);
}

// Sends mail but never throws (e.g. when the daily email quota is used up). Returns true on success.
function safeMail_(to, subject, bodyHtml, addPageLink) {
  try { sendMail_(to, subject, bodyHtml, addPageLink); return true; }
  catch (e) { Logger.log('Email to ' + to + ' failed: ' + e); return false; }
}

// Runs fn with the language set to the recipient's preferred language, then restores the current one.
function inUserLang_(email, fn) {
  const prev = LANG_;
  setLang_(userLang_(email));
  try { return fn(); } finally { LANG_ = prev; }
}

/* ------------------------------------------------------------------ */
/* Users (email + personal sign-in link + language)                    */
/* ------------------------------------------------------------------ */

function findUser_(predicate) {
  const sh = sheet_(SHEET.USERS);
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (predicate(v[i])) {
      return { sh: sh, row: i + 1, email: String(v[i][0]).toLowerCase(), token: String(v[i][1]), lastSent: v[i][3], lang: cleanLang_(String(v[i][4] || '')) };
    }
  }
  return null;
}

function findUserByEmail_(email) {
  email = String(email).toLowerCase();
  return findUser_(r => String(r[0]).toLowerCase() === email);
}

function userLang_(email) {
  const u = findUserByEmail_(email);
  return u && u.lang ? u.lang : 'fr';
}

function saveLang_(u, lang) {
  if (lang && u.lang !== lang) { u.sh.getRange(u.row, 5).setValue(lang); u.lang = lang; }
}

function requireUser_(token) {
  token = String(token || '');
  const u = UUID_RE.test(token) ? findUser_(r => String(r[1]) === token) : null;
  if (!u) throw new Error(T_('linkInvalid'));
  return { email: u.email, isAdmin: cfg_().admins.indexOf(u.email) >= 0, rec: u };
}

function personalLink_(email) {
  const u = findUserByEmail_(email);
  return u ? webUrl_() + '?s=' + u.token + '&lang=' + (u.lang || LANG_) : webUrl_();
}

/** Called from the sign-in form. Registers the email if new and emails a personal sign-in link. */
function requestLoginLink(email, lang) {
  setLang_(lang);
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(T_('invalidEmail'));
  const c = cfg_();
  const domain = email.split('@')[1];
  const allowed = !c.domains.length || c.admins.indexOf(email) >= 0 ||
    c.domains.some(d => domain === d || domain.endsWith('.' + d));
  if (!allowed) throw new Error(T_('domainOnly', c.domains.join(', ')));

  return withLock_(() => {
    const now = new Date();
    let u = findUserByEmail_(email);
    if (!u) {
      sheet_(SHEET.USERS).appendRow([email, Utilities.getUuid(), now, '', LANG_]);
      u = findUserByEmail_(email);
    } else if (u.lastSent instanceof Date && now - u.lastSent < 2 * 60 * 1000) {
      return T_('linkRecent', email);
    }
    saveLang_(u, LANG_);
    const link = webUrl_() + '?s=' + u.token + '&lang=' + LANG_;
    sendMail_(email, T_('linkSubject', c.labName), T_('linkIntro') + '<p>' + button_(link, T_('openPage')) + '</p>' + T_('linkKeep'), false);
    u.sh.getRange(u.row, 4).setValue(now);
    return T_('linkSent', email);
  });
}

/* ------------------------------------------------------------------ */
/* Bookings                                                             */
/* ------------------------------------------------------------------ */

function readBookings_() {
  const v = sheet_(SHEET.BOOKINGS).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    if (!r[B.ID - 1]) continue;
    out.push({
      row: i + 1,
      id: String(r[B.ID - 1]),
      computer: String(r[B.COMPUTER - 1]),
      start: new Date(r[B.START - 1]),
      end: new Date(r[B.END - 1]),
      email: String(r[B.EMAIL - 1]).toLowerCase(),
      status: String(r[B.STATUS - 1]),
      created: r[B.CREATED - 1] instanceof Date ? r[B.CREATED - 1] : null,
      reminded: r[B.REMINDED - 1] instanceof Date ? r[B.REMINDED - 1] : null,
      key: String(r[B.KEY - 1])
    });
  }
  return out;
}

function isActive_(b) { return ACTIVE_STATUSES.indexOf(b.status) >= 0; }

function setCells_(row, values) {
  const sh = sheet_(SHEET.BOOKINGS);
  Object.keys(values).forEach(col => sh.getRange(row, Number(col)).setValue(values[col]));
}

function cancel_(b, reason) {
  setCells_(b.row, { [B.STATUS]: STATUS.CANCELLED, [B.CANCELLED]: new Date(), [B.REASON]: reason });
}

function confirm_(b) {
  setCells_(b.row, { [B.STATUS]: STATUS.CONFIRMED, [B.CONFIRMED]: new Date() });
}

// Computers tab columns: Computer | RAM (GB) | Available | Notes | Notes (English)
// Every listed computer is returned; unticked "Available" ones are shown greyed out and cannot be booked.
let COMPS_ = null;
function computers_() {
  if (COMPS_) return COMPS_;
  COMPS_ = sheet_(SHEET.COMPUTERS).getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim())
    .map(r => ({
      name: String(r[0]).trim(),
      ram: String(r[1] || '').trim(),
      available: r[2] !== false && !/^(false|no|non)$/i.test(String(r[2]).trim()),
      noteFr: String(r[3] || '').trim(),
      noteEn: String(r[4] || '').trim()
    }));
  return COMPS_;
}

// The note of a computer in the current language (falls back to the French note)
function compNote_(cp) { return LANG_ === 'en' && cp.noteEn ? cp.noteEn : cp.noteFr; }

function ramLabel_(name) {
  const c = computers_().find(x => x.name === name);
  return c && c.ram ? T_('ram', c.ram) : '';
}

function view_(b) {
  return { id: b.id, computer: b.computer + ramLabel_(b.computer), when: whenLabel_(b), status: b.status, email: b.email };
}

/* ------------------------------------------------------------------ */
/* Functions called from the booking page                              */
/* ------------------------------------------------------------------ */

function getSession(token, lang) {
  setLang_(lang);
  const u = requireUser_(token);
  saveLang_(u.rec, LANG_); // emails follow the language the person last used on the site
  const c = cfg_();
  const n = NAMES[LANG_];
  const days = c.openDays.length
    ? c.openDays.map(d => n.dLong[EN_DAYS.map(x => x.toLowerCase()).indexOf(d)] || d).join(', ')
    : T_('everyDay');
  const clock = m => time_(new Date(2000, 0, 3, 0, m));
  return {
    email: u.email,
    isAdmin: u.isAdmin,
    labName: c.labName,
    address: c.address,
    contact: c.contact,
    dates: bookableDates_(c),
    rules: T_('rules', days, clock(c.dayStart), clock(c.dayEnd), c.slotMin, c.maxSlots, c.maxUpcoming, hoursList_(c.reminders), c.deadlineH)
  };
}

function getDay(token, dateStr, lang) {
  setLang_(lang);
  const u = requireUser_(token);
  const c = cfg_();
  checkDate_(dateStr, c);
  const comps = computers_();
  const n = slotCount_(c);
  const now = Date.now();
  const dayStart = slotTime_(dateStr, 0, c).getTime();
  const dayEnd = slotTime_(dateStr, n, c).getTime();
  const active = readBookings_().filter(isActive_);
  const bks = active.filter(b => b.start.getTime() < dayEnd && b.end.getTime() > dayStart);

  const slots = [];
  for (let i = 0; i < n; i++) {
    const s = slotTime_(dateStr, i, c), e = slotTime_(dateStr, i + 1, c);
    slots.push({ s: s.getTime(), e: e.getTime(), startLabel: time_(s), endLabel: time_(e) });
  }

  const cells = slots.map(sl => comps.map(cp => {
    const b = bks.find(x => x.computer === cp.name && x.start.getTime() < sl.e && x.end.getTime() > sl.s);
    if (b) {
      const mine = b.email === u.email;
      if (mine || u.isAdmin) return { st: mine ? 'mine' : 'taken', id: b.id, when: whenLabel_(b), status: b.status, who: u.isAdmin ? b.email : '' };
      return { st: 'taken' };
    }
    if (!cp.available) return { st: 'off' };
    return { st: sl.e <= now ? 'past' : 'free' };
  }));

  // For each free cell: how many consecutive free slots start there (capped at the max booking length)
  for (let j = 0; j < comps.length; j++) {
    let run = 0;
    for (let i = n - 1; i >= 0; i--) {
      run = cells[i][j].st === 'free' ? run + 1 : 0;
      if (cells[i][j].st === 'free') cells[i][j].run = Math.min(run, c.maxSlots);
    }
  }

  return {
    dateLabel: dayLong_(dayAt_(dateStr, 720)),
    computers: comps.map(cp => ({ name: cp.name, ram: cp.ram, available: cp.available, note: compNote_(cp) })),
    slots: slots.map(s => ({ startLabel: s.startLabel, endLabel: s.endLabel })),
    cells: cells,
    calendar: calendar_(c, comps, active, u.email)
  };
}

function createBooking(token, computer, dateStr, slotIndex, numSlots, lang) {
  setLang_(lang);
  const u = requireUser_(token);
  const c = cfg_();
  checkDate_(dateStr, c);
  computer = String(computer);
  if (!computers_().some(x => x.name === computer && x.available)) throw new Error(T_('notAvailable'));
  const n = slotCount_(c);
  slotIndex = Number(slotIndex);
  numSlots = Number(numSlots);
  if (!(Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < n)) throw new Error(T_('invalidSlot'));
  if (!(Number.isInteger(numSlots) && numSlots >= 1 && numSlots <= c.maxSlots && slotIndex + numSlots <= n)) throw new Error(T_('invalidLength'));
  const start = slotTime_(dateStr, slotIndex, c);
  const end = slotTime_(dateStr, slotIndex + numSlots, c);
  const firstSlotEnd = slotTime_(dateStr, slotIndex + 1, c);

  return withLock_(() => {
    const now = new Date();
    if (firstSlotEnd <= now) throw new Error(T_('passed'));
    const active = readBookings_().filter(isActive_);
    if (active.some(b => b.computer === computer && b.start < end && b.end > start)) throw new Error(T_('justBooked'));
    const clash = active.find(b => b.email === u.email && b.start < end && b.end > start); // applies to admins too
    if (clash) throw new Error(T_('clash', clash.computer, whenLabel_(clash)));
    if (!u.isAdmin && active.filter(b => b.email === u.email && b.end > now).length >= c.maxUpcoming) {
      throw new Error(T_('maxUpcoming', c.maxUpcoming));
    }
    // Booked inside the reminder window → no confirmation email needed, confirm it right away
    const auto = now.getTime() >= start.getTime() - c.reminderH * HOUR;
    sheet_(SHEET.BOOKINGS).appendRow([
      Utilities.getUuid(), computer, start, end, u.email,
      auto ? STATUS.CONFIRMED : STATUS.BOOKED, now, '', auto ? now : '', '', '', Utilities.getUuid()
    ]);
    const what = computer + ramLabel_(computer);
    if (auto) return T_('bookedAuto', what, span_(start, end));
    const upcoming = c.reminders.filter(h => now.getTime() < start.getTime() - h * HOUR); // reminders this booking will get
    return T_('bookedLater', what, span_(start, end), hoursList_(upcoming), c.deadlineH);
  });
}

function cancelBooking(token, id, lang) {
  setLang_(lang);
  const u = requireUser_(token);
  return withLock_(() => {
    const b = readBookings_().find(x => x.id === String(id));
    if (!b || !isActive_(b)) throw new Error(T_('noLonger'));
    const mine = b.email === u.email;
    if (!mine && !u.isAdmin) throw new Error(T_('onlyOwnCancel'));
    if (b.end <= new Date()) throw new Error(T_('ended'));
    cancel_(b, mine ? 'Cancelled by user' : 'Cancelled by admin (' + u.email + ')');
    if (!mine) {
      inUserLang_(b.email, () => safeMail_(b.email, T_('adminCancelSubject', b.computer, whenLabel_(b)),
        T_('adminCancelBody', esc_(b.computer), esc_(whenLabel_(b))), true));
    }
    return T_('cancelledMsg');
  });
}

function confirmBooking(token, id, lang) {
  setLang_(lang);
  const u = requireUser_(token);
  return withLock_(() => {
    const b = readBookings_().find(x => x.id === String(id));
    if (!b || !isActive_(b)) throw new Error(T_('noLonger'));
    if (b.email !== u.email) throw new Error(T_('onlyOwnConfirm'));
    if (b.status !== STATUS.CONFIRMED) confirm_(b);
    return T_('confirmedMsg');
  });
}

function getMyBookings(token, lang) {
  setLang_(lang);
  const u = requireUser_(token);
  const now = new Date();
  return readBookings_()
    .filter(b => isActive_(b) && b.email === u.email && b.end > now)
    .sort((a, b) => a.start - b.start)
    .map(view_);
}

function getAllUpcoming(token, lang) {
  setLang_(lang);
  const u = requireUser_(token);
  if (!u.isAdmin) throw new Error(T_('adminsOnly'));
  const now = new Date();
  return readBookings_()
    .filter(b => isActive_(b) && b.end > now)
    .sort((a, b) => a.start - b.start)
    .map(view_);
}

/* ------------------------------------------------------------------ */
/* Confirm / cancel links in emails                                     */
/* ------------------------------------------------------------------ */

function actionUrl_(b, action) {
  return webUrl_() + '?action=' + action + '&id=' + b.id + '&k=' + b.key + '&lang=' + LANG_;
}

// The email link opens a page with a button; the change happens only when the button is pressed.
// (This stops email link scanners, e.g. Outlook Safe Links, from confirming or cancelling by accident.)
function emailAction(id, key, action, lang) {
  setLang_(lang);
  return withLock_(() => {
    const b = readBookings_().find(x => x.id === String(id) && x.key === String(key));
    if (!b) throw new Error(T_('linkNotValid'));
    const link = personalLink_(b.email);
    if (!isActive_(b)) return { message: T_('alreadyCancelled'), link: link, linkText: T_('openPage') };
    if (b.end <= new Date()) return { message: T_('ended'), link: link, linkText: T_('openPage') };
    if (action === 'confirm') {
      if (b.status !== STATUS.CONFIRMED) confirm_(b);
      return { message: T_('confirmedWhat', b.computer, whenLabel_(b)), link: link, linkText: T_('openPage') };
    }
    if (action === 'cancel') {
      cancel_(b, 'Cancelled by user (email link)');
      return { message: T_('cancelledFree'), link: link, linkText: T_('openPage') };
    }
    throw new Error('Unknown action.');
  });
}

function actionPage_(p) {
  const c = cfg_();
  const valid = UUID_RE.test(p.id || '') && UUID_RE.test(p.k || '');
  const b = valid ? readBookings_().find(x => x.id === p.id && x.key === p.k) : null;
  let body;
  if (!b) {
    body = '<p>' + esc_(T_('linkNotValid')) + '</p>';
  } else if (!isActive_(b)) {
    body = '<p><b>' + esc_(b.computer) + '</b><br>' + esc_(whenLabel_(b)) + '</p><p>' + esc_(T_('alreadyCancelled')) + '</p>';
  } else {
    const label = p.action === 'confirm' ? T_('btnStillNeed') : T_('btnCancelThis');
    const color = p.action === 'confirm' ? '#1a5fb4' : '#b3261e';
    body = '<p><b>' + esc_(b.computer) + '</b><br>' + esc_(whenLabel_(b)) +
      '<br><span style="color:#666">' + esc_(T_('statusLabel', T_('status_' + b.status))) + '</span></p>' +
      '<button id="go" style="font-size:16px;padding:10px 18px;border:0;border-radius:6px;color:#fff;background:' + color + ';cursor:pointer">' + esc_(label) + '</button>' +
      '<p id="out"></p>' +
      '<script>' +
      'document.getElementById("go").onclick=function(){var btn=this;btn.disabled=true;' +
      'google.script.run.withSuccessHandler(function(r){btn.style.display="none";var o=document.getElementById("out");o.textContent=r.message+" ";' +
      'var a=document.createElement("a");a.href=r.link;a.target="_top";a.textContent=r.linkText;o.appendChild(a);})' +
      '.withFailureHandler(function(e){btn.disabled=false;document.getElementById("out").textContent=e.message;})' +
      '.emailAction(' + JSON.stringify(b.id) + ',' + JSON.stringify(b.key) + ',' + JSON.stringify(p.action) + ',' + JSON.stringify(LANG_) + ');};' +
      '</script>';
  }
  return HtmlService.createHtmlOutput(
    '<base target="_top"><div lang="' + LANG_ + '" style="font-family:Arial,sans-serif;font-size:16px;max-width:420px;margin:40px auto;padding:0 16px">' +
    '<h2>' + esc_(c.labName) + '</h2>' + body + '</div>')
    .setTitle(T_('actionTitle', c.labName))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ------------------------------------------------------------------ */
/* Web app entry point                                                  */
/* ------------------------------------------------------------------ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const urlLang = cleanLang_(p.lang);
  setLang_(urlLang);
  if (p.action === 'confirm' || p.action === 'cancel') return actionPage_(p);
  const c = cfg_();
  const t = HtmlService.createTemplateFromFile('Index');
  t.tokenJson = JSON.stringify(UUID_RE.test(p.s || '') ? p.s : '');
  t.langJson = JSON.stringify(urlLang);
  t.labJson = JSON.stringify(c.labName).replace(/</g, '\\u003c');
  t.labName = c.labName;
  return t.evaluate()
    .setTitle(T_('pageTitle', c.labName))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ------------------------------------------------------------------ */
/* Every 15 minutes: send confirmation requests, release unconfirmed   */
/* ------------------------------------------------------------------ */

function processBookings() {
  const c = cfg_();
  withLock_(() => {
    const now = Date.now();
    const langOf = {};
    sheet_(SHEET.USERS).getDataRange().getValues().slice(1).forEach(r => {
      langOf[String(r[0]).toLowerCase()] = cleanLang_(String(r[4] || '')) || 'fr';
    });
    readBookings_().filter(isActive_).forEach(b => {
      const s = b.start.getTime();
      if (b.end.getTime() <= now || b.status === STATUS.CONFIRMED) return;
      setLang_(langOf[b.email] || 'fr');
      const when = whenLabel_(b);

      if (now >= s - c.deadlineH * HOUR) {
        cancel_(b, 'Not confirmed in time');
        safeMail_(b.email, T_('releasedSubject', b.computer, when), T_('releasedBody', esc_(b.computer), esc_(when)), true);
        return;
      }
      // Reminders this booking qualifies for: made before the reminder time, and that time has come
      const created = b.created ? b.created.getTime() : 0;
      const due = c.reminders.filter(h => created < s - h * HOUR && now >= s - h * HOUR);
      if (!due.length) return;
      const latestDue = s - due[due.length - 1] * HOUR;            // time of the most recent reminder that is due
      if (b.reminded && b.reminded.getTime() >= latestDue) return; // already sent

      const dl = new Date(s - c.deadlineH * HOUR);
      const deadline = dayShort_(dl) + ', ' + time_(dl);
      const sent = safeMail_(b.email, T_('confirmSubject', b.computer, when),
        T_('confirmBody', esc_(b.computer), esc_(when), esc_(deadline)) +
        '<p>' + button_(actionUrl_(b, 'confirm'), T_('btnStillNeed')) + button_(actionUrl_(b, 'cancel'), T_('btnCancelIt')) + '</p>', true);
      if (sent) setCells_(b.row, { [B.STATUS]: STATUS.AWAITING, [B.REMINDED]: new Date() });
    });
  });
}
