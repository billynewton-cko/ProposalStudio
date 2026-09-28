'use strict';
const userRepository = require('../repositories/userRepository');

function getAll() {
  return userRepository.readAll();
}

function getByEmail(email) {
  return userRepository.findByEmail(email);
}

/** Returns 'admin' | 'contributor' for known users; 'contributor' for unknown ones. */
function getGlobalRole(email) {
  if (!email) return null;
  if (email === '__local_superadmin__') return 'admin';
  const user = userRepository.findByEmail(email);
  return user ? (user.globalRole || 'contributor') : 'contributor';
}

function setGlobalRole(targetEmail, role) {
  if (!['admin', 'contributor'].includes(role)) {
    const err = new Error('invalid_role'); err.status = 400; throw err;
  }
  const existing = userRepository.findByEmail(targetEmail);
  if (!existing) {
    const err = new Error('user_not_found'); err.status = 404; throw err;
  }
  existing.globalRole = role;
  return userRepository.save(existing);
}

/** Ensures a CF user exists in the registry when they first authenticate. */
function ensureUser(email) {
  if (!email || email === '__local_superadmin__') return null;
  const existing = userRepository.findByEmail(email);
  if (existing) return existing;
  const user = { firstName: '', lastName: '', email: email.toLowerCase(), globalRole: 'contributor' };
  return userRepository.save(user);
}

module.exports = { getAll, getByEmail, getGlobalRole, setGlobalRole, ensureUser };
