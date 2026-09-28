'use strict';
const express = require('express');
const userController = require('../controllers/userController');
const { requireGlobalAdmin } = require('../middleware/requireGlobalAdmin');
const { requesterEmail } = require('../middleware/identity');

const router = express.Router();

// Any authenticated user can see who they are
router.get('/me', (req, res) => {
  if (!requesterEmail(req)) return res.status(401).json({ error: 'authentication_required' });
  userController.me(req, res);
});

// Admin-only: list all users
router.get('/', requireGlobalAdmin, userController.list);

// Admin-only: change a user's global role
router.patch('/:email', requireGlobalAdmin, userController.setRole);

module.exports = router;
