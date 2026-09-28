'use strict';
/** Reusable design templates, and applying a template's design to RFPs. */
const crypto = require('crypto');
const path = require('path');
const { httpError } = require('../lib/httpError');
const { withWriteLock } = require('../lib/writeLock');
const templateRepository = require('../repositories/templateRepository');
const rfpRepository = require('../repositories/rfpRepository');
const { resolveRole, roleAtLeast } = require('./aclService');

const TYPOGRAPHY_BLOCK_TYPES = [
  'grouphead', 'subhead', 'paragraph', 'bullets',
  'two_col_list', 'numbered_steps', 'kv', 'table',
];
const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function sanitiseTypography(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const blockType of TYPOGRAPHY_BLOCK_TYPES) {
    const src = raw[blockType];
    if (!src || typeof src !== 'object') continue;
    const fs = parseFloat(src.fontSize);
    const fw = parseInt(src.fontWeight, 10);
    const lh = parseFloat(src.lineHeight);
    const ls = parseFloat(src.letterSpacing);
    out[blockType] = {
      label:         typeof src.label === 'string'             ? src.label.slice(0, 60)        : undefined,
      fontSize:      Number.isFinite(fs)                       ? Math.max(6, Math.min(32, fs)) : undefined,
      fontWeight:    FONT_WEIGHTS.includes(fw)                 ? fw                            : undefined,
      color:         /^#[0-9a-fA-F]{6}$/.test(src.color)      ? src.color                     : undefined,
      lineHeight:    Number.isFinite(lh)                       ? Math.max(0.8, Math.min(3, lh)): undefined,
      letterSpacing: Number.isFinite(ls)                       ? ls                            : undefined,
    };
    // Strip undefined keys so the object stays lean
    for (const k of Object.keys(out[blockType])) {
      if (out[blockType][k] === undefined) delete out[blockType][k];
    }
  }
  return out;
}

/** Only allow known keys and safe value shapes off an incoming design object. */
function sanitiseTemplateDesign(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const VALID_COVER_VARIANTS = ['dark', 'pill'];
  const VALID_SECTION_OPENERS = ['standard', 'band'];
  const VALID_QUESTION_MARKER = ['accent-square', 'none'];
  const VALID_ANSWER_SPACING = ['standard', 'compact', 'spacious'];
  const VALID_TABLE_STYLE = ['standard', 'striped'];

  return {
    coverVariant: VALID_COVER_VARIANTS.includes(raw.coverVariant) ? raw.coverVariant : 'dark',
    accentColor: /^#[0-9a-fA-F]{6}$/.test(raw.accentColor) ? raw.accentColor : '#006CFF',
    accentEnabled: raw.accentEnabled !== false,
    sectionOpenerStyle: VALID_SECTION_OPENERS.includes(raw.sectionOpenerStyle) ? raw.sectionOpenerStyle : 'standard',
    questionMarkerStyle: VALID_QUESTION_MARKER.includes(raw.questionMarkerStyle) ? raw.questionMarkerStyle : 'accent-square',
    answerSpacing: VALID_ANSWER_SPACING.includes(raw.answerSpacing) ? raw.answerSpacing : 'standard',
    tableStyle: VALID_TABLE_STYLE.includes(raw.tableStyle) ? raw.tableStyle : 'standard',
    thankyouEnabled: raw.thankyouEnabled !== false,
    pageBackground: /^#[0-9a-fA-F]{6}$/.test(raw.pageBackground) ? raw.pageBackground : '#ffffff',
    typography: sanitiseTypography(raw.typography),
  };
}

/** Throws 404/403 unless the template exists and is visible to this caller. */
function requireVisible(id, email) {
  const t = templateRepository.findById(id);
  if (!t) throw httpError('not_found', 404);
  if (t.visibility !== 'public' && t.owner !== email) throw httpError('forbidden', 403);
  return t;
}

function requireOwned(id, email) {
  const t = templateRepository.findById(id);
  if (!t) throw httpError('not_found', 404);
  if (t.owner !== email) throw httpError('forbidden', 403);
  return t;
}

function listActive(email) {
  return templateRepository.findAllVisibleTo(email).filter(t => !t.archived);
}

