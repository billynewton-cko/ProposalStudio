'use strict';
/**
 * Templates live at DATA_DIR/templates/<id>.json.
 * Visibility: 'public' = visible to all authenticated users; 'private' = owner only.
 * Archived templates are hidden from listings but never hard-deleted, so RFPs
 * referencing them continue to resolve their design fields correctly.
 */
const fs = require('fs');
const path = require('path');
const { TEMPLATES_DIR } = require('../config');
const { readJsonSafe, writeJsonAtomic, ensureDir } = require('../lib/fsJson');

function filePath(id) {
  return path.join(TEMPLATES_DIR, `${id}.json`);
}

function findById(id) {
  return readJsonSafe(filePath(path.basename(String(id))));
}

function save(template) {
  ensureDir(TEMPLATES_DIR);
  writeJsonAtomic(filePath(template.id), template);
  return template;
}

function remove(id) {
  try {
    fs.unlinkSync(filePath(path.basename(String(id))));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

/** Returns every template the given email may see (public, or owned by them). */
function findAllVisibleTo(email) {
  let files;
  try {
    files = fs.readdirSync(TEMPLATES_DIR);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const templates = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8'));
      if (t.visibility === 'public' || t.owner === email) templates.push(t);
    } catch (err) {
      console.error(`Skipping unreadable template ${file}: ${err.message}`);
    }
  }
  return templates;
}

module.exports = { filePath, findById, save, remove, findAllVisibleTo };
