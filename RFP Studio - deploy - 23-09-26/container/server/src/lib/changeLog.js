'use strict';
/**
 * Append-only audit trail for each RFP.
 * Stored at data/rfps/<id>/changes.json.
 */
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./fsJson');

function getRfpsDir() {
  return require('../config').RFPS_DIR;
}

function changesPath(id) {
  const rfpIndex = require('./rfpIndex');
  const slug = rfpIndex.getSlug(id);
  return path.join(getRfpsDir(), slug || id, 'changes.json');
}

function readChanges(id) {
  const p = changesPath(id);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

const MAX_ENTRIES = 500;

function append(id, user, action, detail) {
  const p = changesPath(id);
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
  const log = readChanges(id);
  log.push({
    ts: Date.now(),
    iso: new Date().toISOString(),
    user: user || 'unknown',
    action,
    detail: detail || '',
  });
  writeJsonAtomic(p, log.length > MAX_ENTRIES ? log.slice(-MAX_ENTRIES) : log);
}

module.exports = { append, readChanges };
