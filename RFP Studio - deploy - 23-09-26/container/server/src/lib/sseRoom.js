'use strict';
/**
 * In-memory SSE room manager for real-time collaboration.
 *
 * Each RFP has one room: a set of SSE client connections and a map of
 * section/question locks. Locks expire automatically after LOCK_TTL_MS
 * if the client does not send a heartbeat.
 */
const LOCK_TTL_MS = 60_000;

/**
 * clients: Map<email, Set<ServerResponse>> — supports multiple tabs per user.
 * @type {Map<string, { clients: Map<string, Set<import('http').ServerResponse>>, locks: Map<string, { email: string, expiresAt: number, timer: NodeJS.Timeout }> }>}
 */
const rooms = new Map();

function getOrCreate(id) {
  if (!rooms.has(id)) rooms.set(id, { clients: new Map(), locks: new Map() });
  return rooms.get(id);
}

function sendEvent(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
}

function broadcastAll(room, event, data, excludeEmail) {
  for (const [em, conns] of room.clients) {
    if (em !== excludeEmail) {
      for (const res of conns) sendEvent(res, event, data);
    }
  }
}

function presencePayload(room) {
  return { users: [...room.clients.keys()] };
}

function locksPayload(room) {
  const locks = {};
  for (const [qId, lock] of room.locks) locks[qId] = lock.email;
  return { locks };
}

/** Register a new SSE client. Sends current presence + locks immediately. */
function addClient(id, email, res) {
  const room = getOrCreate(id);
  if (!room.clients.has(email)) room.clients.set(email, new Set());
  room.clients.get(email).add(res);
  sendEvent(res, 'presence', presencePayload(room));
  sendEvent(res, 'locks', locksPayload(room));
  broadcastAll(room, 'presence', presencePayload(room), email);
}

/** Remove a specific SSE connection (on connection close). Releases locks when the last tab closes. */
function removeClient(id, email, res) {
  const room = rooms.get(id);
  if (!room) return;
  const conns = room.clients.get(email);
  if (conns) {
    conns.delete(res);
    if (conns.size === 0) {
      room.clients.delete(email);
      // Only release locks and broadcast when the user has no connections left.
      for (const [qId, lock] of room.locks) {
        if (lock.email === email) {
          clearTimeout(lock.timer);
          room.locks.delete(qId);
          broadcastAll(room, 'lock_released', { questionId: qId });
        }
      }
      broadcastAll(room, 'presence', presencePayload(room));
    }
  }
  if (room.clients.size === 0) rooms.delete(id);
}

/**
 * Try to acquire a lock on a question block.
 * Returns { ok: true } on success or { ok: false, heldBy: email } on conflict.
 */
function acquireLock(id, questionId, email) {
  const room = getOrCreate(id);
  const existing = room.locks.get(questionId);
  if (existing && existing.email !== email) return { ok: false, heldBy: existing.email };
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    room.locks.delete(questionId);
    broadcastAll(room, 'lock_released', { questionId });
  }, LOCK_TTL_MS);
  room.locks.set(questionId, { email, expiresAt: Date.now() + LOCK_TTL_MS, timer });
  broadcastAll(room, 'lock_acquired', { questionId, userEmail: email });
  return { ok: true };
}

/** Release a lock. No-op if the caller doesn't hold it. */
function releaseLock(id, questionId, email) {
  const room = rooms.get(id);
  if (!room) return;
  const lock = room.locks.get(questionId);
  if (!lock || lock.email !== email) return;
  clearTimeout(lock.timer);
  room.locks.delete(questionId);
  broadcastAll(room, 'lock_released', { questionId });
}

/** Extend a lock's TTL. Returns false if the caller doesn't hold it. */
function renewLock(id, questionId, email) {
  const room = rooms.get(id);
  if (!room) return false;
  const lock = room.locks.get(questionId);
  if (!lock || lock.email !== email) return false;
  clearTimeout(lock.timer);
  lock.timer = setTimeout(() => {
    room.locks.delete(questionId);
    broadcastAll(room, 'lock_released', { questionId });
  }, LOCK_TTL_MS);
  lock.expiresAt = Date.now() + LOCK_TTL_MS;
  return true;
}

/** Notify all clients in a room that the document was saved. */
function broadcastSaved(id, by, revision) {
  const room = rooms.get(id);
  if (room) broadcastAll(room, 'doc_saved', { by, revision, at: Date.now() });
}

module.exports = { addClient, removeClient, acquireLock, releaseLock, renewLock, broadcastSaved };
