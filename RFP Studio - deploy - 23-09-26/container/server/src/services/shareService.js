'use strict';
/**
 * Read-only review links, viewer tracking, and comments.
 *
 * The share token is NOT an ACL — access to the underlying RFP still
 * requires the caller to be an authenticated member. The token's only job is
 * providing a dedicated read-only URL and letting "viewed via this link" be
 * recorded, so Revoke immediately breaks the reviewer's URL without deleting
 * the comment or viewer history.
 */
const crypto = require('crypto');
const { httpError } = require('../lib/httpError');
const { withWriteLock } = require('../lib/writeLock');
const rfpRepository = require('../repositories/rfpRepository');
const { resolveRole } = require('./aclService');
const notificationService = require('./notificationService');

function enableShare(id) {
  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    doc.shareEnabled = true;
    doc.shareToken = crypto.randomUUID();
    doc.updatedAt = Date.now();
    rfpRepository.save(doc);
    return { shareEnabled: true, shareToken: doc.shareToken };
  });
}

function revokeShare(id) {
  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    doc.shareEnabled = false;
    doc.shareToken = null;
    doc.updatedAt = Date.now();
    rfpRepository.save(doc);
    return { shareEnabled: false };
  });
}

/**
 * The read-only reviewer view fetches through here rather than the plain
 * GET /api/rfps/:id, so opening it can be recorded as a view.
 */
async function readShared(id, token, email) {
  const doc = rfpRepository.findById(id);
  if (!doc) throw httpError('not_found', 404);

  // Check RFP access first — don't let guessing a token reveal existence.
  const role = resolveRole(doc, email);
  if (!role) throw httpError('forbidden', 403);
  const tokenValid = doc.shareEnabled && doc.shareToken &&
    doc.shareToken.length === token.length &&
    crypto.timingSafeEqual(Buffer.from(doc.shareToken), Buffer.from(token));
  if (!tokenValid) throw httpError('link_revoked_or_invalid', 403);

  let returnDoc = doc;
  await withWriteLock(id, () => {
    const fresh = rfpRepository.findById(id) || doc;
    const now = Date.now();
    const viewers = Array.isArray(fresh.viewers) ? fresh.viewers : [];
    const existing = viewers.find(v => v.email === email);
    if (existing) existing.lastViewedAt = now;
    else viewers.push({ email, firstViewedAt: now, lastViewedAt: now });
    fresh.viewers = viewers;
    rfpRepository.save(fresh);
    returnDoc = fresh;
  });

  return returnDoc;
}

function listComments(doc) {
  return Array.isArray(doc.comments) ? doc.comments : [];
}

async function addComment(id, { text, parentId, blockId, quote, assignedTo }, email) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw httpError('text_required', 400);

  const comment = {
    id: crypto.randomUUID(),
    author: email,
    text: trimmed,
    parentId: parentId || null,
    blockId: parentId ? null : (blockId || null),
    quote: parentId ? null : ((quote || '').slice(0, 200) || null),
    assignedTo: parentId ? null : ((assignedTo || '').trim() || null),
    resolved: false,
    createdAt: Date.now(),
  };

  const result = await withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    doc.comments = Array.isArray(doc.comments) ? doc.comments : [];
    doc.comments.push(comment);
    rfpRepository.save(doc);
    return { comment, doc };
  });
  if (!result) return null;

  const { comment: posted, doc: commentDoc } = result;
  const title = (commentDoc.meta && commentDoc.meta.title) || 'Untitled';

  if (posted.assignedTo) {
    notificationService.create({
      toEmail: posted.assignedTo, type: 'comment_assigned', proposalId: id, rfpTitle: title,
      blockId: posted.blockId, blockText: posted.text, fromEmail: posted.author,
    });
  }
  if (posted.parentId) {
    const parent = (commentDoc.comments || []).find(c => c.id === posted.parentId);
    if (parent && parent.author) {
      notificationService.create({
        toEmail: parent.author, type: 'comment_replied', proposalId: id, rfpTitle: title,
        blockId: parent.blockId, blockText: posted.text, fromEmail: posted.author,
      });
    }
  }
  return posted;
}

/**
 * Update a comment's resolved state or assignee.
 * Only the comment author or a bid_manager can modify a comment.
 */
function updateComment(id, commentId, body, requesterEmail, callerRole) {
  const resolved = !!(body && body.resolved);
  const hasAssignedTo = body && 'assignedTo' in body;
  const assignedTo = hasAssignedTo ? ((body.assignedTo || '').trim().slice(0, 200) || null) : undefined;

  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    doc.comments = Array.isArray(doc.comments) ? doc.comments : [];
    const comment = doc.comments.find(c => c.id === commentId);
    if (!comment) return 'not_found';
    const isAuthor = requesterEmail && comment.author === requesterEmail;
    const isBidManager = callerRole === 'bid_manager';
    if (!isAuthor && !isBidManager) throw httpError('forbidden', 403);
    comment.resolved = resolved;
    if (hasAssignedTo) comment.assignedTo = assignedTo;
    rfpRepository.save(doc);
    return comment;
  });
}

/**
 * Deleting a comment cascades to its replies (BFS on parentId).
 * Only the comment author or a bid_manager can delete.
 */
function deleteComment(id, commentId, requesterEmail, callerRole) {
  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    doc.comments = Array.isArray(doc.comments) ? doc.comments : [];
    const comment = doc.comments.find(c => c.id === commentId);
    if (!comment) return 'not_found';
    const isAuthor = requesterEmail && comment.author === requesterEmail;
    const isBidManager = callerRole === 'bid_manager';
    if (!isAuthor && !isBidManager) throw httpError('forbidden', 403);

    const toDelete = new Set([commentId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of doc.comments) {
        if (c.parentId && toDelete.has(c.parentId) && !toDelete.has(c.id)) {
          toDelete.add(c.id);
          grew = true;
        }
      }
    }
    doc.comments = doc.comments.filter(c => !toDelete.has(c.id));
    rfpRepository.save(doc);
    return { ok: true, deleted: toDelete.size };
  });
}

module.exports = {
  enableShare, revokeShare, readShared,
  listComments, addComment, updateComment, deleteComment,
};
