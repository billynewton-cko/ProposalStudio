'use strict';
const express = require('express');
const rfpController = require('../controllers/rfpController');
const aclController = require('../controllers/aclController');
const shareController = require('../controllers/shareController');
const commentController = require('../controllers/commentController');
const responseController = require('../controllers/responseController');
const { requireRole } = require('../middleware/requireRole');
const { requesterEmail } = require('../middleware/identity');
const sseRoom = require('../lib/sseRoom');
const changeLog = require('../lib/changeLog');

const router = express.Router();

router.get('/', rfpController.list);
router.get('/:id', requireRole('editor'), rfpController.get);
// Upsert deliberately has no requireRole guard: a first save creates the doc,
// and the service applies editor+ only once the doc already exists.
router.put('/:id', rfpController.upsert);
router.delete('/:id', requireRole('bid_manager'), rfpController.remove);
router.patch('/:id/folder', requireRole('editor'), rfpController.moveToFolder);
router.patch('/:id/kanban-status', requireRole('editor'), rfpController.setKanbanStatus);

router.get('/:id/acl', requireRole('bid_manager'), aclController.get);
router.put('/:id/acl/members', requireRole('bid_manager'), aclController.putMember);
router.delete('/:id/acl/members/:memberEmail', requireRole('bid_manager'), aclController.deleteMember);

router.post('/:id/share', requireRole('bid_manager'), shareController.enable);
router.delete('/:id/share', requireRole('bid_manager'), shareController.revoke);
router.get('/:id/shared/:token', shareController.readShared);

router.get('/:id/comments', requireRole('reviewer'), commentController.list);
router.post('/:id/comments', requireRole('reviewer'), commentController.create);
router.patch('/:id/comments/:commentId', requireRole('reviewer'), commentController.update);
router.delete('/:id/comments/:commentId', requireRole('reviewer'), commentController.remove);

router.patch('/:id/responses/:responseId', requireRole('editor'), responseController.patch);

/* ── Change log ── */
router.get('/:id/changes', requireRole('editor'), (req, res) => {
  try {
    res.status(200).json(changeLog.readChanges(req.params.id));
  } catch {
    res.status(200).json([]);
  }
});

/* ── Real-time: SSE stream ── */
router.get('/:id/stream', requireRole('editor'), (req, res) => {
  const email = requesterEmail(req);
  const id = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  sseRoom.addClient(id, email, res);
  const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25_000);
  req.on('close', () => { clearInterval(ka); sseRoom.removeClient(id, email, res); });
});

/* ── Real-time: section locks ── */
router.post('/:id/lock', requireRole('editor'), (req, res) => {
  const { questionId } = req.body || {};
  if (!questionId) return res.status(400).json({ error: 'missing_question_id' });
  const result = sseRoom.acquireLock(req.params.id, questionId, requesterEmail(req));
  res.status(result.ok ? 200 : 409).json(result);
});

router.delete('/:id/lock/:questionId', requireRole('editor'), (req, res) => {
  sseRoom.releaseLock(req.params.id, req.params.questionId, requesterEmail(req));
  res.status(200).json({ ok: true });
});

router.post('/:id/lock/:questionId/heartbeat', requireRole('editor'), (req, res) => {
  const ok = sseRoom.renewLock(req.params.id, req.params.questionId, requesterEmail(req));
  res.status(ok ? 200 : 404).json({ ok });
});

module.exports = router;
