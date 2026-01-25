#!/usr/bin/env npx ts-node
/**
 * Test script for the routing system
 *
 * Usage:
 *   npx ts-node scripts/test-routing.ts
 *
 * Required environment variables:
 *   - ANTHROPIC_API_KEY or LLM_API_KEY
 *   - HABIT_TRACKER_URL (optional, defaults to http://localhost:3001)
 */

import { routeMessage, initializeRegistry, getRegistry, processChatMessage, generateFallbackResponse } from '../packages/yukie-core/src/router';
import { createLogger } from '../packages/shared/observability/src/logger';
import type { AuthContext } from '../packages/shared/protocol/src/types';

const logger = createLogger('test-routing');

// Test cases
interface TestCase {
  name: string;
  message: string;
  expectedService?: string;
  expectedMinConfidence?: number;
}

const testCases: TestCase[] = [
  {
    name: 'Habit check-in query',
    message: 'I woke up early today at 6am',
    expectedService: 'habit-tracker',
    expectedMinConfidence: 0.5,
  },
  {
    name: 'Habit streak query',
    message: "What's my current streak for waking up early?",
    expectedService: 'habit-tracker',
    expectedMinConfidence: 0.5,
  },
  {
    name: 'Habit stats query',
    message: 'Show me my habit statistics for this month',
    expectedService: 'habit-tracker',
    expectedMinConfidence: 0.5,
  },
  {
    name: 'General query - should not route',
    message: 'What is the capital of France?',
    expectedService: 'none',
    expectedMinConfidence: 0,
  },
  {
    name: 'Weather query - should not route',
    message: "What's the weather like today?",
    expectedService: 'none',
    expectedMinConfidence: 0,
  },
  {
    name: 'Habit history query',
    message: 'Did I exercise last week?',
    expectedService: 'habit-tracker',
    expectedMinConfidence: 0.5,
  },
];

async function runTests(): Promise<void> {
  console.log('='.repeat(70));
  console.log('ROUTING SYSTEM TEST');
  console.log('='.repeat(70));
  console.log();

  // Initialize registry
  console.log('Initializing registry...');
  initializeRegistry();
  const registry = getRegistry();
  const services = registry.getEnabled();
  console.log(`Loaded ${services.length} services:`);
  services.forEach((s) => {
    console.log(`  - ${s.id}: ${s.name} (${s.capabilities.join(', ')})`);
  });
  console.log();

  // Run routing tests
  console.log('='.repeat(70));
  console.log('ROUTING TESTS');
  console.log('='.repeat(70));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    console.log(`  Message: "${testCase.message}"`);

    try {
      const result = await routeMessage(testCase.message);

      console.log(`  Result:`);
      console.log(`    Target: ${result.targetService}`);
      console.log(`    Confidence: ${result.confidence.toFixed(2)}`);
      console.log(`    Reasoning: ${result.reasoning}`);

      // Check expectations
      const serviceMatch = testCase.expectedService ? result.targetService === testCase.expectedService : true;
      const confidenceMatch =
        testCase.expectedMinConfidence !== undefined ? result.confidence >= testCase.expectedMinConfidence : true;

      if (serviceMatch && confidenceMatch) {
        console.log(`  ✓ PASSED`);
        passed++;
      } else {
        console.log(`  ✗ FAILED`);
        if (!serviceMatch) {
          console.log(`    Expected service: ${testCase.expectedService}, got: ${result.targetService}`);
        }
        if (!confidenceMatch) {
          console.log(`    Expected min confidence: ${testCase.expectedMinConfidence}, got: ${result.confidence}`);
        }
        failed++;
      }
    } catch (error) {
      console.log(`  ✗ ERROR: ${error}`);
      failed++;
    }
    console.log();
  }

  // Run a full chat flow test
  console.log('='.repeat(70));
  console.log('FULL CHAT FLOW TEST');
  console.log('='.repeat(70));
  console.log();

  const testAuth: AuthContext = {
    userId: 'test-user',
    scopes: ['habit:read', 'habit:write', 'yukie:chat'],
    requestId: 'test-request-123',
  };

  // Test general query (should use fallback)
  console.log('Test: General query (fallback)');
  console.log('  Message: "Hello, how are you?"');
  try {
    const result = await processChatMessage({
      message: 'Hello, how are you?',
      auth: testAuth,
    });
    console.log(`  Response: ${result.response.substring(0, 100)}...`);
    console.log(`  Service Used: ${result.serviceUsed || 'none (fallback)'}`);
    console.log(`  Routing Confidence: ${result.routingConfidence?.toFixed(2) || 'N/A'}`);
    console.log(`  ✓ PASSED (no error)`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${passed + failed}`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
