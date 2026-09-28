'use strict';
const express = require('express');
const imageController = require('../controllers/imageController');

const router = express.Router();
router.get('/:id/:file', imageController.get);
module.exports = router;
