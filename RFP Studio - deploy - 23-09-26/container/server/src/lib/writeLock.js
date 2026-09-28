'use strict';
/**
 * Serializes writes per RFP id so a debounced-autosave retry can't
 * interleave with itself mid-flight (e.g. a slow save still in progress when
 * the retry timer fires) and corrupt the file or race image extraction.
 * Reads are not serialized — only PUT/DELETE.
 */
const writeLocks = new Map();

function withWriteLock(id, fn) {
  const prior = writeLocks.get(id) || Promise.resolve();
  const run = prior.then(fn, fn);
  const settled = run.then(() => {}, () => {});
  writeLocks.set(id, settled);
  settled.finally(() => {
    if (writeLocks.get(id) === settled) writeLocks.delete(id);
  });
  return run;
}

module.exports = { withWriteLock };
