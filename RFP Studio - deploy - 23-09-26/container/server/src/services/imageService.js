'use strict';
/**
 * Extracts base64 data: URLs out of a doc onto disk, replacing them in place
 * with /api/images/<id>/<slot>.<ext> URLs, so a stored RFP JSON never
 * carries base64 and stays small on disk and fast to load.
 */
const path = require('path');
const { ASSET_SLOTS } = require('../config');
const imageRepository = require('../repositories/imageRepository');

function mimeToExt(mime) {
  const m = (mime || '').toLowerCase();
  if (m === 'image/png') return '.png';
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  if (m === 'image/svg+xml') return '.svg';
  return '.jpg';
}

/** Parses a base64 data: URL into { buffer, ext }, or null if not one. */
function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]*)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const isBase64 = !!match[2];
  if (!isBase64) return null;
  const mime = match[1] || '';
  const payload = match[3] || '';
  return { buffer: Buffer.from(payload, 'base64'), ext: mimeToExt(mime) };
}

const IMAGE_URL_RE = /^\/api\/images\/([^/]+)\/([^/]+)$/;

/**
 * Extracts a single image field (obj[key]). Handles two cases:
 *   - a data: URL (first save of a newly uploaded image) — decode and write.
 *   - an /api/images/<otherId>/... URL belonging to a DIFFERENT RFP — this
 *     happens when duplicating an RFP, since the copied doc still carries
 *     the original's already-extracted URL as-is. Copy the file into this doc's
 *     own folder so every RFP's images stay self-contained and survive the
 *     source RFP being deleted later.
 *
 * Idempotent: a value already under this doc's own /api/images/<docId>/... is
 * left as-is, as is null or anything unrecognized.
 */
function extractSlot(docId, obj, key, slotName) {
  const val = obj[key];
  if (typeof val !== 'string') return;

  if (val.startsWith('data:')) {
    const parsed = parseDataUrl(val);
    if (!parsed) return;
    const fileName = `${slotName}${parsed.ext}`;
    imageRepository.write(docId, fileName, parsed.buffer);
    obj[key] = `/api/images/${docId}/${fileName}`;
    return;
  }

  const m = IMAGE_URL_RE.exec(val);
  if (m && m[1] !== docId) {
    const [, sourceId, sourceFile] = m;
    const fileName = `${slotName}${path.extname(sourceFile)}`;
    try {
      imageRepository.copyFrom(sourceId, sourceFile, docId, fileName);
      obj[key] = `/api/images/${docId}/${fileName}`;
    } catch (err) {
      console.error(`Could not copy source image for ${slotName} from ${sourceId}:`, err.message);
    }
  }
}

/** Mutates doc in place, extracting every image field it carries. */
function extractImagesForDoc(doc) {
  if (doc.assets && typeof doc.assets === 'object') {
    for (const slot of ASSET_SLOTS) extractSlot(doc.id, doc.assets, slot, slot);
  }
  if (Array.isArray(doc.sections)) {
    for (const section of doc.sections) {
      if (section && typeof section === 'object') {
        extractSlot(doc.id, section, 'image', `section-${section.id}`);
      }
    }
  }
}

module.exports = { mimeToExt, parseDataUrl, extractSlot, extractImagesForDoc };
