'use strict';
/**
 * For an editor (not a bid_manager) saving a doc, verify they have assignment
 * rights to every response they touched — changed, added, deleted, or reordered
 * a block within.
 *
 * A response without explicit editors (editors[] === []) is open to any editor.
 * Throws a 403 httpError on the first violation, carrying the offending
 * blockId/responseId so the client can point at it.
 */
const { httpError } = require('../lib/httpError');

function checkBlockEditPermissions(incomingDoc, existingDoc, callerEmail) {
  const responses = (existingDoc && existingDoc.responses) || {};
  const email = callerEmail.toLowerCase();

  // Index existing sections and their blocks by id.
  const existingSections = {};
  for (const s of ((existingDoc && existingDoc.sections) || [])) {
    const blockMap = {};
    for (const b of (s.blocks || [])) blockMap[b.id] = b;
    existingSections[s.id] = { blocks: s.blocks || [], blockMap };
  }

  // Walk backwards to find the nearest preceding subhead id (= responseId).
  const responseIdFor = (blocks, idx) => {
    for (let i = idx; i >= 0; i--) {
      if (blocks[i].type === 'subhead') return blocks[i].id;
    }
    return null;
  };

  // Is this editor allowed to touch the response that owns this block?
  const canEdit = (responseId) => {
    if (!responseId) return true;                                               // before any subhead — unassigned
    const r = responses[responseId];
    if (!r || !Array.isArray(r.editors) || r.editors.length === 0) return true;  // unassigned
    return r.editors.includes(email);
  };

  const deny = (blockId, responseId) => {
    throw httpError('forbidden_response', 403, { blockId, responseId });
  };

  for (const incomingSection of ((incomingDoc && incomingDoc.sections) || [])) {
    const ex = existingSections[incomingSection.id];
    const incomingBlocks = incomingSection.blocks || [];
    const incomingIdSet = new Set(incomingBlocks.map(b => b.id));

    // Deleted blocks — check their response in the existing section.
    if (ex) {
      ex.blocks.forEach((b, i) => {
        if (!incomingIdSet.has(b.id)) {
          const rid = responseIdFor(ex.blocks, i);
          if (!canEdit(rid)) deny(b.id, rid);
        }
      });
    }

    // Added or content-changed blocks — check their response in the incoming section.
    incomingBlocks.forEach((b, i) => {
      const existingBlock = ex && ex.blockMap[b.id];
      const isNew = !existingBlock;
      const isChanged = existingBlock && JSON.stringify(existingBlock) !== JSON.stringify(b);
      if (isNew || isChanged) {
        const rid = responseIdFor(incomingBlocks, i);
        if (!canEdit(rid)) deny(b.id, rid);
      }
    });

    // Reordered blocks (same id, different index) — check their new-position response.
    if (ex) {
      const existingOrder = ex.blocks.map(b => b.id);
      incomingBlocks.forEach((b, newIdx) => {
        const oldIdx = existingOrder.indexOf(b.id);
        if (oldIdx >= 0 && oldIdx !== newIdx) {
          const rid = responseIdFor(incomingBlocks, newIdx);
          if (!canEdit(rid)) deny(b.id, rid);
        }
      });
    }
  }

  return { ok: true };
}

module.exports = { checkBlockEditPermissions };
