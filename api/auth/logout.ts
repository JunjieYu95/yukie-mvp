import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCors } from '../_lib/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  res.setHeader('Set-Cookie', [
    'yukie_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    'yukie_proxy_secret=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  ]);
  res.status(200).json({ ok: true });
}
