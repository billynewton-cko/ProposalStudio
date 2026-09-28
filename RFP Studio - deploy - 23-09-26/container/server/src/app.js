'use strict';
/**
 * RFP Studio — Express application.
 *
 * Exported without calling listen() so tests can mount it directly.
 * See server.js for the process entry point.
 *
 * Everything persists to disk under DATA_DIR:
 *   <DATA_DIR>/rfps/<slug>/meta.json    — one JSON file per RFP
 *   <DATA_DIR>/images/<id>/<slot>.<ext> — extracted images, replacing base64 data: URLs
 *   <DATA_DIR>/folders.json             — flat list of {id, name, createdAt, createdBy}
 *   <DATA_DIR>/templates/<id>.json      — one JSON file per design template
 *   <DATA_DIR>/notifications.json       — flat notification array
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { JSON_BODY_LIMIT, PUBLIC_DIR } = require('./config');
const { identity, warnIfSuperAdmin } = require('./middleware/identity');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

warnIfSuperAdmin();

const app = express();

app.use(express.json({ limit: JSON_BODY_LIMIT }));

// Identity runs before every route so any handler can read req._callerEmail.
app.use(identity());

app.use('/api', apiRoutes);

// Static assets from the Next.js export, when one has been built into public/.
// extensions: ['html'] lets express.static serve review.html for /review, edit.html for /edit, etc.
// Without this, extensionless routes fall through to the SPA catch-all and always get index.html.
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

/**
 * SPA fallback. Serves the built frontend for any non-API GET so client-side
 * routes deep-link correctly on a hard refresh. Falls back to a placeholder
 * page when no build has been copied in yet, which also keeps GET / usable as
 * the platform health check.
 */
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  const indexFile = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(200).send(
    '<!doctype html><html><head><meta charset="utf-8"><title>RFP Studio</title></head>' +
    '<body><h1>RFP Studio server is running.</h1>' +
    '<p>No frontend build found. Build the Next.js app in <code>web/</code> and copy its ' +
    'output into <code>server-app/public/</code>, or run the frontend dev server separately.</p>' +
    '</body></html>'
  );
});

app.use(errorHandler);

module.exports = app;
