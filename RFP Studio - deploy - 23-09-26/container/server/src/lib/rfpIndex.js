'use strict';
/**
 * Shared slug index: maps rfp id → human-readable folder slug.
 * Stored at RFPS_DIR/.index.json.
 *
 * Kept in its own module to break the circular dependency that would arise if
 * imageRepository imported rfpRepository (or vice versa) solely to resolve
 * the rfp folder path.
 */
const fs = require('fs');
const path = require('path');
const { RFPS_DIR } = require('../config');
const { writeJsonAtomic, ensureDir } = require('./fsJson');

const INDEX_FILE = path.join(RFPS_DIR, '.index.json');

let _cache = null; // { [id]: slug }

function _load() {
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    _cache = (typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  } catch {
    _cache = {};
  }
}

function _flush() {
  ensureDir(RFPS_DIR);
  writeJsonAtomic(INDEX_FILE, _cache);
}

function getSlug(id) {
  if (_cache === null) _load();
  return _cache[id] || null;
}

function setSlug(id, slug) {
  if (_cache === null) _load();
  _cache[id] = slug;
  _flush();
}

function removeEntry(id) {
  if (_cache === null) _load();
  if (_cache[id] !== undefined) {
    delete _cache[id];
    _flush();
  }
}

function getAllSlugs() {
  if (_cache === null) _load();
  return new Set(Object.values(_cache));
}

function invalidate() {
  _cache = null;
}

function titleToSlug(title) {
  return (title || 'rfp')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'rfp';
}

/**
 * Returns a slug that is unique among all currently registered slugs.
 * If `title` is already taken, appends -2, -3, etc.
 */
function uniqueSlug(title) {
  const base = titleToSlug(title);
  const existing = getAllSlugs();
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

module.exports = { getSlug, setSlug, removeEntry, getAllSlugs, invalidate, titleToSlug, uniqueSlug };
