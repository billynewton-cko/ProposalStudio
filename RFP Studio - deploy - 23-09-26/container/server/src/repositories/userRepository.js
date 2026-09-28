'use strict';
const { readJsonSafe, writeJsonAtomic, ensureDir } = require('../lib/fsJson');
const path = require('path');
const { USERS_FILE } = require('../config');

let _cache = null;

function readAll() {
  if (_cache) return _cache;
  const data = readJsonSafe(USERS_FILE);
  _cache = data ? (data.users || []) : [];
  return _cache;
}

function findByEmail(email) {
  if (!email) return null;
  const em = email.toLowerCase();
  return readAll().find(u => u.email.toLowerCase() === em) || null;
}

function save(user) {
  ensureDir(path.dirname(USERS_FILE));
  const data = readJsonSafe(USERS_FILE) || { users: [] };
  const idx = data.users.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase());
  if (idx >= 0) data.users[idx] = user;
  else data.users.push(user);
  writeJsonAtomic(USERS_FILE, data);
  _cache = data.users;
  return user;
}

function invalidateCache() { _cache = null; }

module.exports = { readAll, findByEmail, save, invalidateCache };
