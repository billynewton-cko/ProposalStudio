'use strict';
/**
 * Identity middleware — sets req._callerEmail on every request before any
 * handler runs.
 *
 * When CLOUDFLARE_TEAM_DOMAIN and CLOUDFLARE_AUD are set, the
 * Cf-Access-Jwt-Assertion JWT is cryptographically verified. Without them the
 * server falls back to trusting the raw Cf-Access-Authenticated-User-Email
 * header — acceptable ONLY if the app is exclusively reachable through the
 * Cloudflare Access proxy, since a direct caller could otherwise spoof it.
 */
const { CF_TEAM_DOMAIN, CF_AUD, LOCAL_DEV_USER_EMAIL, SUPER_ADMIN_EMAIL } = require('../config');
const { fetchJwks, verifyCloudflareJwt } = require('../lib/cloudflareJwt');

function verifiedJwtIdentity() {
  return async (req, res, next) => {
    const token = req.get('Cf-Access-Jwt-Assertion');
    if (!token) {
      req._callerEmail = LOCAL_DEV_USER_EMAIL || null;
      return next();
    }
    try {
      await fetchJwks();
      const payload = verifyCloudflareJwt(token);
      req._callerEmail = payload.email || null;
    } catch (e) {
      console.error('[security] CF JWT rejected:', e.message);
      return res.status(401).json({ error: 'invalid_token', detail: e.message });
    }
    next();
  };
}

function headerTrustIdentity() {
  return (req, _res, next) => {
    const cfHeader = req.get('Cf-Access-Authenticated-User-Email');
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
    const fromLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    // When no identity is configured at all but the connection is from
    // localhost, grant a synthetic local-superadmin identity so `npm start`
    // just works for the developer without any env-var ceremony.
    req._callerEmail = cfHeader || LOCAL_DEV_USER_EMAIL || (fromLocalhost ? '__local_superadmin__' : null);
    next();
  };
}

function identity() {
  if (CF_TEAM_DOMAIN && CF_AUD) {
    console.log(`[security] CF JWT verification enabled: team=${CF_TEAM_DOMAIN} aud=${CF_AUD}`);
    return verifiedJwtIdentity();
  }
  console.warn(
    '[security] CLOUDFLARE_TEAM_DOMAIN / CLOUDFLARE_AUD not set — ' +
    'trusting raw Cf-Access-Authenticated-User-Email header without JWT verification.\n' +
    'Set these env vars if this app is not exclusively behind the Cloudflare Access proxy.'
  );
  return headerTrustIdentity();
}

function requesterEmail(req) {
  return req._callerEmail || null;
}

function warnIfSuperAdmin() {
  if (SUPER_ADMIN_EMAIL) {
    console.warn(
      `[dev] SUPER_ADMIN_EMAIL is set to ${SUPER_ADMIN_EMAIL} — this account bypasses all ACL checks. ` +
      'Do not use in production.'
    );
  }
}

module.exports = { identity, requesterEmail, warnIfSuperAdmin };
