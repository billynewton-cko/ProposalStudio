'use strict';
const dashboardService = require('../services/dashboardService');
const { requesterEmail } = require('../middleware/identity');

const COMMENT_VIEWS = new Set(['my_comments', 'assigned_to_me']);

async function get(req, res) {
  try {
    const email = requesterEmail(req);
    const view = req.query.view || 'my_editor';
    const data = COMMENT_VIEWS.has(view)
      ? dashboardService.buildCommentRows(email, view)
      : dashboardService.buildRows(email, view);
    res.json(data);
  } catch (err) {
    console.error('GET /api/dashboard failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

module.exports = { get };
