'use strict';
/**
 * Express middleware factory. Reads the RFP from disk, checks the caller's
 * role, and on success attaches req._doc and req._callerRole so the handler can
 * skip a second read.
 *
 * Global admins always receive bid_manager access on every RFP.
 *
 * Returns 401 if no identity, 404 if the RFP doesn't exist, 403 if the
 * caller's role is below minRole.
 */
const rfpRepository = require('../repositories/rfpRepository');
const { resolveRole, roleAtLeast } = require('../services/aclService');
const userService = require('../services/userService');
const { requesterEmail } = require('./identity');

function requireRole(minRole) {
  return (req, res, next) => {
    const email = requesterEmail(req);
    if (!email) return res.status(401).json({ error: 'authentication_required' });
    const doc = rfpRepository.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not_found' });
    // Global admins get bid_manager on every doc
    const globalRole = userService.getGlobalRole(email);
    const role = globalRole === 'admin' ? 'bid_manager' : resolveRole(doc, email);
    if (!role || !roleAtLeast(role, minRole)) {
      return res.status(403).json({ error: 'forbidden', required: minRole, yourRole: role || 'none' });
    }
    req._doc = doc;
    req._callerRole = role;
    next();
  };
}

module.exports = { requireRole };
