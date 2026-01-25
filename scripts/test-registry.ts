#!/usr/bin/env npx ts-node
/**
 * Test script for the enhanced registry system
 *
 * Usage:
 *   npx ts-node scripts/test-registry.ts
 */

import {
  EnhancedServiceRegistry,
  CapabilityIndex,
  ManifestCache,
  type ServiceDefinition,
  type RegistryYAML,
} from '../packages/yukie-core/src/registry';

// ============================================================================
// Test Configuration
// ============================================================================

const testYAMLConfig: RegistryYAML = {
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
      auth: {
        method: 'bearer-token',
        requiredScopes: ['habit:read', 'habit:write'],
      },
      endpoints: {
        health: '/api/health',
        meta: '/api/v1/meta',
        actions: '/api/v1/actions',
        invoke: '/api/v1/invoke',
      },
      capabilities: ['habit check-in', 'habit tracking', 'streak calculation', 'monthly statistics'],
      tags: ['habit', 'tracking', 'personal', 'health'],
      keywords: ['habit', 'streak', 'check-in', 'wake up', 'exercise', 'meditation'],
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
      auth: {
        method: 'bearer-token',
        requiredScopes: ['calendar:read', 'calendar:write'],
      },
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
      auth: {
        method: 'bearer-token',
        requiredScopes: ['note:read', 'note:write'],
      },
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
      enabled: false, // Disabled for testing
      priority: 80,
    },
  ],
};

// ============================================================================
// Test Runner
// ============================================================================

