'use strict';
/**
 * Answer-level workflow: per-response status plus editor/reviewer assignments.
 *
 *   bid_manager                        — may set any field.
 *   editor assigned to this response   — may set status only.
 *   reviewer assigned to this response — may set changes_requested or approved only.
 *   everyone else                      — 403.
 */
const { httpError } = require('../lib/httpError');
const { withWriteLock } = require('../lib/writeLock');
const rfpRepository = require('../repositories/rfpRepository');
const { resolveRole, roleAtLeast } = require('./aclService');
const notificationService = require('./notificationService');

const VALID_STATUSES = new Set([
  'not_started', 'in_progress', 'ready_for_review', 'changes_requested', 'approved',
]);
const REVIEWER_ALLOWED_STATUSES = new Set(['changes_requested', 'approved']);

async function patchResponse(id, responseId, body, email) {
  const result = await withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    const role = resolveRole(doc, email);
    doc.responses = typeof doc.responses === 'object' && !Array.isArray(doc.responses) ? doc.responses : {};

    // Snapshot pre-mutation state before `current` is modified.
    const stored = doc.responses[responseId] || null;
    const snapStatus = stored ? (stored.status || 'not_started') : 'not_started';
    const snapEditors = stored ? [...(stored.editors || [])] : [];
    const snapReviewers = stored ? [...(stored.reviewers || [])] : [];
    const current = stored || { status: 'not_started', editors: [], reviewers: [] };

    const payload = body || {};
    const emailLower = email.toLowerCase();
    const isBidManager = roleAtLeast(role, 'bid_manager');
    const isAssignedEditor = role === 'editor'
      && Array.isArray(current.editors) && current.editors.includes(emailLower);
    const isAssignedReviewer = role === 'reviewer'
      && Array.isArray(current.reviewers) && current.reviewers.includes(emailLower);

    if (!isBidManager && !isAssignedEditor && !isAssignedReviewer) throw httpError('forbidden', 403);

    if ('status' in payload) {
      if (!VALID_STATUSES.has(payload.status)) throw httpError('invalid_status', 400);
      if (isAssignedReviewer && !isBidManager && !isAssignedEditor
          && !REVIEWER_ALLOWED_STATUSES.has(payload.status)) {
        throw httpError('reviewer_may_only_set_changes_requested_or_approved', 403);
      }
      const prevStatus = current.status || 'not_started';
      if (payload.status !== prevStatus) {
        if (!Array.isArray(current.history)) current.history = [];
        current.history.push({ from: prevStatus, to: payload.status, changedBy: email, changedAt: Date.now() });
      }
      current.status = payload.status;
    }

    if (isBidManager) {
      if ('editors' in payload) {
        if (!Array.isArray(payload.editors)) throw httpError('editors_must_be_array', 400);
        current.editors = payload.editors.map(e => String(e).trim().toLowerCase()).filter(Boolean);
      }
      if ('reviewers' in payload) {
        if (!Array.isArray(payload.reviewers)) throw httpError('reviewers_must_be_array', 400);
        current.reviewers = payload.reviewers.map(e => String(e).trim().toLowerCase()).filter(Boolean);
      }
    }

    doc.responses[responseId] = current;
    doc.updatedAt = Date.now();
    rfpRepository.save(doc);

    return { current, prevStatus: snapStatus, prevEditors: snapEditors, prevReviewers: snapReviewers, doc };
  });

  if (!result) return null;

  const { current: saved, prevStatus, prevEditors, prevReviewers, doc: savedDoc } = result;
  const title = (savedDoc.meta && savedDoc.meta.title) || 'Untitled';

  // Find the block text for this responseId (it is a subhead block id).
  let blockText = '';
  for (const s of (savedDoc.sections || [])) {
    const b = (s.blocks || []).find(x => x.id === responseId);
    if (b) { blockText = (b.text || '').slice(0, 120); break; }
  }

  const notify = (toEmail, type) => notificationService.create({
    toEmail, type, proposalId: id, rfpTitle: title,
    blockId: responseId, blockText, fromEmail: email,
  });

  for (const e of (saved.editors || [])) {
    if (!prevEditors.includes(e)) notify(e, 'answer_assigned_editor');
  }
  for (const e of (saved.reviewers || [])) {
    if (!prevReviewers.includes(e)) notify(e, 'answer_assigned_reviewer');
  }

  if (saved.status !== prevStatus) {
    if (saved.status === 'ready_for_review') {
      for (const e of (saved.reviewers || [])) notify(e, 'status_ready_for_review');
    }
    if (saved.status === 'changes_requested') {
      for (const e of (saved.editors || [])) notify(e, 'status_changes_requested');
    }
    if (saved.status === 'approved') {
      for (const e of (saved.editors || [])) notify(e, 'status_approved');
    }
  }

  return saved;
}

module.exports = { VALID_STATUSES, patchResponse };
