'use strict';
/** Guards a route on having any established identity, without reading a doc. */
const { requesterEmail } = require('./identity');

function requireAuth(req, res, next) {
  if (!requesterEmail(req)) return res.status(401).json({ error: 'authentication_required' });
  next();
}

module.exports = { requireAuth };
