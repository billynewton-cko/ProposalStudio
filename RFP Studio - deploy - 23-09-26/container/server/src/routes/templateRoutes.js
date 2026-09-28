'use strict';
const express = require('express');
const templateController = require('../controllers/templateController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', templateController.list);
router.post('/', templateController.create);
router.get('/:id', templateController.get);
router.put('/:id', templateController.update);
router.patch('/:id/archive', templateController.toggleArchive);
router.delete('/:id', templateController.remove);
router.get('/:id/rfps', templateController.listProposals);
router.post('/:id/apply', templateController.apply);

module.exports = router;
