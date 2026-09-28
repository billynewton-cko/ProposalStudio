'use strict';
const responseService = require('../services/responseService');
const { requesterEmail } = require('../middleware/identity');

async function patch(req, res) {
  const { id, responseId } = req.params;
  try {
    const saved = await responseService.patchResponse(id, responseId, req.body, requesterEmail(req));
    if (!saved) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(saved);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('PATCH /api/rfps/:id/responses/:responseId failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { patch };
