'use strict';
/**
 * Cloudflare Access JWT verification using Node's built-in crypto (RS256).
 * Enabled only when CLOUDFLARE_TEAM_DOMAIN and CLOUDFLARE_AUD are both set.
 */
const crypto = require('crypto');
const https = require('https');
const { CF_TEAM_DOMAIN, CF_AUD, JWKS_TTL_MS } = require('../config');

let jwksCache = { data: null, fetchedAt: 0 };
let jwksInflight = null;

function fetchJwks() {
  if (jwksCache.data && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return Promise.resolve(jwksCache.data);
  }
  if (jwksInflight) return jwksInflight;
  jwksInflight = new Promise((resolve, reject) => {
    const url = `https://${CF_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    https.get(url, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('JWKS fetch failed: HTTP ' + res.statusCode));
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          jwksCache = { data: parsed, fetchedAt: Date.now() };
          resolve(parsed);
        } catch (e) { reject(new Error('JWKS parse failed: ' + e.message)); }
      });
    }).on('error', reject);
  }).finally(() => { jwksInflight = null; });
  return jwksInflight;
}

function verifyCloudflareJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [headerB64, payloadB64, sigB64] = parts;
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (e) { throw new Error('JWT decode failed: ' + e.message); }

  if (header.alg !== 'RS256') throw new Error('Unsupported algorithm: ' + header.alg);
  const iss = `https://${CF_TEAM_DOMAIN}`;
  if (payload.iss !== iss) throw new Error('Issuer mismatch: expected ' + iss);
  if (CF_AUD && !([].concat(payload.aud)).includes(CF_AUD)) throw new Error('Audience mismatch');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');
  if (payload.nbf && payload.nbf > now) throw new Error('Token not yet valid');

  const key = ((jwksCache.data && jwksCache.data.keys) || []).find(k => k.kid === header.kid);
  if (!key) throw new Error('No matching key for kid=' + header.kid);
  const pubKey = crypto.createPublicKey({ key, format: 'jwk' });
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(headerB64 + '.' + payloadB64);
  if (!verifier.verify(pubKey, sigB64, 'base64url')) throw new Error('Signature verification failed');
  return payload;
}

module.exports = { fetchJwks, verifyCloudflareJwt };
