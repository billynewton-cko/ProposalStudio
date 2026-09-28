'use strict';
/**
 * Image files now live inside the RFP folder:
 *   data/rfps/<title-slug>/images/<slot>.<ext>
 *
 * The docId is the internal rfp id; we look up the slug via rfpIndex to
 * resolve the physical path.
 */
const fs = require('fs');
const path = require('path');
const { RFPS_DIR } = require('../config');
const { ensureDir } = require('../lib/fsJson');
const rfpIndex = require('../lib/rfpIndex');

function rfpDirFor(docId) {
  const slug = rfpIndex.getSlug(docId);
  return path.join(RFPS_DIR, slug || docId);
}

function dirFor(docId) {
  return path.join(rfpDirFor(docId), 'images');
}

function write(docId, fileName, buffer) {
  const dir = dirFor(docId);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, fileName), buffer);
}

function copyFrom(sourceId, sourceFile, docId, fileName) {
  const srcPath = path.join(dirFor(sourceId), sourceFile);
  const dir = dirFor(docId);
  ensureDir(dir);
  fs.copyFileSync(srcPath, path.join(dir, fileName));
}

function removeAllFor(docId) {
  try {
    fs.rmSync(dirFor(docId), { recursive: true, force: true });
  } catch (err) {
    console.error(`Failed to delete images for ${docId}:`, err);
  }
}

/** Resolves a requested image path, guarding against traversal outside the dir. */
function resolveSafe(rawId, rawFile) {
  const id = path.basename(rawId);
  const file = path.basename(rawFile);
  const dir = dirFor(id);
  const filePath = path.join(dir, file);
  if (path.dirname(filePath) !== dir) return null;
  return { id, file, filePath };
}

module.exports = { dirFor, write, copyFrom, removeAllFor, resolveSafe };
