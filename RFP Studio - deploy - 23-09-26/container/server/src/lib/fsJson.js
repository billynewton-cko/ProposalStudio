'use strict';
/**
 * Filesystem helpers. Unchanged in behaviour from the original single-file
 * server: reads tolerate a missing file, writes are atomic via temp-file rename
 * so a crash or a concurrent autosave can never leave a truncated RFP.
 */
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Returns parsed JSON, or null if the file doesn't exist. Rethrows other errors. */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write JSON atomically: write to a temp file in the same directory, then
 * rename over the target.
 */
function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

module.exports = { ensureDir, readJsonSafe, writeJsonAtomic };
