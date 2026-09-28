'use strict';
const { requesterEmail } = require('./identity');
const userService = require('../services/userService');

function requireGlobalAdmin(req, res, next) {
  const email = requesterEmail(req);
  if (!email) return res.status(401).json({ error: 'authentication_required' });
  if (userService.getGlobalRole(email) !== 'admin') {
    return res.status(403).json({ error: 'forbidden', required: 'global_admin' });
  }
  next();
}

module.exports = { requireGlobalAdmin };
