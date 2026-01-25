#!/usr/bin/env npx ts-node
/**
 * Test script for security features
 *
 * Usage:
 *   npx ts-node scripts/test-security.ts
 */

import {
  RiskClassifier,
  ConfirmationGate,
  InputSanitizer,
} from '../packages/yukie-core/src/security';
import { AuditLogger } from '../packages/yukie-core/src/audit';
import type { ToolCall } from '../packages/yukie-core/src/planner/types';
import type { AuthContext } from '../packages/shared/protocol/src/types';

// ============================================================================
// Test Configuration
// ============================================================================

const testAuth: AuthContext = {
  userId: 'test-user',
  scopes: ['habit:read', 'habit:write', 'admin'],
  requestId: 'test-request-123',
};

// ============================================================================
// Test Runner
// ============================================================================

async function runTests(): Promise<void> {
  console.log('='.repeat(70));
  console.log('SECURITY FEATURES TESTS');
  console.log('='.repeat(70));
  console.log();

  let passed = 0;
  let failed = 0;

  // Test 1: Risk Classifier
  console.log('='.repeat(70));
  console.log('TEST 1: RISK CLASSIFIER');
  console.log('='.repeat(70));
  console.log();

  const classifier = new RiskClassifier();

  const riskTests = [
    {
      name: 'Low risk - normal query',
      call: {
        id: 'test-1',
        serviceId: 'habit-tracker',
        toolName: 'habit.query',
        params: { month: '2026-01' },
        riskLevel: 'low' as const,
      },
      expectedLevel: 'low',
      expectedConfirmation: false,
    },
    {
      name: 'High risk - delete operation',
      call: {
        id: 'test-2',
        serviceId: 'habit-tracker',
        toolName: 'habit.delete',
        params: { date: '2026-01-25' },
        riskLevel: 'low' as const,
      },
      expectedLevel: 'high',
      expectedConfirmation: true,
    },
    {
      name: 'Medium risk - bulk operation',
      call: {
        id: 'test-3',
        serviceId: 'habit-tracker',
        toolName: 'habit.update',
        params: { bulk: true, ids: Array(15).fill('id') },
        riskLevel: 'low' as const,
      },
      expectedLevel: 'medium',
      expectedConfirmation: true,
    },
    {
      name: 'High risk - financial operation',
      call: {
        id: 'test-4',
        serviceId: 'payment-service',
        toolName: 'payment.charge',
        params: { amount: 100 },
        riskLevel: 'low' as const,
      },
      expectedLevel: 'high',
      expectedConfirmation: true,
    },
  ];

  for (const test of riskTests) {
    console.log(`Test: ${test.name}`);
    const assessment = classifier.assess(test.call);
    console.log(`  Risk Level: ${assessment.level}`);
    console.log(`  Requires Confirmation: ${assessment.requiresConfirmation}`);
    console.log(`  Reasons: ${assessment.reasons.join(', ') || 'none'}`);

    const levelMatch = assessment.level === test.expectedLevel;
    const confirmMatch = assessment.requiresConfirmation === test.expectedConfirmation;

    if (levelMatch && confirmMatch) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED');
      if (!levelMatch) console.log(`    Expected level: ${test.expectedLevel}, got: ${assessment.level}`);
      if (!confirmMatch) console.log(`    Expected confirmation: ${test.expectedConfirmation}, got: ${assessment.requiresConfirmation}`);
      failed++;
    }
    console.log();
  }

  // Test 2: Input Sanitizer
  console.log('='.repeat(70));
  console.log('TEST 2: INPUT SANITIZER');
  console.log('='.repeat(70));
  console.log();

  const sanitizer = new InputSanitizer();

  const sanitizerTests = [
    {
      name: 'Clean input - no changes',
      input: { date: '2026-01-25', note: 'Hello world' },
      expectBlocked: false,
      expectWarnings: false,
    },
    {
      name: 'HTML injection - should be removed',
      input: { note: '<script>alert("xss")</script>Hello' },
      expectBlocked: false,
      expectWarnings: true,
    },
    {
      name: 'SQL injection - should be blocked',
      input: { query: "SELECT * FROM users WHERE id = '1' OR '1'='1'" },
      expectBlocked: true,
      expectWarnings: false,
    },
    {
      name: 'Path traversal - should be blocked',
      input: { path: '../../../etc/passwd' },
      expectBlocked: true,
      expectWarnings: false,
    },
    {
      name: 'Command injection - should be blocked',
      input: { cmd: 'ls; rm -rf /' },
      expectBlocked: true,
      expectWarnings: false,
    },
    {
      name: 'Long string - should be truncated',
      input: { text: 'a'.repeat(15000) },
      expectBlocked: false,
      expectWarnings: true,
    },
  ];

  for (const test of sanitizerTests) {
    console.log(`Test: ${test.name}`);
    const result = sanitizer.sanitize(test.input);
    console.log(`  Blocked: ${result.blocked.length > 0}`);
    console.log(`  Warnings: ${result.warnings.length}`);
    if (result.blocked.length > 0) {
      console.log(`  Blocked params: ${result.blocked.map((b) => `${b.param}: ${b.issue}`).join(', ')}`);
    }
    if (result.warnings.length > 0) {
      console.log(`  Warning params: ${result.warnings.map((w) => `${w.param}: ${w.issue}`).join(', ')}`);
    }

    const blockedMatch = (result.blocked.length > 0) === test.expectBlocked;
    const warningsMatch = (result.warnings.length > 0) === test.expectWarnings;

    if (blockedMatch && warningsMatch) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED');
      if (!blockedMatch) console.log(`    Expected blocked: ${test.expectBlocked}`);
      if (!warningsMatch) console.log(`    Expected warnings: ${test.expectWarnings}`);
      failed++;
    }
    console.log();
  }

  // Test 3: Confirmation Gate
  console.log('='.repeat(70));
  console.log('TEST 3: CONFIRMATION GATE');
  console.log('='.repeat(70));
  console.log();

  const gate = new ConfirmationGate();

  console.log('Test: Create confirmation request');
  const testCall: ToolCall = {
    id: 'test-call-1',
    serviceId: 'habit-tracker',
    toolName: 'habit.delete',
    params: { date: '2026-01-25' },
    riskLevel: 'high',
  };
  const testAssessment = classifier.assess(testCall);
  const request = gate.createRequest('test-plan-1', testCall, testAssessment);

  console.log(`  Request ID: ${request.id}`);
  console.log(`  Status: ${request.status}`);
  console.log(`  Expires at: ${new Date(request.expiresAt).toISOString()}`);

  if (request.status === 'pending') {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  console.log('Test: Respond to confirmation');
  const response = gate.respond(request.id, true, 'User approved');
  console.log(`  Confirmed: ${response.confirmed}`);
  console.log(`  Reason: ${response.reason}`);

  if (response.confirmed) {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  console.log('Test: Confirmation history');
  const history = gate.getHistory();
  console.log(`  History entries: ${history.length}`);

  if (history.length > 0 && history[0].status === 'confirmed') {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  // Test 4: Audit Logger
  console.log('='.repeat(70));
  console.log('TEST 4: AUDIT LOGGER');
  console.log('='.repeat(70));
  console.log();

  const auditLogger = new AuditLogger();

  console.log('Test: Log tool invocation');
  const invocationId = auditLogger.logToolInvocation(testAuth, testCall, undefined, testAssessment);
  console.log(`  Audit ID: ${invocationId}`);

  if (invocationId.startsWith('audit_')) {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  console.log('Test: Log tool completion');
  const completionId = auditLogger.logToolCompletion(testAuth, {
    id: testCall.id,
    serviceId: testCall.serviceId,
    toolName: testCall.toolName,
    success: true,
    result: { message: 'Deleted' },
    durationMs: 150,
  });
  console.log(`  Audit ID: ${completionId}`);

  if (completionId.startsWith('audit_')) {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  console.log('Test: Log security warning');
  const warningId = auditLogger.logSecurityWarning(testAuth, 'Suspicious activity detected', {
    source: 'test',
  });
  console.log(`  Audit ID: ${warningId}`);

  if (warningId.startsWith('audit_')) {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  console.log('Test: Query audit log');
  const entries = auditLogger.query({ userId: testAuth.userId, limit: 10 });
  console.log(`  Entries found: ${entries.length}`);

  if (entries.length >= 3) {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  console.log('Test: Audit statistics');
  const stats = auditLogger.getStats();
  console.log(`  Total entries: ${stats.totalEntries}`);
  console.log(`  Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`  Security events: ${stats.securityEvents}`);

  if (stats.totalEntries >= 3 && stats.securityEvents >= 1) {
    console.log('  ✓ PASSED');
    passed++;
  } else {
    console.log('  ✗ FAILED');
    failed++;
  }
  console.log();

  // Test 5: Sensitive data redaction
  console.log('='.repeat(70));
  console.log('TEST 5: SENSITIVE DATA REDACTION');
  console.log('='.repeat(70));
  console.log();

  console.log('Test: Password redaction in audit log');
  const sensitiveCall: ToolCall = {
    id: 'test-sensitive',
    serviceId: 'auth-service',
    toolName: 'auth.login',
    params: { username: 'testuser', password: 'secret123', apiKey: 'key123' },
    riskLevel: 'medium',
  };

  auditLogger.logToolInvocation(testAuth, sensitiveCall);
  const sensitiveEntries = auditLogger.query({ userId: testAuth.userId, limit: 1 });

  if (sensitiveEntries.length > 0) {
    const details = sensitiveEntries[0].details as Record<string, unknown>;
    const params = details?.params as Record<string, unknown>;
    console.log(`  Username: ${params?.username}`);
    console.log(`  Password: ${params?.password}`);
    console.log(`  API Key: ${params?.apiKey}`);

    if (params?.password === '[REDACTED]' && params?.apiKey === '[REDACTED]') {
      console.log('  ✓ PASSED (sensitive data redacted)');
      passed++;
    } else {
      console.log('  ✗ FAILED (sensitive data not redacted)');
      failed++;
    }
  } else {
    console.log('  ✗ FAILED (no entries found)');
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
