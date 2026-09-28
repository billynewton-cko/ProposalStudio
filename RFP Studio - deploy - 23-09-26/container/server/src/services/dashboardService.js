'use strict';
/**
 * Scans every RFP the caller can access and returns a flat list of
 * responses with their assignment and status data from doc.responses.
 *
 * Views: my_editor | my_reviewer | ready_for_review | changes_requested |
 *        approved | unassigned (bid_manager only)
 */
const rfpRepository = require('../repositories/rfpRepository');
const { resolveRole } = require('./aclService');

function buildRows(email, view = 'my_editor') {
  const rows = [];

  for (const doc of rfpRepository.findAllCached()) {
    const role = resolveRole(doc, email);
    if (!role) continue;

    const proposalId = doc.id;
    const rfpTitle = (doc.meta && doc.meta.title) || 'Untitled';
    const responses = (typeof doc.responses === 'object' && !Array.isArray(doc.responses)) ? doc.responses : {};

    // Lookup: responseId -> { block, sectionTitle }
    const blockLookup = {};
    for (const section of (doc.sections || [])) {
      for (const block of (section.blocks || [])) {
        blockLookup[block.id] = { block, sectionTitle: section.title || '' };
      }
    }

    for (const [responseId, resp] of Object.entries(responses)) {
      const status = resp.status || 'not_started';
      const editors = Array.isArray(resp.editors) ? resp.editors : [];
      const reviewers = Array.isArray(resp.reviewers) ? resp.reviewers : [];
      const { block, sectionTitle } = blockLookup[responseId] || { block: null, sectionTitle: '' };
      const blockText = block ? (block.text || '').slice(0, 120) : responseId;

      let include = false;
      if (view === 'my_editor')              include = editors.includes(email);
      else if (view === 'my_reviewer')        include = reviewers.includes(email);
      else if (view === 'ready_for_review')   include = status === 'ready_for_review';
      else if (view === 'changes_requested')  include = status === 'changes_requested';
      else if (view === 'approved')           include = status === 'approved';
      else if (view === 'unassigned') {
        if (role !== 'bid_manager') continue;
        include = editors.length === 0 && reviewers.length === 0;
      }

      if (include) {
        rows.push({ proposalId, rfpTitle, responseId, blockText, status, editors, reviewers, sectionTitle });
      }
    }
  }
  return rows;
}

/**
 * Scans every accessible RFP and returns a flat, newest-first list of
 * top-level comments matching the view:
 *   my_comments    → comments authored by email
 *   assigned_to_me → comments where assignedTo === email
 */
function buildCommentRows(email, view = 'my_comments') {
  const rows = [];

  for (const doc of rfpRepository.findAllCached()) {
    if (!resolveRole(doc, email)) continue;

    const proposalId = doc.id;
    const rfpTitle = (doc.meta && doc.meta.title) || 'Untitled';

    for (const c of (doc.comments || [])) {
      if (c.parentId) continue; // replies only appear in context
      let include = false;
      if (view === 'my_comments')    include = c.author === email;
      if (view === 'assigned_to_me') include = c.assignedTo === email;
      if (include) rows.push({ proposalId, rfpTitle, ...c });
    }
  }

  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

module.exports = { buildRows, buildCommentRows };
