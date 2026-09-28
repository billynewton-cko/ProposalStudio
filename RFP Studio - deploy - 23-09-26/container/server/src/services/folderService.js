'use strict';
/**
 * Flat (non-nested) folders. Folders are not ACL-gated themselves; the RFPs
 * inside them are gated individually.
 */
const crypto = require('crypto');
const { httpError } = require('../lib/httpError');
const { withWriteLock } = require('../lib/writeLock');
const folderRepository = require('../repositories/folderRepository');
const rfpRepository = require('../repositories/rfpRepository');
const imageRepository = require('../repositories/imageRepository');
const { resolveRole, roleAtLeast } = require('./aclService');

/** Folder list with a per-folder count of RFPs the caller can see. */
function listWithCounts(email) {
  const counts = {};
  for (const doc of rfpRepository.findAllCached()) {
    if (doc.folderId && (!email || resolveRole(doc, email) !== null)) {
      counts[doc.folderId] = (counts[doc.folderId] || 0) + 1;
    }
  }
  return folderRepository.findAll()
    .map(f => ({ ...f, rfpCount: counts[f.id] || 0 }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function create(name, email) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw httpError('name_required', 400);
  const folder = { id: crypto.randomUUID(), name: trimmed, createdAt: Date.now(), createdBy: email };
  const folders = folderRepository.findAll();
  folders.push(folder);
  folderRepository.writeAll(folders);
  return folder;
}

/**
 * A folder plus the RFPs inside it the caller can see — the frontend's
 * delete confirmation uses this to list exactly what will be destroyed.
 */
function findWithProposals(id, email) {
  const folder = folderRepository.findById(id);
  if (!folder) return null;
  const rfps = rfpRepository.findAllCached()
    .filter(doc => doc.folderId === folder.id && (!email || resolveRole(doc, email) !== null))
    .map(doc => ({ id: doc.id, title: (doc.meta && doc.meta.title) || 'Untitled' }));
  return { ...folder, rfps };
}

/**
 * Cascade delete — removes the folder AND every RFP (plus images) inside
 * it. Requires bid_manager on ALL of them, checked up front so the operation
 * never half-completes.
 */
async function removeCascade(id, email) {
  const folders = folderRepository.findAll();
  const idx = folders.findIndex(f => f.id === id);
  if (idx === -1) return null;

  const folderId = folders[idx].id;
  const docsInFolder = rfpRepository.findAllCached().filter(doc => doc.folderId === folderId);

  for (const doc of docsInFolder) {
    const role = resolveRole(doc, email);
    if (!role || !roleAtLeast(role, 'bid_manager')) {
      throw httpError('forbidden', 403, { detail: `Insufficient permissions for RFP ${doc.id}` });
    }
  }

  for (const doc of docsInFolder) {
    await withWriteLock(doc.id, () => {
      rfpRepository.remove(doc.id);
      imageRepository.removeAllFor(doc.id);
    });
  }

  folders.splice(idx, 1);
  folderRepository.writeAll(folders);
  if (docsInFolder.length) rfpRepository.invalidateCache();

  return { ok: true, deletedProposalIds: docsInFolder.map(d => d.id) };
}

function rename(id, name, email) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw httpError('name_required', 400);
  const folders = folderRepository.findAll();
  const folder = folders.find(f => f.id === id);
  if (!folder) return null;
  const userService = require('./userService');
  const isAdmin = userService.getGlobalRole(email) === 'admin';
  if (!isAdmin && folder.createdBy !== email) throw httpError('forbidden', 403);
  folder.name = trimmed;
  folderRepository.writeAll(folders);
  return folder;
}

module.exports = { listWithCounts, create, findWithProposals, removeCascade, rename };
