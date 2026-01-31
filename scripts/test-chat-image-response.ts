#!/usr/bin/env node
/**
 * Test script: Verify that the chat API returns image content for time-stats queries.
 *
 * Usage:
 *   # Test against production (set your Yukie deployment URL):
 *   YUKIE_URL=https://your-yukie.vercel.app npx tsx scripts/test-chat-image-response.ts
 *
 *   # Test against local dev (with yukie running on port 3000):
 *   YUKIE_URL=http://localhost:3000 npx tsx scripts/test-chat-image-response.ts
 *
 *   # Or use default (localhost:3000):
 *   npx tsx scripts/test-chat-image-response.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env') });

const YUKIE_URL = (process.env.YUKIE_URL || process.env.VERCEL_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
const YUKIE_TOKEN = process.env.YUKIE_TOKEN?.trim();
const TEST_MESSAGE = 'How do I spend my time this week?';

async function main() {
  console.log('🧪 Testing Chat API - Image Content in Response\n');
  console.log(`   Target: ${YUKIE_URL}`);
  console.log(`   Message: "${TEST_MESSAGE}"\n`);

  // Step 1: Get token (from env or dev-token endpoint)
  let token: string;
  if (YUKIE_TOKEN) {
    console.log('1️⃣  Using YUKIE_TOKEN from env...');
    token = YUKIE_TOKEN;
    console.log('   ✅ Token provided\n');
  } else {
    console.log('1️⃣  Getting dev token...');
    const tokenRes = await fetch(`${YUKIE_URL}/api/auth/dev-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: `test-${Date.now()}` }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('   ❌ Failed to get token:', tokenRes.status, text.substring(0, 200));
      console.error('\n   For production, get a token from the chatbox (DevTools → Application → Local Storage → yukie_token)');
      console.error('   and run: YUKIE_TOKEN=<your-token> YUKIE_URL=<url> npx tsx scripts/test-chat-image-response.ts');
      process.exit(1);
    }

    const data = (await tokenRes.json()) as { token?: string };
    if (!data.token) {
      console.error('   ❌ No token in response');
      process.exit(1);
    }
    token = data.token;
    console.log('   ✅ Token obtained\n');
  }

  // Step 2: Call chat API
  console.log('2️⃣  Calling /api/chat...');
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const chatRes = await fetch(`${YUKIE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Yukie-UTC-Offset-Minutes': String(utcOffsetMinutes),
    },
    body: JSON.stringify({ message: TEST_MESSAGE }),
  });

  if (!chatRes.ok) {
    const text = await chatRes.text();
    console.error('   ❌ Chat request failed:', chatRes.status, text.substring(0, 300));
    process.exit(1);
  }

  const chatData = (await chatRes.json()) as {
    response?: string;
    content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    serviceUsed?: string;
    actionInvoked?: string;
  };

  console.log('   ✅ Chat response received');
  console.log(`   - serviceUsed: ${chatData.serviceUsed}`);
  console.log(`   - actionInvoked: ${chatData.actionInvoked}`);
  console.log(`   - response length: ${chatData.response?.length ?? 0} chars\n`);

  // Step 3: Check for content field
  console.log('3️⃣  Checking for image content...');
  if (!chatData.content) {
    console.error('   ❌ No "content" field in response!');
    console.error('   Response keys:', Object.keys(chatData));
    process.exit(1);
  }

  const imageItems = chatData.content.filter((c) => c.type === 'image' && c.data);
  if (imageItems.length === 0) {
    console.error('   ❌ No image content in response!');
    console.error('   Content items:', chatData.content.map((c) => ({ type: c.type, hasData: !!c.data, textLen: c.text?.length })));
    process.exit(1);
  }

  console.log(`   ✅ Found ${imageItems.length} image(s)\n`);

  // Step 4: Save and verify image
  console.log('4️⃣  Saving image to verify...');
  const outputPath = resolve(process.cwd(), 'test-chat-response-chart.png');
  try {
    const buffer = Buffer.from(imageItems[0].data!, 'base64');
    writeFileSync(outputPath, buffer);
    const size = buffer.length;
    console.log(`   ✅ Saved to: ${outputPath}`);
    console.log(`   - Size: ${(size / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('   ❌ Failed to save image:', err);
    process.exit(1);
  }

  // Verify it's a valid PNG
  const { execSync } = await import('child_process');
  try {
    const fileType = execSync(`file "${outputPath}"`, { encoding: 'utf-8' });
    console.log(`   - File type: ${fileType.trim()}`);
    if (!fileType.includes('PNG')) {
      console.error('   ⚠️  Warning: File may not be a valid PNG');
    }
  } catch {
    // file command might not exist on all systems
  }

  console.log('\n✅ All checks passed! Image content is present in chat API response.');
  console.log(`   Open the chart: open "${outputPath}"`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
