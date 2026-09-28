'use strict';
const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
router.get('/', requireAuth, dashboardController.get);
module.exports = router;
