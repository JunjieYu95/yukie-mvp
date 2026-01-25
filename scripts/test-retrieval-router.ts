#!/usr/bin/env npx ts-node
/**
 * Test script for the retrieval-based router
 *
 * Usage:
 *   npx ts-node scripts/test-retrieval-router.ts
 *
 * Required environment variables:
 *   - ANTHROPIC_API_KEY or LLM_API_KEY
 */

import {
  RetrievalRouter,
  KeywordExtractor,
  type RoutingRequest,
} from '../packages/yukie-core/src/router';
import {
  EnhancedServiceRegistry,
  type ServiceDefinition,
  type RegistryYAML,
} from '../packages/yukie-core/src/registry';
import type { AuthContext } from '../packages/shared/protocol/src/types';

// ============================================================================
// Test Configuration
// ============================================================================

const testConfig: RegistryYAML = {
  config: {
    manifestCacheTTL: 300,
    healthCheckInterval: 60,
    defaultTimeout: 30000,
    maxRoutingCandidates: 10,
  },
  services: [
    {
      id: 'habit-tracker',
      name: 'Habit Tracker',
      description: 'Track daily habits like waking up early, exercise, reading, meditation',
      baseUrl: 'http://localhost:3001',
      transport: 'http',
      auth: { method: 'bearer-token', requiredScopes: ['habit:read', 'habit:write'] },
      endpoints: {
        health: '/api/health',
        meta: '/api/v1/meta',
        actions: '/api/v1/actions',
        invoke: '/api/v1/invoke',
      },
      capabilities: ['habit check-in', 'habit tracking', 'streak calculation', 'monthly statistics'],
      tags: ['habit', 'tracking', 'personal', 'health'],
      keywords: ['habit', 'streak', 'check-in', 'wake up', 'exercise', 'meditation', 'reading'],
      riskLevel: 'low',
      enabled: true,
      priority: 100,
    },
    {
      id: 'calendar-service',
      name: 'Calendar Service',
      description: 'Manage calendar events, meetings, and reminders',
      baseUrl: 'http://localhost:3002',
      transport: 'http',
      auth: { method: 'bearer-token', requiredScopes: ['calendar:read', 'calendar:write'] },
      endpoints: {
        health: '/api/health',
        meta: '/api/v1/meta',
        actions: '/api/v1/actions',
        invoke: '/api/v1/invoke',
      },
      capabilities: ['create events', 'list events', 'update events', 'reminders'],
      tags: ['calendar', 'events', 'meetings', 'scheduling'],
      keywords: ['calendar', 'event', 'meeting', 'appointment', 'schedule', 'remind'],
      riskLevel: 'low',
      enabled: true,
      priority: 90,
    },
    {
      id: 'note-service',
      name: 'Note Service',
      description: 'Create, search, and manage notes and documents',
      baseUrl: 'http://localhost:3003',
      transport: 'http',
      auth: { method: 'bearer-token', requiredScopes: ['note:read', 'note:write'] },
      endpoints: {
        health: '/api/health',
        meta: '/api/v1/meta',
        actions: '/api/v1/actions',
        invoke: '/api/v1/invoke',
      },
      capabilities: ['create notes', 'search notes', 'update notes', 'organize notes'],
      tags: ['notes', 'documents', 'writing', 'organization'],
      keywords: ['note', 'write', 'document', 'save', 'remember', 'memo'],
      riskLevel: 'low',
      enabled: true,
      priority: 80,
    },
    {
      id: 'weather-service',
      name: 'Weather Service',
      description: 'Get weather forecasts and current conditions',
      baseUrl: 'http://localhost:3004',
      transport: 'http',
      auth: { method: 'bearer-token', requiredScopes: ['weather:read'] },
      endpoints: {
        health: '/api/health',
        meta: '/api/v1/meta',
        actions: '/api/v1/actions',
        invoke: '/api/v1/invoke',
      },
      capabilities: ['current weather', 'weather forecast', 'temperature', 'conditions'],
      tags: ['weather', 'forecast', 'temperature'],
      keywords: ['weather', 'forecast', 'temperature', 'rain', 'sunny', 'cloudy', 'hot', 'cold'],
      riskLevel: 'low',
      enabled: true,
      priority: 70,
    },
  ],
};

const testAuth: AuthContext = {
  userId: 'test-user',
  scopes: ['habit:read', 'habit:write', 'calendar:read', 'note:read', 'weather:read'],
  requestId: 'test-request-123',
};

// ============================================================================
// Test Cases
// ============================================================================

interface TestCase {
  name: string;
  message: string;
  expectedService?: string;
  shouldMatch?: boolean;
}

const keywordExtractionTests: Array<{ message: string; expectedKeywords: string[] }> = [
  {
    message: 'I woke up early today at 6am',
    expectedKeywords: ['woke', 'early', 'today', '6am'],
  },
  {
    message: "What's my habit streak for exercise?",
    expectedKeywords: ['habit', 'streak', 'exercise'],
  },
  {
    message: 'Schedule a meeting with John tomorrow at 3pm',
    expectedKeywords: ['schedule', 'meeting', 'john', 'tomorrow', '3pm'],
  },
  {
    message: 'Create a note about the project requirements',
    expectedKeywords: ['create', 'note', 'project', 'requirements'],
  },
];

