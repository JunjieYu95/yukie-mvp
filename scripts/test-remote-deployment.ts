#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root (optional)
config({ path: resolve(process.cwd(), '.env') });

const YUKIE_URL = (process.env.YUKIE_URL || process.env.VERCEL_URL || '').trim();
const EARLY_WAKEUP_API_URL = (process.env.EARLY_WAKEUP_API_URL || 'https://early-wakeup-habit.vercel.app').trim();

function normalizeBase(url: string): string {
  return url.replace(/\/$/, '');
}

function shortText(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function checkJson(label: string, url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let body: unknown;
  if (isJson) {
    try {
      body = await response.json();
    } catch (err) {
      body = { parseError: String(err) };
    }
  } else {
    const text = await response.text();
    body = { text: shortText(text) };
  }

  return {
    label,
    url,
    status: response.status,
    contentType,
    ok: response.ok,
    body,
  };
}

async function main() {
  if (!YUKIE_URL) {
    console.error('❌ Missing YUKIE_URL or VERCEL_URL. Example:');
    console.error('   YUKIE_URL=https://your-yukie.vercel.app npx tsx scripts/test-remote-deployment.ts');
    process.exit(1);
  }

  const yukieBase = normalizeBase(YUKIE_URL);
  const earlyBase = normalizeBase(EARLY_WAKEUP_API_URL);

  console.log('🔎 Remote Deployment Checks');
  console.log(`- Yukie: ${yukieBase}`);
  console.log(`- Early Wakeup: ${earlyBase}`);

  // 1) Yukie health
  const health = await checkJson('Yukie /healthz', `${yukieBase}/healthz`);
  console.log('\n1) Yukie /healthz');
  console.log(health);

  // 2) Dev token (may be disabled in production)
  const devToken = await checkJson('Yukie /api/auth/dev-token', `${yukieBase}/api/auth/dev-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: `dev-user-${Date.now()}` }),
  });
  console.log('\n2) Yukie /api/auth/dev-token');
  console.log(devToken);

  const token = (devToken as { body?: { token?: string } }).body?.token as string | undefined;

  if (token) {
    // 3) Chat
    const chat = await checkJson('Yukie /api/chat', `${yukieBase}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: 'Hello! What is my current streak?' }),
    });
    console.log('\n3) Yukie /api/chat');
    console.log(chat);
  } else {
    console.log('\n3) Yukie /api/chat');
    console.log('⚠️  Skipped (no token returned from /api/auth/dev-token)');
  }

  // 4) Early wakeup health
  const earlyHealth = await checkJson('Early Wakeup /api/health', `${earlyBase}/api/health`);
  console.log('\n4) Early Wakeup /api/health');
  console.log(earlyHealth);

  // 5) Early wakeup records
  const earlyRecords = await checkJson('Early Wakeup /api/records', `${earlyBase}/api/records`);
  console.log('\n5) Early Wakeup /api/records');
  console.log(earlyRecords);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
