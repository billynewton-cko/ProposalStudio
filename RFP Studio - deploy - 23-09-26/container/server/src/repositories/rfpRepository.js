'use strict';
/**
 * RFP persistence — named-folder format.
 *
 * Each RFP lives in a human-readable folder named after its title:
 *   data/rfps/<title-slug>/meta.json      — full RFP JSON
 *   data/rfps/<title-slug>/content.md     — human-readable Markdown snapshot
 *   data/rfps/<title-slug>/changes.json   — append-only audit trail
 *   data/rfps/<title-slug>/images/        — extracted image assets
 *
 * The id→slug mapping is maintained in data/rfps/.index.json via rfpIndex.
 * On startup, migrateIfNeeded() upgrades any id-named folders to title-slug
 * folders and moves their images inside.
 */
const fs = require('fs');
const path = require('path');
const { RFPS_DIR, PROPOSALS_DIR, IMAGES_DIR } = require('../config');
const { readJsonSafe, writeJsonAtomic, ensureDir } = require('../lib/fsJson');
const { docToMarkdown } = require('../lib/rfpMarkdown');
const rfpIndex = require('../lib/rfpIndex');

/* ── Path helpers ── */

function rfpDir(id) {
  const slug = rfpIndex.getSlug(id);
  if (slug) return path.join(RFPS_DIR, slug);
  // Fallback during migration: check for an id-named directory.
  const idPath = path.join(RFPS_DIR, id);
  if (fs.existsSync(path.join(idPath, 'meta.json'))) return idPath;
  return idPath; // will be created on first save
}

function metaPath(id) {
  return path.join(rfpDir(id), 'meta.json');
}

function contentPath(id) {
  return path.join(rfpDir(id), 'content.md');
}

/* ── Slug assignment ── */

function ensureSlug(doc) {
  if (rfpIndex.getSlug(doc.id)) return;
  const title = (doc.meta && doc.meta.title) || doc.id;
  const slug = rfpIndex.uniqueSlug(title);
  rfpIndex.setSlug(doc.id, slug);
}

/* ── CRUD ── */

function findById(id) {
  return readJsonSafe(metaPath(id));
}

function save(doc) {
  ensureSlug(doc);
  const dir = rfpDir(doc.id);
  ensureDir(dir);
  writeJsonAtomic(metaPath(doc.id), doc);
  try {
    fs.writeFileSync(contentPath(doc.id), docToMarkdown(doc), 'utf8');
  } catch (e) {
    console.error(`[rfp] Failed to write content.md for ${doc.id}:`, e.message);
  }
  invalidateCache();
  return doc;
}

function saveRaw(doc) {
  ensureSlug(doc);
  const dir = rfpDir(doc.id);
  ensureDir(dir);
  writeJsonAtomic(metaPath(doc.id), doc);
  return doc;
}

