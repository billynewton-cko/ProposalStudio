'use strict';
const express = require('express');
const folderController = require('../controllers/folderController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, folderController.list);
router.post('/', requireAuth, folderController.create);
router.get('/:id', requireAuth, folderController.get);
router.patch('/:id', requireAuth, folderController.rename);
router.delete('/:id', requireAuth, folderController.remove);

module.exports = router;
