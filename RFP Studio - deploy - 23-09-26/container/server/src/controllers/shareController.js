'use strict';
const shareService = require('../services/shareService');
const { requesterEmail } = require('../middleware/identity');

async function enable(req, res) {
  try {
    const result = await shareService.enableShare(req.params.id);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(result);
  } catch (err) {
    console.error('POST /api/rfps/:id/share failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function revoke(req, res) {
  try {
    const result = await shareService.revokeShare(req.params.id);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(result);
  } catch (err) {
    console.error('DELETE /api/rfps/:id/share failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function readShared(req, res) {
  const email = requesterEmail(req) || 'anonymous';
  try {
    res.status(200).json(await shareService.readShared(req.params.id, req.params.token, email));
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not_found' });
    if (err.status === 403) return res.status(403).json({ error: err.message });
    console.error('GET /api/rfps/:id/shared/:token failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { enable, revoke, readShared };
