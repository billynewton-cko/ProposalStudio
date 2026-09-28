'use strict';
/**
 * Per-user notification files: data/notifications/<email>.json
 *
 * Each user's notifications live in their own file, so reads only load the
 * relevant data and writes never contend across different users.
 *
 * On first startup, migrateIfNeeded() distributes any existing flat
 * notifications.json into per-user files.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR, NOTIFICATIONS_DIR, NOTIFICATIONS_FILE } = require('../config');

function ensureDir() {
  fs.mkdirSync(NOTIFICATIONS_DIR, { recursive: true });
}

/** Sanitise an email address for use as a filename. */
function userFile(email) {
  const safe = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
  return path.join(NOTIFICATIONS_DIR, `${safe}.json`);
}

function findFor(email) {
  try {
    const raw = JSON.parse(fs.readFileSync(userFile(email), 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('notifications read error:', e.message);
    return [];
  }
}

function writeFor(email, arr) {
  ensureDir();
  const file = userFile(email);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr));
  fs.renameSync(tmp, file);
}

/* ── Migration from legacy flat file ── */

function migrateIfNeeded() {
  if (!fs.existsSync(NOTIFICATIONS_FILE)) return;
  let all;
  try {
    all = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    if (!Array.isArray(all)) all = [];
  } catch {
    return;
  }
  if (all.length === 0) {
    try { fs.renameSync(NOTIFICATIONS_FILE, NOTIFICATIONS_FILE + '.migrated'); } catch {}
    return;
  }
  console.log('[notifications] Migrating flat notifications.json to per-user files…');
  ensureDir();
  const byUser = {};
  for (const n of all) {
    if (!n.toEmail) continue;
    const key = n.toEmail.toLowerCase();
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(n);
  }
  for (const [email, notifs] of Object.entries(byUser)) {
    writeFor(email, notifs);
  }
  try {
    fs.renameSync(NOTIFICATIONS_FILE, NOTIFICATIONS_FILE + '.migrated');
  } catch {}
  console.log('[notifications] Migration complete.');
}

migrateIfNeeded();

module.exports = { findFor, writeFor };