function runTests(): void {
  console.log('='.repeat(70));
  console.log('ENHANCED REGISTRY TESTS');
  console.log('='.repeat(70));
  console.log();

  let passed = 0;
  let failed = 0;

  // Test 1: Load from YAML config
  console.log('Test 1: Load from YAML config');
  try {
    const registry = new EnhancedServiceRegistry();
    registry.loadFromYAML(testYAMLConfig);

    const all = registry.getAll();
    const enabled = registry.getEnabled();

    console.log(`  Total services: ${all.length}`);
    console.log(`  Enabled services: ${enabled.length}`);

    if (all.length === 3 && enabled.length === 2) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED: Unexpected service count');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 2: Get service by ID
  console.log('Test 2: Get service by ID');
  try {
    const registry = new EnhancedServiceRegistry();
    registry.loadFromYAML(testYAMLConfig);

    const service = registry.get('habit-tracker');
    if (service && service.name === 'Habit Tracker') {
      console.log(`  Found: ${service.name}`);
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED: Service not found or wrong name');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 3: Query by keywords
  console.log('Test 3: Query by keywords');
  try {
    const registry = new EnhancedServiceRegistry();
    registry.loadFromYAML(testYAMLConfig);

    const result = registry.query({ keywords: ['habit', 'streak'] });
    console.log(`  Query time: ${result.queryTime}ms`);
    console.log(`  Matches: ${result.matches.length}`);
    console.log(`  Services found: ${result.services.map((s) => s.id).join(', ')}`);

    if (result.services.some((s) => s.id === 'habit-tracker')) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED: Expected habit-tracker in results');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 4: Query by tags
  console.log('Test 4: Query by tags');
  try {
    const registry = new EnhancedServiceRegistry();
    registry.loadFromYAML(testYAMLConfig);

    const result = registry.query({ tags: ['calendar', 'events'] });
    console.log(`  Services found: ${result.services.map((s) => s.id).join(', ')}`);

    if (result.services.some((s) => s.id === 'calendar-service')) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED: Expected calendar-service in results');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 5: Find by user message
  console.log('Test 5: Find by user message');
  try {
    const registry = new EnhancedServiceRegistry();
    registry.loadFromYAML(testYAMLConfig);

    const result = registry.findByUserMessage('I woke up early today and want to log my habit');
    console.log(`  Query: "I woke up early today and want to log my habit"`);
    console.log(`  Services found: ${result.services.map((s) => s.id).join(', ')}`);

    if (result.services.length > 0 && result.services[0].id === 'habit-tracker') {
      console.log('  ✓ PASSED (habit-tracker is top result)');
      passed++;
    } else {
      console.log('  ✗ FAILED: Expected habit-tracker as top result');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 6: Capability Index
  console.log('Test 6: Capability Index');
  try {
    const index = new CapabilityIndex();

    for (const service of testYAMLConfig.services) {
      index.addService(service);
    }

    const stats = index.getStats();
    console.log(`  Keywords indexed: ${stats.keywordCount}`);
    console.log(`  Tags indexed: ${stats.tagCount}`);
    console.log(`  Capabilities indexed: ${stats.capabilityCount}`);
    console.log(`  Services indexed: ${stats.serviceCount}`);

    // Search test
    const matches = index.search('wake up habit streak');
    console.log(`  Search "wake up habit streak": ${matches.map((m) => m.serviceId).join(', ')}`);

    if (matches.length > 0 && matches[0].serviceId === 'habit-tracker') {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED: Expected habit-tracker as top match');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 7: Manifest Cache
  console.log('Test 7: Manifest Cache');
  try {
    const cache = new ManifestCache(60); // 60 second TTL

    const manifest = cache.setFromActions(
      'habit-tracker',
      'Habit Tracker',
      {
        actions: [
          {
            name: 'habit.checkin',
            description: 'Record a habit check-in',
            parameters: [
              { name: 'date', type: 'string', required: true, description: 'Date in YYYY-MM-DD format' },
              { name: 'checked', type: 'boolean', required: false, description: 'Whether checked in' },
            ],
            requiredScopes: ['habit:write'],
          },
          {
            name: 'habit.query',
            description: 'Query habit records',
            parameters: [
              { name: 'from', type: 'string', required: false, description: 'Start date' },
              { name: 'to', type: 'string', required: false, description: 'End date' },
            ],
            requiredScopes: ['habit:read'],
          },
        ],
      }
    );

    console.log(`  Cached manifest with ${manifest.tools.length} tools`);

    const cached = cache.get('habit-tracker');
    if (cached && cached.tools.length === 2) {
      console.log(`  Retrieved: ${cached.tools.map((t) => t.name).join(', ')}`);
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED: Cache miss or wrong tool count');
      failed++;
    }

    // Test cache stats
    const stats = cache.getStats();
    console.log(`  Cache stats: ${stats.validCached} valid, ${stats.totalTools} total tools`);
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 8: Registry Statistics
  console.log('Test 8: Registry Statistics');
  try {
    const registry = new EnhancedServiceRegistry();
    registry.loadFromYAML(testYAMLConfig);

    const stats = registry.getStats();
    console.log(`  Total services: ${stats.totalServices}`);
    console.log(`  Enabled services: ${stats.enabledServices}`);
    console.log(`  Indexed keywords: ${stats.indexedKeywords}`);
    console.log(`  Indexed tags: ${stats.indexedTags}`);
    console.log(`  Indexed capabilities: ${stats.indexedCapabilities}`);

    if (stats.totalServices === 3 && stats.enabledServices === 2) {
      console.log('  ✓ PASSED');
      passed++;
    } else {
      console.log('  ✗ FAILED: Unexpected stats');
      failed++;
    }
  } catch (error) {
    console.log(`  ✗ ERROR: ${error}`);
    failed++;
  }
  console.log();

  // Test 9: Enabled-only filter
  console.log('Test 9: Enabled-only filter');
  try {
    const registry = new EnhancedServiceRegistry();
    registry.loadFromYAML(testYAMLConfig);

    // Query should exclude disabled service by default
    const result = registry.query({ keywords: ['note', 'document'] });
    console.log(`  Query for notes/document: ${result.services.map((s) => s.id).join(', ') || 'none'}`);

    // note-service is disabled, so it shouldn't appear
    if (!result.services.some((s) => s.id === 'note-service')) {
      console.log('  ✓ PASSED (disabled service excluded)');
      passed++;
    } else {
      console.log('  ✗ FAILED: Disabled service should be excluded');
      failed++;
    }
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
runTests();
