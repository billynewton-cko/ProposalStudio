'use strict';
const rfpService = require('../services/rfpService');
const { resolveRole } = require('../services/aclService');
const { requesterEmail } = require('../middleware/identity');

async function list(req, res) {
  try {
    const email = requesterEmail(req);
    if (!email) return res.status(401).json({ error: 'authentication_required' });
    res.status(200).json(rfpService.listAccessible(email));
  } catch (err) {
    console.error('GET /api/rfps failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

/**
 * Attaches the computed userRole so the frontend can gate edit controls without
 * a second request.
 */
async function get(req, res) {
  try {
    const email = requesterEmail(req);
    res.status(200).json({ ...req._doc, userRole: resolveRole(req._doc, email) });
  } catch (err) {
    console.error('GET /api/rfps/:id failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function upsert(req, res) {
  const id = req.params.id;
  const email = requesterEmail(req);
  if (!email) return res.status(401).json({ error: 'authentication_required' });
  try {
    const result = await rfpService.upsert(id, req.body, email);
    res.status(200).json(result);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: 'invalid_body' });
    if (err.status === 422) return res.status(422).json({ error: 'invalid_document', details: err.details || [] });
    if (err.status === 403) {
      return res.status(403).json({
        error: err.message === 'forbidden_response' ? 'forbidden_response' : 'forbidden',
        ...(err.blockId    ? { blockId:    err.blockId }    : {}),
        ...(err.responseId ? { responseId: err.responseId } : {}),
      });
    }
    if (err.status === 409) {
      return res.status(409).json({
        error: 'conflict',
        serverRevision: err.serverRevision,
        updatedAt: err.updatedAt,
        updatedBy: err.updatedBy,
      });
    }
    console.error('PUT /api/rfps/:id failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function remove(req, res) {
  try {
    res.status(200).json(await rfpService.remove(req.params.id, requesterEmail(req)));
  } catch (err) {
    console.error('DELETE /api/rfps/:id failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function moveToFolder(req, res) {
  try {
    const folderId = (req.body && req.body.folderId) || null;
    const meta = await rfpService.moveToFolder(req.params.id, folderId, requesterEmail(req));
    if (!meta) return res.status(404).json({ error: 'not_found' });
    res.status(200).json({ ok: true, meta });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('PATCH /api/rfps/:id/folder failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function setKanbanStatus(req, res) {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'missing_status' });
    const meta = await rfpService.setKanbanStatus(req.params.id, status, requesterEmail(req));
    if (!meta) return res.status(404).json({ error: 'not_found' });
    res.status(200).json({ ok: true, meta });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('PATCH /api/rfps/:id/kanban-status failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { list, get, upsert, remove, moveToFolder, setKanbanStatus };
