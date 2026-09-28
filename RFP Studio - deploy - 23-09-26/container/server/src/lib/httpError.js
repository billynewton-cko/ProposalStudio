'use strict';
/**
 * Attaches an HTTP status (and arbitrary extra fields) to an Error so a service
 * can signal a precise response from deep inside a write lock, and the
 * controller's catch block can translate it without guessing.
 */
function httpError(message, status, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

module.exports = { httpError };
