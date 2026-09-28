'use strict';
/**
 * Process entry point. Keeps listen()/signal handling out of app.js so the app
 * can be imported by tests without binding a port.
 */
const path = require('path');
const app = require('./src/app');
const { PORT, DATA_DIR } = require('./src/config');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`RFP Studio server listening on 0.0.0.0:${PORT}`);
  console.log(`DATA_DIR resolved to ${path.resolve(DATA_DIR)}`);
});

process.on('SIGTERM', () => process.exit(0));

module.exports = app;
