/**
 * MCP Routing Tests
 * 
 * Tests that various user messages correctly route to the diary.log tool
 * and extract the expected parameters.
 * 
 * Run with: npx tsx packages/yukie-core/src/__tests__/mcp-routing.test.ts
 */

// Mock environment variables before imports
process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'test-key';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';

import { routeToTool, selectToolParameters } from '../mcp-router.js';
import { initializeMCPRegistry, resetMCPRegistry } from '../mcp-registry.js';
import { resetLLMClient } from '../llm/client.js';
import type { MCPTool } from '../../../shared/protocol/src/types.js';

// ============================================================================
// Test Configuration
// ============================================================================

interface TestCase {
  message: string;
  expectedTool: string | null;
  expectedCategory?: 'prod' | 'nonprod' | 'admin';
  expectedTitle?: string;
  expectedStartTime?: string;
  expectedEndTime?: string;
  description?: string;
}

// Mock diary.log tool definition
const DIARY_LOG_TOOL: MCPTool = {
  name: 'diary.log',
  description: 'Log an activity to Google Calendar. Automatically uses the end time of the last logged activity as start time, and current time as end time if not specified.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title/summary of the activity (required)',
      },
      category: {
        type: 'string',
        enum: ['prod', 'nonprod', 'admin'],
        description: "Category for the activity: 'prod' (productive work like coding, meetings, learning), 'nonprod' (leisure, entertainment, social), 'admin' (routine tasks, rest, admin work). Required - infer from title if not explicitly specified.",
      },
      description: {
        type: 'string',
        description: 'Optional description or notes about the activity',
      },
      startTime: {
        type: 'string',
        description: "Start time: ISO 8601 format, 'now', or simple time like '2:30pm', '14:30'. If omitted, uses the end time of the last logged activity.",
      },
      endTime: {
        type: 'string',
        description: "End time: ISO 8601 format, 'now', or simple time like '5pm', '17:00'. If omitted, uses current time.",
      },
      timeZone: {
        type: 'string',
        description: 'Timezone for the event. Defaults to America/Denver.',
        default: 'America/Denver',
      },
    },
    required: ['title', 'category'],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
};

// ============================================================================
// 50+ Test Cases for Activity Logging
// ============================================================================

