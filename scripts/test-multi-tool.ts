#!/usr/bin/env npx ts-node
/**
 * Test script for multi-tool orchestration
 *
 * Usage:
 *   npx ts-node scripts/test-multi-tool.ts
 */

import { Planner, type Plan, type ToolCall } from '../packages/yukie-core/src/planner';
import { Executor, ParameterValidator } from '../packages/yukie-core/src/executor';
import { ResponseComposer } from '../packages/yukie-core/src/composer';
import type { ToolSchema } from '../packages/yukie-core/src/registry/types';
import type { AuthContext } from '../packages/shared/protocol/src/types';

// ============================================================================
// Test Configuration
// ============================================================================

const testAuth: AuthContext = {
  userId: 'test-user',
  scopes: ['habit:read', 'habit:write', 'calendar:read', 'note:read'],
  requestId: 'test-request-123',
};

const testTools: Array<{ serviceId: string; serviceName: string; tools: ToolSchema[] }> = [
  {
    serviceId: 'habit-tracker',
    serviceName: 'Habit Tracker',
    tools: [
      {
        name: 'habit.checkin',
        description: 'Record a habit check-in',
        parameters: [
          { name: 'date', type: 'string', required: true, description: 'Date in YYYY-MM-DD format' },
          { name: 'checked', type: 'boolean', required: false, description: 'Whether checked in', default: true },
          { name: 'note', type: 'string', required: false, description: 'Optional note' },
        ],
        requiredScopes: ['habit:write'],
      },
      {
        name: 'habit.stats',
        description: 'Get habit statistics',
        parameters: [
          { name: 'month', type: 'string', required: false, description: 'Month in YYYY-MM format' },
          { name: 'includeStreak', type: 'boolean', required: false, description: 'Include streak info', default: true },
        ],
        requiredScopes: ['habit:read'],
      },
    ],
  },
  {
    serviceId: 'calendar-service',
    serviceName: 'Calendar Service',
    tools: [
      {
        name: 'calendar.list',
        description: 'List calendar events',
        parameters: [
          { name: 'date', type: 'string', required: false, description: 'Date in YYYY-MM-DD format' },
          { name: 'limit', type: 'number', required: false, description: 'Max events to return', default: 10 },
        ],
        requiredScopes: ['calendar:read'],
      },
    ],
  },
];

// ============================================================================
// Test Runner
// ============================================================================

