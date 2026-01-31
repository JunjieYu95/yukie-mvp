#!/usr/bin/env node
/**
 * End-to-end test: Time-spend trend queries that should return a chart image.
 *
 * Usage:
 *   YUKIE_URL=https://your-yukie.vercel.app npx tsx scripts/test-chat-trend-e2e.ts
 *   YUKIE_TOKEN=... YUKIE_URL=http://localhost:3000 npx tsx scripts/test-chat-trend-e2e.ts
 *
 * Optional env:
 *   TARGET_SERVICE=diary-analyzer (forces routing to a service)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env') });

const YUKIE_URL = (process.env.YUKIE_URL || process.env.VERCEL_URL || 'http://localhost:3000')
  .trim()
  .replace(/\/$/, '');
const YUKIE_TOKEN = process.env.YUKIE_TOKEN?.trim();
const TARGET_SERVICE = process.env.TARGET_SERVICE?.trim();

const TEST_CASES = [
  {
    name: 'Last year - monthly trend chart',
    message: 'Show my time spend trend last year by month with a chart.',
    outputFile: 'test-chat-response-trend-last-year.png',
  },
  {
    name: 'Last quarter - weekly trend chart',
    message: 'Give me a weekly time spend trend for last quarter as a chart.',
    outputFile: 'test-chat-response-trend-last-quarter.png',
  },
];

async function getToken(): Promise<string> {
  if (YUKIE_TOKEN) {
    console.log('Using YUKIE_TOKEN from env.');
    return YUKIE_TOKEN;
  }

  console.log('Getting dev token...');
  const tokenRes = await fetch(`${YUKIE_URL}/api/auth/dev-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: `test-${Date.now()}` }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Failed to get token: ${tokenRes.status} ${text.substring(0, 200)}`);
  }

  const data = (await tokenRes.json()) as { token?: string };
  if (!data.token) {
    throw new Error('No token returned from dev-token endpoint');
  }

  return data.token;
}

async function runTestCase(token: string, testCase: typeof TEST_CASES[number]) {
  console.log(`\n🧪 ${testCase.name}`);
  console.log(`   Message: "${testCase.message}"`);

  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const body: Record<string, unknown> = { message: testCase.message };
  if (TARGET_SERVICE) {
    body.targetService = TARGET_SERVICE;
  }

  const chatRes = await fetch(`${YUKIE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Yukie-UTC-Offset-Minutes': String(utcOffsetMinutes),
    },
    body: JSON.stringify(body),
  });

  if (!chatRes.ok) {
    const text = await chatRes.text();
    throw new Error(`Chat request failed: ${chatRes.status} ${text.substring(0, 300)}`);
  }

  const chatData = (await chatRes.json()) as {
    response?: string;
    content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    serviceUsed?: string;
    actionInvoked?: string;
  };

  const content = chatData.content || [];
  const imageItems = content.filter((c) => c.type === 'image' && c.data);
  if (imageItems.length === 0) {
    throw new Error('No image content returned for chart response');
  }

  const outputPath = resolve(process.cwd(), testCase.outputFile);
  const buffer = Buffer.from(imageItems[0].data!, 'base64');
  writeFileSync(outputPath, buffer);

  console.log(`   ✅ serviceUsed: ${chatData.serviceUsed || 'unknown'}`);
  console.log(`   ✅ actionInvoked: ${chatData.actionInvoked || 'unknown'}`);
  console.log(`   ✅ Saved chart: ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('CHAT E2E TREND TEST');
  console.log('='.repeat(70));
  console.log(`Target: ${YUKIE_URL}`);
  if (TARGET_SERVICE) {
    console.log(`Forced service: ${TARGET_SERVICE}`);
  }

  const token = await getToken();

  for (const testCase of TEST_CASES) {
    await runTestCase(token, testCase);
  }

  console.log('\n✅ All trend tests passed.');
}

main().catch((err) => {
  console.error(`\n❌ Test failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
