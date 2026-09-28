'use strict';
/** Mounts every API router under /api. */
const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

router.get('/health', systemController.health);
router.get('/whoami', systemController.whoami);

router.use('/rfps', require('./rfpRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/folders', require('./folderRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/templates', require('./templateRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/images', require('./imageRoutes'));

module.exports = router;
