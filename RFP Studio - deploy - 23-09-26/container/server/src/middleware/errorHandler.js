'use strict';
/** Terminal error handler — anything unhandled becomes a 500 internal_error. */
function errorHandler(err, req, res, _next) {
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.status ? err.message : 'internal_error' });
}

module.exports = { errorHandler };
