#!/usr/bin/env tsx
/**
 * Test script for diary.processMessage parameter extraction
 *
 * This script verifies that the selectToolParameters function
 * correctly passes the user message to diary.processMessage
 */

import { selectToolParameters } from '../packages/yukie-core/src/mcp-router.js';
import type { MCPTool } from '../packages/shared/protocol/src/types.js';

// Mock tool definition for diary.processMessage
const diaryProcessMessageTool: MCPTool = {
  name: 'diary.processMessage',
  description: 'Process natural language message with two-tier routing',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The natural language message from the user',
      },
      autoExecute: {
        type: 'boolean',
        description: 'If true, automatically execute the log action when pattern extraction succeeds',
        default: true,
      },
    },
    required: ['message'],
  },
};

async function testDiaryProcessMessage() {
  console.log('🧪 Testing diary.processMessage parameter extraction...\n');

  const testCases = [
    {
      name: 'Simple log message',
      input: 'Log diary: test code development',
      expectedMessage: 'Log diary: test code development',
    },
    {
      name: 'Log with time',
      input: 'log coding from 2pm to 4pm',
      expectedMessage: 'log coding from 2pm to 4pm',
    },
    {
      name: 'Complex activity',
      input: 'track meeting with team for 2 hours',
      expectedMessage: 'track meeting with team for 2 hours',
    },
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    console.log(`📝 Test: ${testCase.name}`);
    console.log(`   Input: "${testCase.input}"`);

    try {
      const result = await selectToolParameters(
        testCase.input,
        diaryProcessMessageTool,
        'claude-3-5-haiku-20241022' // Use a model
      );

      if (!result) {
        console.log(`   ❌ FAILED: selectToolParameters returned null`);
        failedTests++;
        console.log('');
        continue;
      }

      // Check tool name
      if (result.toolName !== 'diary.processMessage') {
        console.log(`   ❌ FAILED: Expected toolName 'diary.processMessage', got '${result.toolName}'`);
        failedTests++;
        console.log('');
        continue;
      }

      // Check message parameter
      if (!result.args.message) {
        console.log(`   ❌ FAILED: message parameter is missing or empty`);
        console.log(`   Received args:`, JSON.stringify(result.args, null, 2));
        failedTests++;
        console.log('');
        continue;
      }

      if (result.args.message !== testCase.expectedMessage) {
        console.log(`   ❌ FAILED: message parameter mismatch`);
        console.log(`   Expected: "${testCase.expectedMessage}"`);
        console.log(`   Received: "${result.args.message}"`);
        failedTests++;
        console.log('');
        continue;
      }

      // Check autoExecute parameter
      if (result.args.autoExecute !== true) {
        console.log(`   ⚠️  WARNING: autoExecute is not true (got: ${result.args.autoExecute})`);
      }

      console.log(`   ✅ PASSED`);
      console.log(`   Message: "${result.args.message}"`);
      console.log(`   AutoExecute: ${result.args.autoExecute}`);
      passedTests++;
    } catch (error) {
      console.log(`   ❌ FAILED: Unexpected error`);
      console.log(`   Error:`, error instanceof Error ? error.message : String(error));
      failedTests++;
    }

    console.log('');
  }

  // Summary
  console.log('═'.repeat(60));
  console.log(`📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passedTests}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failedTests}/${testCases.length}`);
  console.log('═'.repeat(60));

  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! The fix is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check the implementation.\n');
    process.exit(1);
  }
}

// Run the test
testDiaryProcessMessage().catch((error) => {
  console.error('❌ Test suite failed with error:', error);
  process.exit(1);
});
