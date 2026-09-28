'use strict';
/**
 * RFP business logic.
 *
 * The upsert path is the delicate one. Sharing, viewer, comment, response and
 * ACL state all live on the same JSON file the editor autosaves, so they are
 * treated as server-owned and always re-derived from disk rather than trusted
 * from the PUT body — otherwise an editor tab holding a stale snapshot would
 * silently wipe a reviewer's comment or view on its next autosave.
 */
const { httpError } = require('../lib/httpError');
const { withWriteLock } = require('../lib/writeLock');
const rfpRepository = require('../repositories/rfpRepository');
const folderRepository = require('../repositories/folderRepository');
const imageRepository = require('../repositories/imageRepository');
const { resolveRole, roleAtLeast } = require('./aclService');
const userService = require('./userService');
const { validateProposal } = require('./validationService');
const { checkBlockEditPermissions } = require('./blockPermissionService');
const { extractImagesForDoc } = require('./imageService');
const { buildRegistryEntry } = require('./registryService');
const changeLog = require('../lib/changeLog');
const sseRoom = require('../lib/sseRoom');

/**
 * Library listing.
 * Admins see all RFPs. Contributors only see ones they have a role on.
 */
function listAccessible(email) {
  const globalRole = userService.getGlobalRole(email);
  const all = rfpRepository.findAllCached();
  const filtered = globalRole === 'admin'
    ? all
    : all.filter(doc => resolveRole(doc, email) !== null);
  const entries = filtered.map(doc => buildRegistryEntry(doc, email));
  entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return entries;
}

/**
 * Unwraps the request body, which may be either a bare doc or a
 * { doc, clientRevision } envelope.
 */
function unwrapBody(body) {
  const clientRevision = (body && typeof body === 'object' && 'clientRevision' in body)
    ? body.clientRevision
    : undefined;
  const doc = body && typeof body === 'object' && !Array.isArray(body)
    && 'doc' in body && body.doc && typeof body.doc === 'object'
    ? body.doc
    : body;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw httpError('invalid_body', 400);
  }
  return { doc, clientRevision };
}

/**
 * Create-or-update. The frontend mints ids client-side and always PUTs, both
 * for the first save and every later autosave.
 *
 * Access rules:
 *   - New doc: any authenticated user can create; they become the Bid Manager.
 *   - Existing doc: editor+ required.
 */
function upsert(id, body, email) {
  return withWriteLock(id, () => {
    const { doc, clientRevision } = unwrapBody(body);

    // Stamp id first so the id-mismatch check can see it.
    doc.id = id;
    const validationErrors = validateProposal(doc, id);
    if (validationErrors.length) {
      throw httpError('invalid_document', 422, { details: validationErrors });
    }

    const existing = rfpRepository.findById(id);
    const now = Date.now();

    if (existing) {
      const globalRole = userService.getGlobalRole(email);
      const role = globalRole === 'admin' ? 'bid_manager' : resolveRole(existing, email);
      if (!role || !roleAtLeast(role, 'editor')) throw httpError('forbidden', 403);

      // Editors (not bid_managers) may only modify blocks in responses they are
      // explicitly assigned to. Responses with no editors assigned are open to all.
      if (role === 'editor') checkBlockEditPermissions(doc, existing, email);

      // Optimistic-concurrency check. Legacy docs (no revision) are treated as
      // revision 1 so they can be saved without conflict on the first write
      // after the upgrade. If the client omits clientRevision the check is
      // skipped for backward compatibility (e.g. MCP callers not yet updated).
      const serverRevision = existing.revision || 1;
      if (clientRevision !== undefined && clientRevision !== serverRevision) {
        throw httpError('conflict', 409, {
          serverRevision,
          updatedAt: existing.updatedAt,
          updatedBy: existing.updatedBy || existing.createdBy || null,
        });
      }
    }

    doc.createdAt = existing && existing.createdAt ? existing.createdAt : now;
    doc.updatedAt = now;
    doc.updatedBy = email;
    doc.createdBy = existing && existing.createdBy ? existing.createdBy : email;
    doc.revision = existing ? (existing.revision || 1) + 1 : 1;

    // Server-owned fields — always re-derive from disk.
    doc.shareEnabled = existing ? existing.shareEnabled || false : false;
    doc.shareToken   = existing ? existing.shareToken  || null  : null;
    doc.viewers      = existing && Array.isArray(existing.viewers)  ? existing.viewers  : [];
    doc.comments     = existing && Array.isArray(existing.comments) ? existing.comments : [];
    doc.responses    = existing && typeof existing.responses === 'object' && !Array.isArray(existing.responses)
      ? existing.responses : {};

    if (existing) {
      // Preserve whatever ACL is on disk (null for legacy, object for new).
      doc.acl = existing.acl !== undefined ? existing.acl : null;
    } else {
      // First save — set the creator as Bid Manager.
      doc.acl = { admin: email, members: [] };
    }

    extractImagesForDoc(doc);
    rfpRepository.save(doc);

    const action = existing ? 'updated' : 'created';
    changeLog.append(id, email, action, existing
      ? `Saved revision ${doc.revision}`
      : `Created RFP "${(doc.meta && doc.meta.title) || id}"`
    );
    sseRoom.broadcastSaved(id, email, doc.revision);

    return { ok: true, revision: doc.revision, meta: buildRegistryEntry(doc, email) };
  });
}

function remove(id, email) {
  return withWriteLock(id, () => {
    changeLog.append(id, email || 'unknown', 'deleted', 'RFP deleted');
    rfpRepository.remove(id);
    imageRepository.removeAllFor(id);
    return { ok: true };
  });
}

/**
 * Lightweight move — avoids round-tripping the full doc to change one field.
 * Async so an invalid folder surfaces as a rejected promise rather than a
 * synchronous throw, giving callers one uniform error path.
 */
async function moveToFolder(id, folderId, email) {
  if (folderId && !folderRepository.findAll().some(f => f.id === folderId)) {
    throw httpError('invalid_folder', 400);
  }
  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    doc.folderId = folderId;
    doc.updatedAt = Date.now();
    doc.updatedBy = email;
    rfpRepository.save(doc);
    return buildRegistryEntry(doc, email);
  });
}

const VALID_KANBAN_STATUSES = new Set([
  'unassigned', 'in_progress', 'in_review', 'design', 'ready', 'won_lost', 'archive',
]);

async function setKanbanStatus(id, status, email) {
  if (!VALID_KANBAN_STATUSES.has(status)) throw httpError('invalid_status', 400);
  return withWriteLock(id, () => {
    const doc = rfpRepository.findById(id);
    if (!doc) return null;
    doc.kanbanStatus = status;
    doc.updatedAt = Date.now();
    doc.updatedBy = email;
    rfpRepository.save(doc);
    return buildRegistryEntry(doc, email);
  });
}

module.exports = { listAccessible, upsert, remove, moveToFolder, setKanbanStatus, unwrapBody };