const retrievalTests: TestCase[] = [
  {
    name: 'Habit check-in',
    message: 'I woke up early today',
    expectedService: 'habit-tracker',
    shouldMatch: true,
  },
  {
    name: 'Habit streak query',
    message: "What's my current streak for exercise?",
    expectedService: 'habit-tracker',
    shouldMatch: true,
  },
  {
    name: 'Calendar event',
    message: 'Schedule a meeting for tomorrow at 2pm',
    expectedService: 'calendar-service',
    shouldMatch: true,
  },
  {
    name: 'Note creation',
    message: 'Create a note about my ideas for the project',
    expectedService: 'note-service',
    shouldMatch: true,
  },
  {
    name: 'Weather query',
    message: "What's the weather like today?",
    expectedService: 'weather-service',
    shouldMatch: true,
  },
  {
    name: 'General question - should not match',
    message: 'What is the capital of France?',
    shouldMatch: false,
  },
  {
    name: 'Meditation habit',
    message: 'I meditated for 20 minutes this morning',
    expectedService: 'habit-tracker',
    shouldMatch: true,
  },
];

// ============================================================================
// Test Runner
// ============================================================================

async function runTests(): Promise<void> {
  console.log('='.repeat(70));
  console.log('RETRIEVAL-BASED ROUTER TESTS');
  console.log('='.repeat(70));
  console.log();

  let passed = 0;
  let failed = 0;

  // Initialize registry with test config
  const registry = new EnhancedServiceRegistry();
  registry.loadFromYAML(testConfig);

  console.log(`Loaded ${registry.getEnabled().length} services`);
  console.log();

  // Test 1: Keyword Extraction
  console.log('='.repeat(70));
  console.log('TEST 1: KEYWORD EXTRACTION');
  console.log('='.repeat(70));
  console.log();

  const extractor = new KeywordExtractor();

  for (const test of keywordExtractionTests) {
    console.log(`Input: "${test.message}"`);
    const result = extractor.extract(test.message);

    console.log(`  Keywords: ${result.keywords.join(', ')}`);
    console.log(`  Phrases: ${result.phrases.slice(0, 3).join(', ')}`);
    console.log(`  Intents: ${result.intents.join(', ')}`);
    console.log(`  Entities: ${result.entities.join(', ')}`);

    // Check if expected keywords are found
    const hasExpected = test.expectedKeywords.every((k) =>
      result.keywords.some((rk) => rk.includes(k.toLowerCase()))
    );

    if (hasExpected) {
      console.log('  ✓ PASSED (expected keywords found)');
      passed++;
    } else {
      console.log('  ✗ FAILED (missing expected keywords)');
      failed++;
    }
    console.log();
  }

  // Test 2: Candidate Retrieval (without LLM)
  console.log('='.repeat(70));
  console.log('TEST 2: CANDIDATE RETRIEVAL');
  console.log('='.repeat(70));
  console.log();

  const router = new RetrievalRouter();

  for (const test of retrievalTests) {
    console.log(`Test: ${test.name}`);
    console.log(`  Message: "${test.message}"`);

    try {
      const result = await router.retrieveCandidates(test.message, 5);

      console.log(`  Candidates found: ${result.candidates.length}`);
      for (const candidate of result.candidates.slice(0, 3)) {
        console.log(`    - ${candidate.serviceId} (score: ${candidate.matchScore.toFixed(2)})`);
      }

      if (test.shouldMatch === false) {
        // Should have no strong matches (all low scores)
        const hasStrongMatch = result.candidates.some((c) => c.matchScore > 5);
        if (!hasStrongMatch) {
          console.log('  ✓ PASSED (no strong match as expected)');
          passed++;
        } else {
          console.log('  ✗ FAILED (unexpected strong match)');
          failed++;
        }
      } else if (test.expectedService) {
        // Should have expected service as top candidate
        const topCandidate = result.candidates[0];
        if (topCandidate && topCandidate.serviceId === test.expectedService) {
          console.log(`  ✓ PASSED (${test.expectedService} is top candidate)`);
          passed++;
        } else {
          console.log(`  ✗ FAILED (expected ${test.expectedService}, got ${topCandidate?.serviceId || 'none'})`);
          failed++;
        }
      }
    } catch (error) {
      console.log(`  ✗ ERROR: ${error}`);
      failed++;
    }
    console.log();
  }

  // Test 3: Full Routing (with LLM) - Skip if no API key
  const hasApiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;

  if (hasApiKey) {
    console.log('='.repeat(70));
    console.log('TEST 3: FULL LLM ROUTING');
    console.log('='.repeat(70));
    console.log();

    const routingTests: TestCase[] = [
      {
        name: 'Habit check-in with LLM',
        message: 'I woke up early today at 6am and exercised',
        expectedService: 'habit-tracker',
      },
      {
        name: 'General question with LLM',
        message: 'What is the meaning of life?',
        expectedService: 'none',
      },
    ];

    for (const test of routingTests) {
      console.log(`Test: ${test.name}`);
      console.log(`  Message: "${test.message}"`);

      try {
        const result = await router.route({
          message: test.message,
          auth: testAuth,
        });

        console.log(`  Target: ${result.targetService}`);
        console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
        console.log(`  Reasoning: ${result.reasoning}`);
        console.log(`  Retrieval time: ${result.retrievalTime}ms`);
        console.log(`  Routing time: ${result.routingTime}ms`);

        if (test.expectedService && result.targetService === test.expectedService) {
          console.log('  ✓ PASSED');
          passed++;
        } else if (!test.expectedService) {
          console.log('  ✓ PASSED (no expected service)');
          passed++;
        } else {
          console.log(`  ✗ FAILED (expected ${test.expectedService})`);
          failed++;
        }
      } catch (error) {
        console.log(`  ✗ ERROR: ${error}`);
        failed++;
      }
      console.log();
    }
  } else {
    console.log('='.repeat(70));
    console.log('TEST 3: SKIPPED (No LLM API key)');
    console.log('='.repeat(70));
    console.log('Set ANTHROPIC_API_KEY or LLM_API_KEY to run full routing tests');
    console.log();
  }

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