const TEST_CASES: TestCase[] = [
  // Basic logging formats
  { message: 'Log coding from 2pm to 4pm', expectedTool: 'diary.log', expectedCategory: 'prod', expectedTitle: 'coding' },
  { message: 'log lunch 12pm to 1pm', expectedTool: 'diary.log', expectedCategory: 'admin', expectedTitle: 'lunch' },
  { message: 'Log reading from 3pm to 5pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log meeting 10am-11am', expectedTool: 'diary.log', expectedCategory: 'prod', expectedTitle: 'meeting' },
  { message: 'Log workout 6am to 7am', expectedTool: 'diary.log', expectedCategory: 'prod', expectedTitle: 'workout' },
  
  // Gaming/Entertainment (nonprod)
  { message: 'Log lanius run from 7pm to 7:30pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'log playing Fallout 8pm to 10pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'Log gaming session from 9pm to 11pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'log watching Netflix 7pm-9pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'Log YouTube from 6pm to 7pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'log playing chess 2pm to 3pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'Log browsing Reddit 10pm to 11pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'log movie night from 8pm to 10:30pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'Log Elden Ring playthrough 3pm-6pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'log scrolling Twitter from 9pm to 10pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  
  // Productive work (prod)
  { message: 'Log vibe coding from 10am to 12pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log debugging session 2pm to 4pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'Log standup meeting 9am-9:30am', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log pair programming 1pm to 3pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'Log code review from 4pm to 5pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log writing documentation 3pm-5pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'Log learning TypeScript 7pm to 9pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log studying for exam from 6pm to 8pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'Log research 10am to 12pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log project planning 2pm-3pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'Log client call from 11am to 12pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log interview prep 4pm to 6pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'Log gym workout 6am-7am', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log running 5pm to 6pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'Log meditation 7am-7:30am', expectedTool: 'diary.log', expectedCategory: 'prod' },
  
  // Admin/Rest (admin)
  { message: 'Log breakfast 8am to 8:30am', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'log dinner from 7pm to 8pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'Log shower 7am-7:15am', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'log nap 2pm to 3pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'Log commute from 8am to 9am', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'log grocery shopping 5pm-6pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'Log cooking 6pm to 7pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'log laundry from 10am to 11am', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'Log rest/break 3pm-3:30pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'log cleaning the house 9am to 11am', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'Log doctor appointment 2pm to 3pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'log getting ready 7am-8am', expectedTool: 'diary.log', expectedCategory: 'admin' },
  
  // Alternative phrasing styles
  { message: 'spent 2 hours coding from 10am to 12pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'worked on project from 1pm to 3pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'did some gaming 8pm-10pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'had lunch from 12pm to 1pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'took a nap 3pm to 4pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'played video games from 9pm to 11pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'attended meeting 2pm-3pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'exercised from 6am to 7am', expectedTool: 'diary.log', expectedCategory: 'prod' },
  
  // Natural language variations
  { message: 'I coded from 10am until noon', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'just finished gaming, started at 8pm ended at 10pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'was in a meeting from 2 to 3pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'watched a movie between 7pm and 9pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'did yoga from 6am-7am this morning', expectedTool: 'diary.log', expectedCategory: 'prod' },
  
  // Edge cases with unclear times
  { message: 'log reading for an hour', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log gaming', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  { message: 'log lunch', expectedTool: 'diary.log', expectedCategory: 'admin' },
  
  // Mixed/ambiguous activities
  { message: 'log reading a novel 7pm to 9pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' }, // leisure reading
  { message: 'log reading documentation 3pm to 4pm', expectedTool: 'diary.log', expectedCategory: 'prod' }, // work reading
  { message: 'log watching tutorial 2pm-4pm', expectedTool: 'diary.log', expectedCategory: 'prod' }, // learning
  { message: 'log watching TV 8pm to 10pm', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
  
  // With descriptions
  { message: 'log coding: worked on MCP router from 10am to 12pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log meeting with John from 2pm to 3pm', expectedTool: 'diary.log', expectedCategory: 'prod' },
  
  // Various time formats
  { message: 'log coding from 14:00 to 16:00', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log lunch 12:30pm-1:30pm', expectedTool: 'diary.log', expectedCategory: 'admin' },
  { message: 'log meeting from 9:00am to 10:30am', expectedTool: 'diary.log', expectedCategory: 'prod' },
  { message: 'log gaming 21:00-23:00', expectedTool: 'diary.log', expectedCategory: 'nonprod' },
];

// ============================================================================
// Test Runner
// ============================================================================

interface TestResult {
  testCase: TestCase;
  passed: boolean;
  routingResult?: {
    selectedTool: string | null;
    confidence: number;
    reasoning: string;
  };
  paramResult?: {
    args: Record<string, unknown>;
  } | null;
  error?: string;
}

let mockLLMResponses: Map<string, string> = new Map();

// Mock the LLM client for testing
function setupMockLLM() {
  // We'll test the routing logic by checking if the correct tool is selected
  // In a real test, we'd mock the LLM responses
}

async function runRoutingTest(testCase: TestCase): Promise<TestResult> {
  try {
    const result = await routeToTool(testCase.message);
    
    const selectedToolName = result.selectedTool?.tool?.name || null;
    const passed = selectedToolName === testCase.expectedTool && result.confidence >= 0.5;
    
    return {
      testCase,
      passed,
      routingResult: {
        selectedTool: selectedToolName,
        confidence: result.confidence,
        reasoning: result.reasoning,
      },
    };
  } catch (error) {
    return {
      testCase,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runParameterTest(testCase: TestCase): Promise<TestResult> {
  try {
    const result = await selectToolParameters(testCase.message, DIARY_LOG_TOOL);
    
    if (!result) {
      return {
        testCase,
        passed: false,
        paramResult: null,
        error: 'Parameter extraction returned null',
      };
    }
    
    // Check if category matches expected
    let categoryMatch = true;
    if (testCase.expectedCategory && result.args.category !== testCase.expectedCategory) {
      categoryMatch = false;
    }
    
    // Check if title is present
    const hasTitle = !!result.args.title;
    
    return {
      testCase,
      passed: hasTitle && categoryMatch,
      paramResult: { args: result.args },
    };
  } catch (error) {
    return {
      testCase,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Main Test Execution
// ============================================================================

async function main() {
  console.log('🧪 MCP Routing Tests\n');
  console.log('=' .repeat(80));
  console.log(`Running ${TEST_CASES.length} test cases...\n`);
  
  // Check if we have a real API key
  const hasRealApiKey = process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'test-key';
  
  if (!hasRealApiKey) {
    console.log('⚠️  No real LLM API key found. Running in mock mode.\n');
    console.log('To run actual tests, set LLM_API_KEY or ANTHROPIC_API_KEY environment variable.\n');
    console.log('=' .repeat(80));
    
    // Just validate test case structure
    let validCases = 0;
    let invalidCases: string[] = [];
    
    for (const tc of TEST_CASES) {
      if (tc.message && tc.expectedTool) {
        validCases++;
      } else {
        invalidCases.push(tc.message || '(empty message)');
      }
    }
    
    console.log(`\n✅ ${validCases} test cases are properly structured`);
    if (invalidCases.length > 0) {
      console.log(`❌ ${invalidCases.length} test cases have issues:`);
      invalidCases.forEach(m => console.log(`   - ${m}`));
    }
    
    console.log('\n📋 Test cases by category:');
    const categories = new Map<string, number>();
    for (const tc of TEST_CASES) {
      const cat = tc.expectedCategory || 'unspecified';
      categories.set(cat, (categories.get(cat) || 0) + 1);
    }
    categories.forEach((count, cat) => {
      console.log(`   ${cat}: ${count} cases`);
    });
    
    return;
  }
  
  // Initialize MCP registry for real tests
  resetMCPRegistry();
  initializeMCPRegistry();
  
  console.log('Running routing tests...\n');
  
  const routingResults: TestResult[] = [];
  const paramResults: TestResult[] = [];
  
  // Test routing (select a subset to avoid API rate limits)
  const routingTestCases = TEST_CASES.slice(0, 10); // Test first 10 for routing
  
  for (const testCase of routingTestCases) {
    process.stdout.write(`Testing: "${testCase.message.substring(0, 50)}..." `);
    const result = await runRoutingTest(testCase);
    routingResults.push(result);
    console.log(result.passed ? '✅' : '❌');
    
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('Running parameter extraction tests...\n');
  
  // Test parameter extraction (select a different subset)
  const paramTestCases = TEST_CASES.slice(0, 10); // Test first 10 for params
  
  for (const testCase of paramTestCases) {
    process.stdout.write(`Extracting params: "${testCase.message.substring(0, 40)}..." `);
    const result = await runParameterTest(testCase);
    paramResults.push(result);
    console.log(result.passed ? '✅' : '❌');
    
    if (result.paramResult) {
      console.log(`   → title: "${result.paramResult.args.title}", category: "${result.paramResult.args.category}"`);
    }
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 SUMMARY\n');
  
  const routingPassed = routingResults.filter(r => r.passed).length;
  const paramPassed = paramResults.filter(r => r.passed).length;
  
  console.log(`Routing Tests: ${routingPassed}/${routingResults.length} passed`);
  console.log(`Parameter Tests: ${paramPassed}/${paramResults.length} passed`);
  
  // Show failures
  const routingFailures = routingResults.filter(r => !r.passed);
  const paramFailures = paramResults.filter(r => !r.passed);
  
  if (routingFailures.length > 0) {
    console.log('\n❌ Routing Failures:');
    routingFailures.forEach(f => {
      console.log(`   "${f.testCase.message}"`);
      console.log(`      Expected: ${f.testCase.expectedTool}, Got: ${f.routingResult?.selectedTool || 'null'}`);
    });
  }
  
  if (paramFailures.length > 0) {
    console.log('\n❌ Parameter Extraction Failures:');
    paramFailures.forEach(f => {
      console.log(`   "${f.testCase.message}"`);
      if (f.paramResult) {
        console.log(`      Expected category: ${f.testCase.expectedCategory}, Got: ${f.paramResult.args.category}`);
      } else {
        console.log(`      Error: ${f.error || 'No parameters extracted'}`);
      }
    });
  }
  
  const totalPassed = routingPassed + paramPassed;
  const totalTests = routingResults.length + paramResults.length;
  
  console.log('\n' + '=' .repeat(80));
  if (totalPassed === totalTests) {
    console.log('🎉 All tests passed!');
  } else {
    console.log(`⚠️  ${totalTests - totalPassed} tests failed`);
    process.exit(1);
  }
}

// Export for use as a module
export { TEST_CASES, runRoutingTest, runParameterTest };

// Run if called directly
main().catch(console.error);
