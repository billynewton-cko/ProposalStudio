'use strict';
const userService = require('../services/userService');
const { requesterEmail } = require('../middleware/identity');

function list(_req, res) {
  try {
    res.status(200).json(userService.getAll());
  } catch (err) {
    console.error('GET /api/users failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

function me(req, res) {
  const email = requesterEmail(req);
  if (!email) return res.status(401).json({ error: 'authentication_required' });
  const user = userService.getByEmail(email);
  const globalRole = userService.getGlobalRole(email);
  res.status(200).json(user ? { ...user, globalRole } : { email, globalRole });
}

function setRole(req, res) {
  const { globalRole } = req.body || {};
  const targetEmail = decodeURIComponent(req.params.email);
  try {
    const updated = userService.setGlobalRole(targetEmail, globalRole);
    res.status(200).json(updated);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.status === 404) return res.status(404).json({ error: 'user_not_found' });
    console.error('PATCH /api/users/:email failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { list, me, setRole };
