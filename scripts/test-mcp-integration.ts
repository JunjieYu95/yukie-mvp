/**
 * MCP Integration Test Script
 *
 * Tests the MCP protocol integration between Yukie core and the habit tracker service.
 *
 * Usage:
 *   1. Start the habit tracker service: cd ../early-wakeup-habit && npm run dev
 *   2. Run this test: npx tsx scripts/test-mcp-integration.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') });

// ============================================================================
// Test Configuration
// ============================================================================

const HABIT_TRACKER_URL = process.env.HABIT_TRACKER_URL || 'http://localhost:3001';
const MCP_ENDPOINT = `${HABIT_TRACKER_URL}/api/mcp`;

// ============================================================================
// MCP Request Helper
// ============================================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

async function mcpRequest(method: string, params: Record<string, unknown> = {}): Promise<MCPResponse> {
  const request: MCPRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Yukie-User-Id': 'test-user',
      'X-Yukie-Scopes': 'habit:read,habit:write,habit:delete,admin',
    },
    body: JSON.stringify(request),
  });

  return response.json();
}

// ============================================================================
// Test Helpers
// ============================================================================

function logTest(name: string, passed: boolean, details?: string): void {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

function logSection(name: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(name);
  console.log('='.repeat(60));
}

// ============================================================================
// Tests
// ============================================================================

async function testServerInfo(): Promise<boolean> {
  logSection('Test: Server Info (GET)');

  try {
    const response = await fetch(MCP_ENDPOINT, { method: 'GET' });
    const data = await response.json();

    console.log('Server Info:', JSON.stringify(data, null, 2));

    const passed =
      data.protocol === 'mcp' &&
      data.name === 'habit-tracker' &&
      Array.isArray(data.tools);

    logTest('Server info response', passed);
    return passed;
  } catch (error) {
    logTest('Server info response', false, `Error: ${error}`);
    return false;
  }
}

async function testInitialize(): Promise<boolean> {
  logSection('Test: Initialize');

  try {
    const response = await mcpRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });

    console.log('Initialize Response:', JSON.stringify(response, null, 2));

    const passed =
      !response.error &&
      response.result &&
      (response.result as { protocolVersion: string }).protocolVersion === '2024-11-05';

    logTest('Initialize handshake', passed);
    return passed;
  } catch (error) {
    logTest('Initialize handshake', false, `Error: ${error}`);
    return false;
  }
}

async function testToolsList(): Promise<boolean> {
  logSection('Test: Tools List');

  try {
    const response = await mcpRequest('tools/list');

    console.log('Tools List Response:', JSON.stringify(response, null, 2));

    const tools = (response.result as { tools: Array<{ name: string }> })?.tools || [];
    const expectedTools = ['habit.checkin', 'habit.query', 'habit.stats', 'habit.delete'];
    const hasAllTools = expectedTools.every((t) => tools.some((tool) => tool.name === t));

    logTest('Tools list contains expected tools', hasAllTools, `Found: ${tools.map((t) => t.name).join(', ')}`);
    return hasAllTools;
  } catch (error) {
    logTest('Tools list', false, `Error: ${error}`);
    return false;
  }
}

async function testToolsCallQuery(): Promise<boolean> {
  logSection('Test: Tools Call - habit.query');

  try {
    const response = await mcpRequest('tools/call', {
      name: 'habit.query',
      arguments: {},
    });

    console.log('Query Response:', JSON.stringify(response, null, 2));

    const passed = !response.error && response.result;
    logTest('Query tool invocation', passed);
    return passed;
  } catch (error) {
    logTest('Query tool invocation', false, `Error: ${error}`);
    return false;
  }
}

async function testToolsCallStats(): Promise<boolean> {
  logSection('Test: Tools Call - habit.stats');

  try {
    const response = await mcpRequest('tools/call', {
      name: 'habit.stats',
      arguments: { includeStreak: true },
    });

    console.log('Stats Response:', JSON.stringify(response, null, 2));

    const passed = !response.error && response.result;
    logTest('Stats tool invocation', passed);
    return passed;
  } catch (error) {
    logTest('Stats tool invocation', false, `Error: ${error}`);
    return false;
  }
}

async function testToolsCallCheckin(): Promise<boolean> {
  logSection('Test: Tools Call - habit.checkin');

  const testDate = new Date().toISOString().split('T')[0];

  try {
    const response = await mcpRequest('tools/call', {
      name: 'habit.checkin',
      arguments: {
        date: testDate,
        checked: true,
        note: 'MCP integration test',
      },
    });

    console.log('Checkin Response:', JSON.stringify(response, null, 2));

    const passed = !response.error && response.result;
    logTest('Checkin tool invocation', passed);
    return passed;
  } catch (error) {
    logTest('Checkin tool invocation', false, `Error: ${error}`);
    return false;
  }
}

async function testPing(): Promise<boolean> {
  logSection('Test: Ping');

  try {
    const response = await mcpRequest('ping');

    console.log('Ping Response:', JSON.stringify(response, null, 2));

    const passed = !response.error && (response.result as { pong: boolean })?.pong === true;
    logTest('Ping/pong', passed);
    return passed;
  } catch (error) {
    logTest('Ping/pong', false, `Error: ${error}`);
    return false;
  }
}

async function testInvalidMethod(): Promise<boolean> {
  logSection('Test: Invalid Method');

  try {
    const response = await mcpRequest('invalid/method');

    console.log('Invalid Method Response:', JSON.stringify(response, null, 2));

    const passed = response.error && response.error.code === -32601;
    logTest('Invalid method returns error', passed);
    return passed;
  } catch (error) {
    logTest('Invalid method returns error', false, `Error: ${error}`);
    return false;
  }
}

async function testInvalidTool(): Promise<boolean> {
  logSection('Test: Invalid Tool');

  try {
    const response = await mcpRequest('tools/call', {
      name: 'invalid.tool',
      arguments: {},
    });

    console.log('Invalid Tool Response:', JSON.stringify(response, null, 2));

    const passed = response.error && response.error.code === -32003;
    logTest('Invalid tool returns error', passed);
    return passed;
  } catch (error) {
    logTest('Invalid tool returns error', false, `Error: ${error}`);
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('\n🚀 MCP Integration Test Suite');
  console.log(`   Target: ${MCP_ENDPOINT}`);
  console.log(`   Date: ${new Date().toISOString()}`);

  const results: boolean[] = [];

  // Run tests
  results.push(await testServerInfo());
  results.push(await testInitialize());
  results.push(await testPing());
  results.push(await testToolsList());
  results.push(await testToolsCallQuery());
  results.push(await testToolsCallStats());
  results.push(await testToolsCallCheckin());
  results.push(await testInvalidMethod());
  results.push(await testInvalidTool());

  // Summary
  logSection('Test Summary');
  const passed = results.filter((r) => r).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log(`\nResults: ${passed}/${total} tests passed`);

  if (allPassed) {
    console.log('\n✅ All tests passed! MCP integration is working correctly.');
  } else {
    console.log('\n❌ Some tests failed. Please check the output above for details.');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
