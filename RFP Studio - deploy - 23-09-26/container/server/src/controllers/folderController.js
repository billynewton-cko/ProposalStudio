'use strict';
const folderService = require('../services/folderService');
const { requesterEmail } = require('../middleware/identity');

async function list(req, res) {
  try {
    res.status(200).json(folderService.listWithCounts(requesterEmail(req)));
  } catch (err) {
    console.error('GET /api/folders failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function create(req, res) {
  try {
    const email = requesterEmail(req);
    if (!email) return res.status(401).json({ error: 'authentication_required' });
    res.status(201).json(folderService.create(req.body && req.body.name, email));
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/folders failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function get(req, res) {
  try {
    const folder = folderService.findWithProposals(req.params.id, requesterEmail(req));
    if (!folder) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(folder);
  } catch (err) {
    console.error('GET /api/folders/:id failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function remove(req, res) {
  const email = requesterEmail(req);
  if (!email) return res.status(401).json({ error: 'authentication_required' });
  try {
    const result = await folderService.removeCascade(req.params.id, email);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(result);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: 'forbidden', detail: err.detail });
    console.error('DELETE /api/folders/:id failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function rename(req, res) {
  const email = requesterEmail(req);
  if (!email) return res.status(401).json({ error: 'authentication_required' });
  try {
    const folder = folderService.rename(req.params.id, req.body && req.body.name, email);
    if (!folder) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(folder);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
    console.error('PATCH /api/folders/:id failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { list, create, get, rename, remove };
