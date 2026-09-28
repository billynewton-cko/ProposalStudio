'use strict';
const path = require('path');
const { DATA_DIR } = require('../config');
const { requesterEmail } = require('../middleware/identity');
const userService = require('../services/userService');

function health(_req, res) {
  res.status(200).json({ ok: true, storage: 'server' });
}

function whoami(req, res) {
  const email = requesterEmail(req);
  const globalRole = userService.getGlobalRole(email);
  // Register first-time CF users automatically
  if (email && email !== '__local_superadmin__') userService.ensureUser(email);
  res.status(200).json({ email, globalRole });
}

module.exports = { health, whoami };
