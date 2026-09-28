'use strict';
/**
 * Access control.
 *
 * Every RFP created after ACL support was added carries a `doc.acl`
 * object: { admin: string|null, members: [{email, role}] }.
 * Roles are bid_manager > editor > reviewer.
 *
 * Legacy RFPs (no `acl` field) remain accessible to all authenticated
 * users: the `createdBy` email gets bid_manager; every other authenticated user
 * gets editor. There is no automatic migration — existing RFPs stay open
 * until a bid_manager explicitly restricts access via the ACL management UI.
 */
const { SUPER_ADMIN_EMAIL } = require('../config');

const ROLES = ['reviewer', 'editor', 'bid_manager'];

function roleAtLeast(role, min) {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/**
 * Resolves the effective role of `email` for `doc`.
 * Returns 'bid_manager', 'editor', 'reviewer', or null (no access).
 */
function resolveRole(doc, email) {
  if (!email) return null;
  const em = email.toLowerCase();
  if (em === '__local_superadmin__') return 'bid_manager';
  if (SUPER_ADMIN_EMAIL && em === SUPER_ADMIN_EMAIL) return 'bid_manager';

  if (!doc.acl) {
    if (doc.createdBy && doc.createdBy.toLowerCase() === em) return 'bid_manager';
    return 'editor';
  }
  if (doc.acl.admin && doc.acl.admin.toLowerCase() === em) return 'bid_manager';
  const member = (doc.acl.members || []).find(m => m.email && m.email.toLowerCase() === em);
  if (member) return member.role;
  return null;
}

module.exports = { ROLES, roleAtLeast, resolveRole };
