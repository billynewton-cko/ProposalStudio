'use strict';
const aclManagementService = require('../services/aclManagementService');
const { requesterEmail } = require('../middleware/identity');

async function get(req, res) {
  try {
    res.status(200).json(aclManagementService.describe(req._doc));
  } catch (err) {
    console.error('GET /api/rfps/:id/acl failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function putMember(req, res) {
  try {
    const result = await aclManagementService.upsertMember(
      req.params.id,
      req.body && req.body.email,
      req.body && req.body.role,
      requesterEmail(req),
      req.body && req.body.jobFunction
    );
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(result);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json(err.valid ? { error: err.message, valid: err.valid } : { error: err.message });
    }
    console.error('PUT /api/rfps/:id/acl/members failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function deleteMember(req, res) {
  try {
    const result = await aclManagementService.removeMember(req.params.id, req.params.memberEmail);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(result);
  } catch (err) {
    console.error('DELETE /api/rfps/:id/acl/members/:memberEmail failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { get, putMember, deleteMember };
