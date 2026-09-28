'use strict';
/**
 * Server-side guard against corrupt client saves. Returns an array of error
 * strings; empty means valid.
 */
const KNOWN_BLOCK_TYPES = new Set([
  'grouphead', 'subhead', 'paragraph', 'bullets',
  'two_col_list', 'numbered_steps', 'kv', 'table', 'spacer',
]);

function validateProposal(doc, id) {
  const errs = [];
  if (doc.id !== id) errs.push('id mismatch');
  if (!doc.meta || typeof doc.meta !== 'object') errs.push('meta must be an object');
  if (!Array.isArray(doc.sections)) errs.push('sections must be an array');

  if (doc.meta && doc.meta.accentColor !== undefined) {
    if (typeof doc.meta.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(doc.meta.accentColor)) {
      errs.push('meta.accentColor must be a 6-digit hex colour like #1a2b3c');
    }
  }

  if (Array.isArray(doc.sections)) {
    for (let si = 0; si < doc.sections.length; si++) {
      const s = doc.sections[si];
      if (!s || typeof s !== 'object') { errs.push(`sections[${si}] is not an object`); continue; }
      if (!Array.isArray(s.blocks)) { errs.push(`sections[${si}].blocks must be an array`); continue; }
      for (let bi = 0; bi < s.blocks.length; bi++) {
        const b = s.blocks[bi];
        if (!b || typeof b !== 'object') { errs.push(`sections[${si}].blocks[${bi}] is not an object`); continue; }
        if (!b.type || !KNOWN_BLOCK_TYPES.has(b.type)) {
          errs.push(`sections[${si}].blocks[${bi}]: missing or unknown block type "${b.type}"`);
        }
      }
    }
  }
  return errs;
}

module.exports = { KNOWN_BLOCK_TYPES, validateProposal };
