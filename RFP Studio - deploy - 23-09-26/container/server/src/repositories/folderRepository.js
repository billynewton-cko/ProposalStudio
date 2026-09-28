'use strict';
/**
 * Folders are a small index file (folders.json) rather than derived state,
 * since there is no per-folder file to derive them from — an RFP only
 * points at its folder via doc.folderId, it does not list its members.
 */
const { FOLDERS_FILE } = require('../config');
const { readJsonSafe, writeJsonAtomic } = require('../lib/fsJson');

function findAll() {
  const data = readJsonSafe(FOLDERS_FILE);
  return Array.isArray(data) ? data : [];
}

function writeAll(folders) {
  writeJsonAtomic(FOLDERS_FILE, folders);
}

function findById(id) {
  return findAll().find(f => f.id === id) || null;
}

module.exports = { findAll, writeAll, findById };