function create(body, email) {
  const now = new Date().toISOString();
  const template = {
    id: crypto.randomBytes(8).toString('hex'),
    name: (body.name || 'Untitled Template').trim().slice(0, 120),
    description: (body.description || '').trim().slice(0, 400),
    owner: email,
    visibility: body.visibility === 'public' ? 'public' : 'private',
    archived: false,
    createdAt: now,
    updatedAt: now,
    preset: body.preset || 'custom',
    design: sanitiseTemplateDesign(body.design),
    defaultSections: Array.isArray(body.defaultSections) ? body.defaultSections : [],
  };
  return templateRepository.save(template);
}

function update(id, body, email) {
  const existing = requireOwned(id, email);
  const updated = {
    ...existing,
    name: (body.name || existing.name).trim().slice(0, 120),
    description: (body.description !== undefined ? body.description : existing.description).trim().slice(0, 400),
    visibility: body.visibility === 'public' ? 'public'
      : body.visibility === 'private' ? 'private'
      : existing.visibility,
    preset: body.preset || existing.preset,
    design: body.design ? sanitiseTemplateDesign(body.design) : existing.design,
    defaultSections: Array.isArray(body.defaultSections) ? body.defaultSections : existing.defaultSections,
    updatedAt: new Date().toISOString(),
  };
  return templateRepository.save(updated);
}

function toggleArchive(id, email) {
  const t = requireOwned(id, email);
  return templateRepository.save({ ...t, archived: !t.archived, updatedAt: new Date().toISOString() });
}

function remove(id, email) {
  requireOwned(id, email);
  templateRepository.remove(id);
  return { ok: true };
}

/** RFPs created from this template that the caller can edit. */
function listProposals(id, email) {
  requireVisible(id, email);
  const templateId = path.basename(String(id));
  return rfpRepository.findAll()
    .filter(d => d.templateId === templateId)
    .map(d => ({
      id: d.id,
      title: d.meta && d.meta.title,
      partnerName: d.meta && d.meta.partnerName,
      updatedAt: d.updatedAt,
      userRole: resolveRole(d, email),
    }))
    .filter(d => d.userRole && roleAtLeast(d.userRole, 'editor'));
}

/**
 * Applies a template's design to a list of RFPs. Only touches RFPs
 * that actually reference this template and where the caller has editor+.
 */
async function applyToProposals(id, { proposalIds, design }, email) {
  const t = requireVisible(id, email);
  const templateId = path.basename(String(id));
  if (!Array.isArray(proposalIds) || !proposalIds.length) {
    throw httpError('proposalIds must be a non-empty array', 400);
  }

  const sanitised = sanitiseTemplateDesign(design);
  let updated = 0, skipped = 0;

  for (const rawId of proposalIds) {
    const safeId = path.basename(String(rawId));
    try {
      await withWriteLock(safeId, () => {
        const doc = rfpRepository.findById(safeId);
        if (!doc) { skipped++; return; }
        if (!doc.templateId || doc.templateId !== templateId) { skipped++; return; }
        const role = resolveRole(doc, email);
        if (!role || !roleAtLeast(role, 'editor')) { skipped++; return; }

        doc.meta = doc.meta || {};
        doc.meta.coverVariant = sanitised.coverVariant;
        doc.meta.accentColor = sanitised.accentColor;
        doc.meta.accentEnabled = sanitised.accentEnabled;
        doc.meta.pageBackground = sanitised.pageBackground;
        doc.meta.typography = sanitised.typography;
        if (doc.thankyou && typeof doc.thankyou === 'object') {
          doc.thankyou.enabled = sanitised.thankyouEnabled;
        }
        doc.templateVersion = t.updatedAt;
        doc.updatedAt = Date.now();
        doc.revision = (doc.revision || 1) + 1;
        rfpRepository.saveRaw(doc);
        updated++;
      });
    } catch (err) {
      console.error(`apply template to RFP ${safeId} failed:`, err.message);
      skipped++;
    }
  }

  rfpRepository.invalidateCache();
  return { ok: true, updated, skipped };
}

module.exports = {
  sanitiseTemplateDesign, requireVisible, requireOwned,
  listActive, create, update, toggleArchive, remove, listProposals, applyToProposals,
};
