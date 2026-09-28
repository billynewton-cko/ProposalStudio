'use strict';
const notificationService = require('../services/notificationService');
const { requesterEmail } = require('../middleware/identity');

async function list(req, res) {
  try {
    res.json(notificationService.listFor(requesterEmail(req)));
  } catch (err) {
    console.error('GET /api/notifications failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function markRead(req, res) {
  try {
    const n = await notificationService.markRead(req.params.id, requesterEmail(req));
    if (!n) return res.status(404).json({ error: 'not_found' });
    res.json(n);
  } catch (err) {
    console.error('PATCH /api/notifications/:id/read failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function dismissRead(req, res) {
  try {
    res.json(await notificationService.dismissRead(requesterEmail(req)));
  } catch (err) {
    console.error('DELETE /api/notifications/read failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { list, markRead, dismissRead };
