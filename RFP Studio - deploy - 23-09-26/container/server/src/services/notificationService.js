'use strict';
/**
 * Notifications — per-user storage.
 *
 * Each user's notifications are stored in their own file, with a per-user
 * write lock so concurrent requests for the same user are serialised without
 * blocking other users.
 *
 * Types: answer_assigned_editor | answer_assigned_reviewer | comment_assigned |
 *        comment_replied | status_ready_for_review | status_changes_requested |
 *        status_approved
 *
 * Deduplication: notifications with the same (type + proposalId + blockId +
 * toEmail) are suppressed within a 60-second window to prevent autosave spam.
 */
const crypto = require('crypto');
const { NOTIF_DEDUP_MS } = require('../config');
const { withWriteLock } = require('../lib/writeLock');
const notificationRepository = require('../repositories/notificationRepository');

function lockKey(email) {
  return `__notifications__:${email.toLowerCase()}`;
}

function create({ toEmail, type, proposalId, rfpTitle, blockId, blockText, fromEmail }) {
  if (!toEmail || toEmail.toLowerCase() === (fromEmail || '').toLowerCase()) return;
  return withWriteLock(lockKey(toEmail), () => {
    const arr = notificationRepository.findFor(toEmail);
    const now = Date.now();
    const dup = arr.find(n =>
      n.type === type &&
      n.proposalId === proposalId &&
      n.blockId === blockId &&
      n.toEmail === toEmail &&
      (now - n.createdAt) < NOTIF_DEDUP_MS
    );
    if (dup) return;
    arr.push({
      id: crypto.randomUUID(),
      toEmail,
      type,
      proposalId,
      rfpTitle: rfpTitle || '',
      blockId: blockId || null,
      blockText: (blockText || '').slice(0, 120),
      fromEmail: fromEmail || null,
      createdAt: now,
      readAt: null,
    });
    notificationRepository.writeFor(toEmail, arr);
  });
}

function listFor(email) {
  return notificationRepository.findFor(email)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function markRead(id, email) {
  return withWriteLock(lockKey(email), () => {
    const arr = notificationRepository.findFor(email);
    const n = arr.find(x => x.id === id && x.toEmail === email);
    if (!n) return null;
    n.readAt = Date.now();
    notificationRepository.writeFor(email, arr);
    return n;
  });
}

function dismissRead(email) {
  return withWriteLock(lockKey(email), () => {
    const arr = notificationRepository.findFor(email);
    notificationRepository.writeFor(email, arr.filter(n => !n.readAt));
    return { ok: true };
  });
}

module.exports = { create, listFor, markRead, dismissRead };
