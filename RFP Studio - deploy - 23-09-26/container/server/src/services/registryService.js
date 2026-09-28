'use strict';
/** Projection of a full doc down to the fields the library grid needs. */
const { resolveRole } = require('./aclService');

function buildRegistryEntry(doc, email) {
  return {
    id: doc.id,
    title: doc.meta && doc.meta.title,
    partner: doc.meta && doc.meta.partnerName,
    sections: Array.isArray(doc.sections) ? doc.sections.length : 0,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
    folderId: doc.folderId || null,
    kanbanStatus: doc.kanbanStatus || 'unassigned',
    userRole: email ? resolveRole(doc, email) : null,
  };
}

module.exports = { buildRegistryEntry };
