import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    service: 'yukie-core',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