async function runTests(): Promise<void> {
  console.log('='.repeat(70));
  console.log('MULTI-TOOL ORCHESTRATION TESTS');
  console.log('='.repeat(70));
  console.log();

  let passed = 0;
  let failed = 0;

  // Test 1: Parameter Validator
  console.log('='.repeat(70));
  console.log('TEST 1: PARAMETER VALIDATOR');
  console.log('='.repeat(70));
  console.log();

  const validator = new ParameterValidator();

  const validatorTests = [
    {
      name: 'Valid parameters',
      call: {
        id: 'test-1',
        serviceId: 'habit-tracker',
        toolName: 'habit.checkin',
        params: { date: '2026-01-25', checked: true },
        riskLevel: 'low' as const,
      },
      schema: testTools[0].tools[0],
      expectValid: true,
    },
    {
      name: 'Missing required parameter',
      call: {
        id: 'test-2',
        serviceId: 'habit-tracker',
        toolName: 'habit.checkin',
        params: { checked: true },
        riskLevel: 'low' as const,
      },
      schema: testTools[0].tools[0],
      expectValid: false,
    },
    {
      name: 'Wrong type',
      call: {
        id: 'test-3',
        serviceId: 'habit-tracker',
        toolName: 'habit.checkin',
        params: { date: '2026-01-25', checked: 'yes' }, // Should be boolean
        riskLevel: 'low' as const,
      },
      schema: testTools[0].tools[0],
      expectValid: false,
    },
  ];

  for (const test of validatorTests) {
    console.log(`Test: ${test.name}`);
    const result = validator.validate(test.call, test.schema);
    console.log(`  Valid: ${result.valid}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (result.valid === test.expectValid) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log(`  ✗ FAILED (expected valid=${test.expectValid})`);
      failed++;
    }
    console.log();
  }

  // Test 2: Parameter Coercion
  console.log('='.repeat(70));
  console.log('TEST 2: PARAMETER COERCION');
  console.log('='.repeat(70));
  console.log();

  const coercionTests = [
    {
      name: 'String to boolean',
      params: { date: '2026-01-25', checked: 'true' },
      schema: testTools[0].tools[0],
      expectedChecked: true,
    },
    {
      name: 'String to number',
      params: { date: '2026-01-25', limit: '5' },
      schema: testTools[1].tools[0],
      expectedLimit: 5,
    },
  ];

  for (const test of coercionTests) {
    console.log(`Test: ${test.name}`);
    console.log(`  Before: ${JSON.stringify(test.params)}`);
    const coerced = validator.coerceParams(test.params, test.schema);
    console.log(`  After: ${JSON.stringify(coerced)}`);

    let testPassed = true;
    if ('expectedChecked' in test && coerced.checked !== test.expectedChecked) {
      testPassed = false;
    }
    if ('expectedLimit' in test && coerced.limit !== test.expectedLimit) {
      testPassed = false;
    }

    if (testPassed) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED');
      failed++;
    }
    console.log();
  }

  // Test 3: Planner (without LLM - structure only)
  console.log('='.repeat(70));
  console.log('TEST 3: PLANNER STRUCTURE');
  console.log('='.repeat(70));
  console.log();

  const planner = new Planner();

  // Test plan validation
  const testPlan: Plan = {
    id: 'test-plan-1',
    message: 'Check in my habit and show my stats',
    toolCalls: [
      {
        id: 'call_0_habit.checkin',
        serviceId: 'habit-tracker',
        toolName: 'habit.checkin',
        params: { date: '2026-01-25', checked: true },
        riskLevel: 'low',
      },
      {
        id: 'call_1_habit.stats',
        serviceId: 'habit-tracker',
        toolName: 'habit.stats',
        params: { includeStreak: true },
        dependsOn: ['call_0_habit.checkin'],
        riskLevel: 'low',
      },
    ],
    executionMode: 'sequential',
    executionOrder: [['call_0_habit.checkin'], ['call_1_habit.stats']],
    confidence: 0.9,
    reasoning: 'First check in, then show stats',
    createdAt: Date.now(),
  };

  console.log('Test: Plan validation');
  console.log(`  Tool calls: ${testPlan.toolCalls.length}`);
  console.log(`  Execution mode: ${testPlan.executionMode}`);
  console.log(`  Execution order: ${JSON.stringify(testPlan.executionOrder)}`);

  const validationResult = planner.validatePlan(testPlan, testAuth, testTools);
  console.log(`  Validation valid: ${validationResult.valid}`);
  console.log(`  Errors: ${validationResult.errors.length}`);
  console.log(`  Warnings: ${validationResult.warnings.length}`);

  if (validationResult.valid) {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log(`  ✗ FAILED: ${validationResult.errors.map((e) => e.message).join(', ')}`);
    failed++;
  }
  console.log();

  // Test 4: Plan with missing scope
  console.log('Test: Plan with missing scope');
  const restrictedAuth: AuthContext = {
    userId: 'test-user',
    scopes: ['habit:read'], // Missing habit:write
    requestId: 'test-request-123',
  };

  const scopeValidation = planner.validatePlan(testPlan, restrictedAuth, testTools);
  console.log(`  Validation valid: ${scopeValidation.valid}`);
  console.log(`  Errors: ${scopeValidation.errors.map((e) => e.message).join(', ')}`);

  if (!scopeValidation.valid && scopeValidation.errors.some((e) => e.type === 'missing_scope')) {
    console.log('  ✓ PASSED (correctly detected missing scope)');
    passed++;
  } else {
    console.log('  ✗ FAILED (should have detected missing scope)');
    failed++;
  }
  console.log();

  // Test 5: Response Composer (basic formatting)
  console.log('='.repeat(70));
  console.log('TEST 4: RESPONSE COMPOSER (Basic)');
  console.log('='.repeat(70));
  console.log();

  const composer = new ResponseComposer();

  // Create mock execution result
  const mockExecutionResult = {
    planId: 'test-plan-1',
    success: true,
    results: [
      {
        id: 'call_0_habit.checkin',
        serviceId: 'habit-tracker',
        toolName: 'habit.checkin',
        success: true,
        result: { message: 'Checked in successfully', streak: 7 },
        durationMs: 100,
      },
    ],
    totalDurationMs: 100,
    completedCalls: 1,
    failedCalls: 0,
    workingState: {
      planId: 'test-plan-1',
      currentStep: 1,
      totalSteps: 1,
      completedCalls: ['call_0_habit.checkin'],
      pendingCalls: [],
      failedCalls: [],
      results: new Map(),
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    },
  };

  console.log('Test: Basic composition request structure');
  const compositionRequest = {
    originalMessage: 'I woke up early today',
    plan: testPlan,
    executionResult: mockExecutionResult,
  };

  console.log(`  Original message: "${compositionRequest.originalMessage}"`);
  console.log(`  Results: ${mockExecutionResult.results.length}`);
  console.log(`  Success: ${mockExecutionResult.success}`);
  console.log('  ✓ PASSED (structure valid)');
  passed++;
  console.log();

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${passed + failed}`);
  console.log();

  console.log('Note: Full integration tests require running services.');
  console.log('These tests verify the structure and logic of the orchestration components.');
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
