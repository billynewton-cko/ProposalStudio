'use strict';
/** Member management on an RFP's ACL — bid_manager only, enforced at the route. */
const { httpError } = require('../lib/httpError');
const { withWriteLock } = require('../lib/writeLock');
const rfpRepository = require('../repositories/rfpRepository');

/**
 * For legacy docs (no acl field) returns a synthesized view describing the
 * open-access policy actually in effect, rather than pretending there is an ACL.
 */
function describe(doc) {
  if (!doc.acl) {
    return {
      legacy: true,
      admin: doc.createdBy || null,
      members: [],
      note: 'This RFP has no explicit ACL. All authenticated users can access it as editors. Add members explicitly to restrict access.',
    };
  }
  return { legacy: false, admin: doc.acl.admin, members: doc.acl.members || [] };
}

const VALID_JOB_FUNCTIONS = ['sale', 'se', 'bid_manager', 'other'];

function upsertMember(id, rawEmail, role, callerEmail, jobFunction) {
  const memberEmail = (rawEmail || '').trim().toLowerCase();
  if (!memberEmail) throw httpError('email_required', 400);
  if (!['editor', 'reviewer'].includes(role)) {
    throw httpError('invalid_role', 400, { valid: ['editor', 'reviewer'] });
  }
  const fn = jobFunction && VALID_JOB_FUNCTIONS.includes(jobFunction) ? jobFunction : 'other';

  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;

    // Promote a legacy doc to an explicit ACL on first member addition.
    if (!doc.acl) {
      doc.acl = { admin: doc.createdBy || callerEmail, members: [] };
    }
    if (doc.acl.admin && doc.acl.admin.toLowerCase() === memberEmail) {
      throw httpError('Cannot add the admin as a member; they are already bid_manager.', 400);
    }

    doc.acl.members = doc.acl.members || [];
    const existing = doc.acl.members.find(m => m.email.toLowerCase() === memberEmail);
    if (existing) {
      existing.role = role;
      existing.jobFunction = fn;
    } else {
      doc.acl.members.push({ email: memberEmail, role, jobFunction: fn });
    }

    doc.updatedAt = Date.now();
    rfpRepository.save(doc);
    return { email: memberEmail, role, jobFunction: fn };
  });
}

/** Removes a member. Does not affect the admin. */
function removeMember(id, rawEmail) {
  const memberEmail = decodeURIComponent(rawEmail).toLowerCase();
  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    if (!doc.acl) return { ok: true, removed: false };

    const before = (doc.acl.members || []).length;
    doc.acl.members = (doc.acl.members || []).filter(m => m.email.toLowerCase() !== memberEmail);
    const removed = doc.acl.members.length < before;

    doc.updatedAt = Date.now();
    rfpRepository.save(doc);
    return { ok: true, removed };
  });
}

module.exports = { describe, upsertMember, removeMember };
