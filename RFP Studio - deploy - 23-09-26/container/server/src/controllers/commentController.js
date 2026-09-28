'use strict';
const shareService = require('../services/shareService');
const { requesterEmail } = require('../middleware/identity');

async function list(req, res) {
  try {
    res.status(200).json(shareService.listComments(req._doc));
  } catch (err) {
    console.error('GET /api/rfps/:id/comments failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function create(req, res) {
  try {
    const posted = await shareService.addComment(req.params.id, req.body || {}, requesterEmail(req));
    if (!posted) return res.status(404).json({ error: 'not_found' });
    res.status(201).json(posted);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/rfps/:id/comments failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function update(req, res) {
  try {
    const result = await shareService.updateComment(
      req.params.id, req.params.commentId, req.body || {},
      requesterEmail(req), req._callerRole
    );
    if (!result) return res.status(404).json({ error: 'not_found' });
    if (result === 'not_found') return res.status(404).json({ error: 'comment_not_found' });
    res.status(200).json(result);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
    console.error('PATCH /api/rfps/:id/comments/:commentId failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function remove(req, res) {
  try {
    const result = await shareService.deleteComment(
      req.params.id, req.params.commentId,
      requesterEmail(req), req._callerRole
    );
    if (!result) return res.status(404).json({ error: 'not_found' });
    if (result === 'not_found') return res.status(404).json({ error: 'comment_not_found' });
    res.status(200).json(result);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
    console.error('DELETE /api/rfps/:id/comments/:commentId failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { list, create, update, remove };
