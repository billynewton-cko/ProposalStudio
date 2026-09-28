'use strict';
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

const config = {
  PORT: process.env.PORT || 3000,
  DATA_DIR,
  PROPOSALS_DIR: path.join(DATA_DIR, 'proposals'),
  RFPS_DIR: path.join(DATA_DIR, 'rfps'),
  USERS_FILE: path.join(DATA_DIR, 'users.json'),
  IMAGES_DIR: path.join(DATA_DIR, 'images'),
  TEMPLATES_DIR: path.join(DATA_DIR, 'templates'),
  FOLDERS_FILE: path.join(DATA_DIR, 'folders.json'),
  NOTIFICATIONS_DIR: path.join(DATA_DIR, 'notifications'),
  NOTIFICATIONS_FILE: path.join(DATA_DIR, 'notifications.json'), // legacy — kept for migration
  PUBLIC_DIR: process.env.PUBLIC_DIR || path.join(__dirname, '..', '..', 'public'),

  ASSET_SLOTS: ['coverHero', 'partnerLogoLight', 'partnerLogoDark', 'thankyouArt'],

  CF_TEAM_DOMAIN: process.env.CLOUDFLARE_TEAM_DOMAIN || '',
  CF_AUD: process.env.CLOUDFLARE_AUD || '',
  LOCAL_DEV_USER_EMAIL: process.env.LOCAL_DEV_USER_EMAIL || '',
  SUPER_ADMIN_EMAIL: (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase(),

  JSON_BODY_LIMIT: '25mb',
  JWKS_TTL_MS: 3_600_000,
  NOTIF_DEDUP_MS: 60_000,
};

module.exports = config;
