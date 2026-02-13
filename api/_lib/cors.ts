import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_HEADERS = [
  'X-CSRF-Token',
  'X-Requested-With',
  'Accept',
  'Accept-Version',
  'Content-Length',
  'Content-MD5',
  'Content-Type',
  'Date',
  'X-Api-Version',
  'Authorization',
  'X-Yukie-User-Id',
  'X-Yukie-Scopes',
  'X-Yukie-Request-Id',
  'X-Yukie-UTC-Offset-Minutes',
  'X-OpenClaw-Proxy-Secret',
].join(', ');

/**
 * Set CORS headers on the response.
 *
 * When credentials (cookies / Authorization header) are involved the
 * spec forbids `Access-Control-Allow-Origin: *`.  We therefore reflect
 * the request's Origin header when present, and fall back to `*` for
 * non-credentialed / same-origin requests where the Origin header is
 * absent.
 */
export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  if (origin) {
    res.setHeader('Vary', 'Origin');
  }
}
