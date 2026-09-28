'use strict';
const templateService = require('../services/templateService');
const { requesterEmail } = require('../middleware/identity');

/** Maps a service httpError onto its response, or rethrows for the 500 path. */
function sendError(res, err, label) {
  if (err.status === 404) return res.status(404).json({ error: 'not_found' });
  if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
  if (err.status === 400) return res.status(400).json({ error: err.message });
  console.error(`${label} failed:`, err);
  res.status(500).json({ error: 'internal_error' });
}

function list(req, res) {
  try {
    res.json(templateService.listActive(requesterEmail(req)));
  } catch (err) { sendError(res, err, 'GET /api/templates'); }
}

function create(req, res) {
  try {
    res.status(201).json(templateService.create(req.body || {}, requesterEmail(req)));
  } catch (err) { sendError(res, err, 'POST /api/templates'); }
}

function get(req, res) {
  try {
    res.json(templateService.requireVisible(req.params.id, requesterEmail(req)));
  } catch (err) { sendError(res, err, 'GET /api/templates/:id'); }
}

function update(req, res) {
  try {
    res.json(templateService.update(req.params.id, req.body || {}, requesterEmail(req)));
  } catch (err) { sendError(res, err, 'PUT /api/templates/:id'); }
}

function toggleArchive(req, res) {
  try {
    res.json(templateService.toggleArchive(req.params.id, requesterEmail(req)));
  } catch (err) { sendError(res, err, 'PATCH /api/templates/:id/archive'); }
}

function remove(req, res) {
  try {
    res.json(templateService.remove(req.params.id, requesterEmail(req)));
  } catch (err) { sendError(res, err, 'DELETE /api/templates/:id'); }
}

function listProposals(req, res) {
  try {
    res.json(templateService.listProposals(req.params.id, requesterEmail(req)));
  } catch (err) { sendError(res, err, 'GET /api/templates/:id/rfps'); }
}

async function apply(req, res) {
  try {
    res.json(await templateService.applyToProposals(req.params.id, req.body || {}, requesterEmail(req)));
  } catch (err) { sendError(res, err, 'POST /api/templates/:id/apply'); }
}

module.exports = { list, create, get, update, toggleArchive, remove, listProposals, apply };
