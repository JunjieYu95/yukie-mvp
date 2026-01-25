#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') });

const YUKIE_CORE_URL = process.env.YUKIE_CORE_URL || 'http://localhost:3000';
const HABIT_TRACKER_URL = process.env.HABIT_TRACKER_URL || 'http://localhost:3001';
const EARLY_WAKEUP_API_URL = process.env.EARLY_WAKEUP_API_URL || 'https://early-wakeup-habit.vercel.app';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: unknown;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`\n${message}`);
}

function test(name: string, fn: () => Promise<void> | void) {
  return async () => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`✅ ${name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({ name, passed: false, error: errorMessage });
      console.log(`❌ ${name}: ${errorMessage}`);
    }
  };
}

async function runTests() {
  console.log('🧪 Running API Tests for Yukie MVP Blueprint\n');
  console.log(`Yukie Core: ${YUKIE_CORE_URL}`);
  console.log(`Habit Tracker: ${HABIT_TRACKER_URL}`);
  console.log(`Early Wakeup API: ${EARLY_WAKEUP_API_URL}\n`);

  // ============================================================================
  // Test 1: Yukie Core Health
  // ============================================================================
  await test('Yukie Core Health Check', async () => {
    const response = await fetch(`${YUKIE_CORE_URL}/healthz`);
    if (!response.ok) throw new Error(`Status: ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error('Health check returned not ok');
  })();

  // ============================================================================
  // Test 2: Habit Tracker Health
  // ============================================================================
  await test('Habit Tracker Health Check', async () => {
    const response = await fetch(`${HABIT_TRACKER_URL}/api/health`);
    if (!response.ok) throw new Error(`Status: ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error('Health check returned not ok');
  })();

  // ============================================================================
  // Test 3: Early Wakeup API Health
  // ============================================================================
  await test('Early Wakeup API Health Check', async () => {
    const response = await fetch(`${EARLY_WAKEUP_API_URL}/api/health`);
    if (!response.ok) throw new Error(`Status: ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error('Health check returned not ok');
  })();

  // ============================================================================
  // Test 4: Generate Dev Token
  // ============================================================================
  let token: string | null = null;
  let userId: string | null = null;

  await test('Generate Dev Token', async () => {
    const response = await fetch(`${YUKIE_CORE_URL}/api/auth/dev-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-user' }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Status: ${response.status}, Response: ${text.substring(0, 100)}`);
    }
    const data = await response.json();
    if (!data.token) throw new Error('No token in response');
    token = data.token;
    userId = data.userId;
    console.log(`   Token: ${token.substring(0, 50)}...`);
    console.log(`   User ID: ${userId}`);
  })();

  if (!token) {
    console.log('\n⚠️  Cannot continue tests without token. Stopping.');
    return;
  }

  // ============================================================================
  // Test 5: Habit Tracker Actions Endpoint
  // ============================================================================
  await test('Habit Tracker Actions Endpoint', async () => {
    const response = await fetch(`${HABIT_TRACKER_URL}/api/v1/actions`);
    if (!response.ok) throw new Error(`Status: ${response.status}`);
    const data = await response.json();
    if (!data.actions || !Array.isArray(data.actions)) {
      throw new Error('Invalid actions response');
    }
    console.log(`   Found ${data.actions.length} actions`);
    data.actions.forEach((action: { name: string }) => {
      console.log(`   - ${action.name}`);
    });
  })();

  // ============================================================================
  // Test 6: Habit Tracker Stats (via direct API)
  // ============================================================================
  await test('Habit Tracker Stats (Direct API)', async () => {
    const response = await fetch(`${HABIT_TRACKER_URL}/api/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Yukie-User-Id': userId!,
        'X-Yukie-Scopes': 'habit:read',
      },
      body: JSON.stringify({
        action: 'habit.stats',
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Status: ${response.status}, Response: ${text.substring(0, 200)}`);
    }
    const data = await response.json();
    if (!data.success) throw new Error(`Action failed: ${JSON.stringify(data.error)}`);
    console.log(`   Streak: ${data.result.stats.currentStreak} days`);
    console.log(`   Completed: ${data.result.stats.completedDays} days`);
  })();

  // ============================================================================
  // Test 7: Chat via Yukie Core (should route to habit tracker)
  // ============================================================================
  await test('Chat via Yukie Core - Streak Query', async () => {
    const response = await fetch(`${YUKIE_CORE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: "What's my current streak?",
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Status: ${response.status}, Response: ${text.substring(0, 200)}`);
    }
    const data = await response.json();
    if (!data.response) throw new Error('No response in chat data');
    if (!data.serviceUsed) throw new Error('No serviceUsed in response');
    if (data.serviceUsed !== 'habit-tracker') {
      throw new Error(`Expected habit-tracker, got ${data.serviceUsed}`);
    }
    console.log(`   Service: ${data.serviceUsed}`);
    console.log(`   Action: ${data.actionInvoked || 'none'}`);
    console.log(`   Response: ${data.response.substring(0, 100)}...`);
  })();

  // ============================================================================
  // Test 8: Chat with Model Selection
  // ============================================================================
  await test('Chat with Model Selection', async () => {
    const response = await fetch(`${YUKIE_CORE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: 'Check me in for today',
        model: 'claude-3-5-haiku-20241022',
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Status: ${response.status}, Response: ${text.substring(0, 200)}`);
    }
    const data = await response.json();
    if (!data.response) throw new Error('No response in chat data');
    console.log(`   Service: ${data.serviceUsed || 'none'}`);
    console.log(`   Action: ${data.actionInvoked || 'none'}`);
  })();

  // ============================================================================
  // Test 9: Verify Check-in via Habit Tracker
  // ============================================================================
  await test('Verify Check-in via Habit Tracker', async () => {
    const today = new Date().toISOString().split('T')[0];
    const response = await fetch(`${HABIT_TRACKER_URL}/api/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Yukie-User-Id': userId!,
        'X-Yukie-Scopes': 'habit:read',
      },
      body: JSON.stringify({
        action: 'habit.query',
        params: { date: today },
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Status: ${response.status}, Response: ${text.substring(0, 200)}`);
    }
    const data = await response.json();
    if (!data.success) throw new Error(`Action failed: ${JSON.stringify(data.error)}`);
    console.log(`   Today's record found: ${data.result.found}`);
  })();

  // ============================================================================
  // Test 10: Early Wakeup API Records
  // ============================================================================
  await test('Early Wakeup API - Fetch Records', async () => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];

    const response = await fetch(
      `${EARLY_WAKEUP_API_URL}/api/records?from=${fromStr}&to=${toStr}`
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Status: ${response.status}, Response: ${text.substring(0, 200)}`);
    }
    const data = await response.json();
    if (!data.records || !Array.isArray(data.records)) {
      throw new Error('Invalid records response');
    }
    console.log(`   Found ${data.records.length} records in last 7 days`);
  })();

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
