'use strict';
const fs = require('fs');
const path = require('path');
const imageRepository = require('../repositories/imageRepository');
const rfpRepository = require('../repositories/rfpRepository');
const { resolveRole } = require('../services/aclService');
const { requesterEmail } = require('../middleware/identity');

/** Requires at least reviewer access to the RFP whose images are fetched. */
function get(req, res) {
  const resolved = imageRepository.resolveSafe(req.params.id, req.params.file);
  if (!resolved) return res.status(404).json({ error: 'not_found' });

  const email = requesterEmail(req);
  if (!email) return res.status(401).json({ error: 'authentication_required' });

  const rfpDoc = rfpRepository.findById(resolved.id);
  if (!rfpDoc) return res.status(404).json({ error: 'not_found' });
  if (!resolveRole(rfpDoc, email)) return res.status(403).json({ error: 'forbidden' });

  fs.stat(resolved.filePath, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).json({ error: 'not_found' });
    const ext = path.extname(resolved.file).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(resolved.filePath).pipe(res);
  });
}

module.exports = { get };
