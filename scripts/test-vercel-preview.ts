#!/usr/bin/env npx ts-node
/**
 * Test Vercel Preview Deployment
 *
 * Tests the API endpoints on a Vercel preview deployment.
 * Usage: VERCEL_URL=https://your-preview-url.vercel.app npx ts-node scripts/test-vercel-preview.ts
 */

const VERCEL_URL = process.env.VERCEL_URL || 'https://yukie-mvp.vercel.app';

async function testHealth(): Promise<boolean> {
  console.log('\n=== Testing Health Endpoint ===');
  try {
    const response = await fetch(`${VERCEL_URL}/api/health`);
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    return response.ok;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

async function testChat(token: string): Promise<boolean> {
  console.log('\n=== Testing Chat Endpoint ===');
  try {
    const response = await fetch(`${VERCEL_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: 'Hello, what can you do?',
      }),
    });

    console.log('Status:', response.status);
    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);

    if (!response.ok) {
      const text = await response.text();
      console.error('Error response:', text);
      return false;
    }

    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Chat test failed:', error);
    return false;
  }
}

async function getDevToken(): Promise<string | null> {
  console.log('\n=== Getting Dev Token ===');
  try {
    const response = await fetch(`${VERCEL_URL}/api/auth/dev-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'test-user',
        scopes: ['habit-tracker:read', 'habit-tracker:write'],
      }),
    });

    console.log('Status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('Error getting token:', text);
      return null;
    }

    const data = await response.json();
    console.log('Token obtained:', data.token ? 'yes' : 'no');
    return data.token;
  } catch (error) {
    console.error('Token request failed:', error);
    return null;
  }
}

async function main() {
  console.log('Testing Vercel deployment at:', VERCEL_URL);

  // Test health
  const healthOk = await testHealth();
  if (!healthOk) {
    console.error('\n❌ Health check failed - deployment may have issues');
    process.exit(1);
  }
  console.log('✅ Health check passed');

  // Get dev token
  const token = await getDevToken();
  if (!token) {
    console.error('\n❌ Could not get dev token');
    process.exit(1);
  }
  console.log('✅ Dev token obtained');

  // Test chat
  const chatOk = await testChat(token);
  if (!chatOk) {
    console.error('\n❌ Chat test failed');
    process.exit(1);
  }
  console.log('✅ Chat test passed');

  console.log('\n✅ All tests passed!');
}

main().catch(console.error);
