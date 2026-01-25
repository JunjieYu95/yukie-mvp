/**
 * Enhanced Registry Types
 *
 * Type definitions for the enhanced tool registry with caching,
 * capability indexing, and YAML configuration support.
 */

import type { YWAIPAction, YWAIPServiceMeta } from '../../../shared/protocol/src/types';

// ============================================================================
// Service Definition Types (from YAML config)
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high';
export type TransportType = 'http' | 'stdio' | 'websocket';
export type AuthMethod = 'bearer-token' | 'api-key' | 'oauth2' | 'none';

export interface ServiceEndpoints {
  health: string;
  meta: string;
  actions: string;
  invoke: string;
}

export interface ServiceAuth {
  method: AuthMethod;
  requiredScopes?: string[];
  apiKeyHeader?: string;
  oauth2Config?: {
    tokenUrl: string;
    scopes: string[];
  };
}

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  transport: TransportType;
  auth: ServiceAuth;
  endpoints: ServiceEndpoints;
  capabilities: string[];
  tags: string[];
  keywords: string[];
  riskLevel: RiskLevel;
  documentationUrl?: string | null;
  ownerNotes?: string;
  enabled: boolean;
  priority: number;
}

// ============================================================================
// Registry Configuration Types
// ============================================================================

export interface RegistryConfig {
  manifestCacheTTL: number;       // seconds
  healthCheckInterval: number;    // seconds
  defaultTimeout: number;         // milliseconds
  maxRoutingCandidates: number;
}

export interface RegistryYAML {
  config: RegistryConfig;
  services: ServiceDefinition[];
}

// ============================================================================
// Tool Manifest Types (fetched from services)
// ============================================================================

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface ToolExample {
  description: string;
  input: Record<string, unknown>;
  output?: unknown;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: ToolParameter[];
  requiredScopes: string[];
  returnsAsync?: boolean;
  examples?: ToolExample[];
  riskLevel?: RiskLevel;
}

export interface ToolManifest {
  serviceId: string;
  serviceName: string;
  version: string;
  protocolVersion: string;
  tools: ToolSchema[];
  fetchedAt: number;
  expiresAt: number;
}

// ============================================================================
// Capability Index Types
// ============================================================================

export interface CapabilityMatch {
  serviceId: string;
  serviceName: string;
  toolName?: string;
  matchType: 'keyword' | 'tag' | 'capability' | 'description';
  score: number;
}

export interface CapabilityIndex {
  // Inverted index: keyword/tag -> service IDs
  keywordIndex: Map<string, Set<string>>;
  tagIndex: Map<string, Set<string>>;
  capabilityIndex: Map<string, Set<string>>;

  // Service metadata for quick lookup
  serviceMetadata: Map<string, {
    name: string;
    description: string;
    priority: number;
    enabled: boolean;
  }>;
}

// ============================================================================
// Health Status Types
// ============================================================================

export interface ServiceHealthStatus {
  ok: boolean;
  lastCheck: number;
  responseTimeMs?: number;
  error?: string;
  version?: string;
}

// ============================================================================
// Enhanced Registry Types
// ============================================================================

export interface EnhancedServiceEntry extends ServiceDefinition {
  // Runtime state
  healthStatus?: ServiceHealthStatus;
  manifest?: ToolManifest;
  lastManifestFetch?: number;
}

export interface RegistryStats {
  totalServices: number;
  enabledServices: number;
  healthyServices: number;
  unhealthyServices: number;
  servicesWithManifests: number;
  totalTools: number;
  indexedKeywords: number;
  indexedTags: number;
  indexedCapabilities: number;
}

// ============================================================================
// Query Types
// ============================================================================

export interface ServiceQuery {
  keywords?: string[];
  tags?: string[];
  capabilities?: string[];
  riskLevel?: RiskLevel;
  enabledOnly?: boolean;
  healthyOnly?: boolean;
  limit?: number;
}

export interface ServiceQueryResult {
  services: EnhancedServiceEntry[];
  matches: CapabilityMatch[];
  queryTime: number;
}
