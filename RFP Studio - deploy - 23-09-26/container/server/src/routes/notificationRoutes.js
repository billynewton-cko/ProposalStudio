'use strict';
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, notificationController.list);
// Registered before '/:id/read' so the literal path is never captured as an id.
router.delete('/read', requireAuth, notificationController.dismissRead);
router.patch('/:id/read', requireAuth, notificationController.markRead);

module.exports = router;