function remove(id) {
  try {
    fs.rmSync(rfpDir(id), { recursive: true, force: true });
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Failed to delete rfp ${id}:`, err);
  }
  rfpIndex.removeEntry(id);
  invalidateCache();
}

function findAll() {
  let entries;
  try {
    entries = fs.readdirSync(RFPS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const docs = [];
  const seenIds = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(RFPS_DIR, entry.name, 'meta.json'), 'utf8'));
    } catch (err) {
      console.error(`Skipping unreadable rfp ${entry.name}: ${err.message}`);
      continue;
    }
    // Skip ghost folders: an id-named directory that the index has already migrated to a slug.
    const slug = rfpIndex.getSlug(doc.id);
    if (slug && entry.name === doc.id && slug !== doc.id) continue;
    if (seenIds.has(doc.id)) continue;
    seenIds.add(doc.id);
    docs.push(doc);
  }
  return docs;
}

/* ── Cache ── */

let _registryCache = null;

function invalidateCache() {
  _registryCache = null;
}

function findAllCached() {
  if (_registryCache !== null) return _registryCache;
  _registryCache = findAll();
  return _registryCache;
}

/* ── Legacy path helper ── */

function filePath(id) {
  return metaPath(id);
}

/* ── Migration: flat proposals/ → rfps/<id>/ ── */

function migrateFlatToFolders() {
  if (fs.existsSync(RFPS_DIR)) return;
  let oldFiles;
  try {
    oldFiles = fs.readdirSync(PROPOSALS_DIR);
  } catch {
    return;
  }
  console.log('[storage] Migrating legacy proposals/ directory → rfps/ …');
  ensureDir(RFPS_DIR);
  for (const file of oldFiles) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(PROPOSALS_DIR, file), 'utf8'));
      const id = doc.id || file.replace('.json', '');
      const dir = path.join(RFPS_DIR, id);
      ensureDir(dir);
      writeJsonAtomic(path.join(dir, 'meta.json'), doc);
      try {
        fs.writeFileSync(path.join(dir, 'content.md'), docToMarkdown(doc), 'utf8');
      } catch {}
      writeJsonAtomic(path.join(dir, 'changes.json'), [{
        ts: Date.now(),
        iso: new Date().toISOString(),
        user: doc.createdBy || 'system',
        action: 'migrated',
        detail: 'Migrated from legacy storage format',
      }]);
    } catch (err) {
      console.error(`[storage] Failed to migrate ${file}: ${err.message}`);
    }
  }
}

/* ── Migration: rfps/<id>/ → rfps/<title-slug>/ + images inside ── */

function migrateToSlugFolders() {
  let entries;
  try {
    entries = fs.readdirSync(RFPS_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  let migrated = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const dirPath = path.join(RFPS_DIR, entry.name);
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(dirPath, 'meta.json'), 'utf8'));
    } catch {
      continue;
    }
    const id = doc.id || entry.name;

    // Already indexed and folder still present — skip.
    const existingSlug = rfpIndex.getSlug(id);
    if (existingSlug && fs.existsSync(path.join(RFPS_DIR, existingSlug))) continue;

    // Generate a unique slug from the title.
    const title = (doc.meta && doc.meta.title) || id;
    const slug = rfpIndex.uniqueSlug(title);
    const newDir = path.join(RFPS_DIR, slug);

    // Rename folder (only if name differs and destination is free).
    if (entry.name !== slug) {
      if (fs.existsSync(newDir)) {
        // Destination already exists — record current name as its slug to avoid re-processing.
        rfpIndex.setSlug(id, entry.name);
        continue;
      }
      try {
        fs.renameSync(dirPath, newDir);
        console.log(`[storage] Renamed rfp folder: ${entry.name} → ${slug}`);
        migrated++;
      } catch (err) {
        console.error(`[storage] Failed to rename ${entry.name} → ${slug}:`, err.message);
        continue;
      }
    }

    // Move legacy images from data/images/<id>/ into data/rfps/<slug>/images/.
    if (IMAGES_DIR) {
      const oldImagesDir = path.join(IMAGES_DIR, id);
      const newImagesDir = path.join(newDir, 'images');
      if (fs.existsSync(oldImagesDir) && !fs.existsSync(newImagesDir)) {
        try {
          fs.renameSync(oldImagesDir, newImagesDir);
          console.log(`[storage] Moved images for ${id} into ${slug}/images/`);
        } catch (err) {
          console.error(`[storage] Failed to move images for ${id}:`, err.message);
        }
      }
    }

    rfpIndex.setSlug(id, slug);
  }

  if (migrated > 0) console.log(`[storage] Slug migration complete (${migrated} folder(s) renamed).`);

  // Second pass: remove ghost folders (id-named directories superseded by a slug folder).
  let cleaned = 0;
  try {
    entries = fs.readdirSync(RFPS_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dirPath = path.join(RFPS_DIR, entry.name);
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(dirPath, 'meta.json'), 'utf8'));
    } catch {
      continue;
    }
    const id = doc.id || entry.name;
    const slug = rfpIndex.getSlug(id);
    if (slug && entry.name === id && slug !== id && fs.existsSync(path.join(RFPS_DIR, slug))) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`[storage] Removed ghost folder: ${id} (superseded by ${slug})`);
        cleaned++;
      } catch (err) {
        console.error(`[storage] Failed to remove ghost folder ${id}:`, err.message);
      }
    }
  }
  if (cleaned > 0) console.log(`[storage] Cleaned up ${cleaned} ghost folder(s).`);
}

function migrateIfNeeded() {
  migrateFlatToFolders();
  migrateToSlugFolders();
}

migrateIfNeeded();

module.exports = {
  filePath, findById, save, saveRaw, remove,
  findAll, findAllCached, invalidateCache,
};
