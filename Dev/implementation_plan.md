# MCP-to-MCP Architecture Implementation Plan

**Version:** 1.0  
**Date:** January 24, 2026  
**Status:** Planning Phase

---

## Table of Contents

1. [MCP-to-MCP Architecture & Motivation](#1-mcp-to-mcp-architecture--motivation)
2. [Industrial Common Practices](#2-industrial-common-practices)
3. [Current Codebase Status](#3-current-codebase-status)
4. [Detailed Implementation Plan](#4-detailed-implementation-plan)
5. [Testing Strategy](#5-testing-strategy)

---

## 1. MCP-to-MCP Architecture & Motivation

### Vision: A World Wide Mesh of Agents

Yukie implements an **MCP-to-MCP architecture** where Yukie serves as a **Primary Agent** (orchestrator) that coordinates multiple specialized **Expert Agent** services, each implementing the Model Context Protocol (MCP) pattern. This creates a hierarchical, composable system where agents can treat other agents as tools.

### Architecture Diagram

```
                    ┌─────────────────────────┐
                    │  User's Primary Agent   │
                    │      (Yukie Core)       │
                    └───────────┬─────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌──────────────────────┐      ┌──────────────────────┐
    │  Legal Expert Agent  │◄─────►│ Financial Analyst    │
    │   (MCP Service)      │       │    Agent (MCP)       │
    └───────────┬──────────┘       └──────────┬───────────┘
                │                              │
                ▼                              ▼
    ┌──────────────────────┐      ┌──────────────────────┐
    │  Law Library Tool    │      │ Bloomberg Terminal   │
    │   (Data Source)      │      │     Tool             │
    └──────────────────────┘      └──────────────────────┘
```

### Key Concepts

1. **Primary Agent (Yukie)**
   - Central orchestrator that understands user intent
   - Routes requests to appropriate expert agents
   - Composes responses from multiple agents
   - Manages authentication, authorization, and audit

2. **Expert Agents (MCP Services)**
   - Specialized domain services (habit-tracker, calendar-service, etc.)
   - Each implements YWAIP protocol (Yukie's variant of MCP)
   - Exposes structured tools/actions via `/api/v1/actions`
   - Can be treated as "tools" by the primary agent

3. **Tools (Data Sources)**
   - Lower-level resources (databases, APIs, file systems)
   - Accessed by expert agents, not directly by Yukie
   - Abstracted away from the primary agent

### Motivation

#### Problem Statement

As personal AI assistants evolve, users need:
- **Specialized capabilities** without building everything into one monolithic system
- **Composable services** that can be mixed and matched
- **Natural language interface** that hides complexity
- **Scalable architecture** that grows with needs

#### Solution: MCP-to-MCP Pattern

1. **Separation of Concerns**
   - Each MCP service handles one domain (habits, calendar, finance, etc.)
   - Yukie focuses on orchestration, not implementation
   - Services can be developed, deployed, and updated independently

2. **Agent as Tool Paradigm**
   - Expert agents are treated as sophisticated tools
   - Yukie doesn't need to know implementation details
   - Services expose capabilities via structured schemas
   - Enables "one agent hiring another" pattern

3. **AI as Middleware**
   - LLM-based routing understands natural language intent
   - Translates user queries to structured tool calls
   - Composes multi-service workflows automatically
   - Provides natural language responses

4. **Scalability**
   - Add new services without modifying Yukie core
   - Services register themselves via discovery protocol
   - Routing scales via retrieval-based pre-filtering
   - Supports 100+ services without context overflow

### Example Flow

**User Query:** "What's my current streak for early wakeup and what meetings do I have today?"

1. **Yukie (Primary Agent)** receives the query
2. **Router** analyzes intent and identifies:
   - `habit-tracker` service for streak query
   - `calendar-service` for meetings query
3. **Planner** creates multi-tool plan:
   - Call `habit-tracker.getCurrentStreak({habitId: "early_wakeup"})`
   - Call `calendar-service.getTodayEvents({date: "2026-01-24"})`
   - Execute in parallel
4. **Executor** invokes both services simultaneously
5. **Formatter** composes natural language response:
   - "Your current streak is 7 days! 🎉 Today you have 3 meetings..."

---

## 2. Industrial Common Practices

### 2.1 Model Context Protocol (MCP) Standards

**Source:** [Model Context Protocol Specification](https://modelcontextprotocol.io)

**Key Practices:**
- **Tool Discovery**: Servers expose tools via structured schemas (name, description, parameters)
- **Structured Invocation**: Tools called with JSON Schema-validated parameters
- **Transport Agnostic**: Supports stdio, HTTP, WebSocket
- **Versioning**: Protocol versioning for backward compatibility

**Yukie's Implementation:**
- YWAIP (Yukie-Worker Agentic Invocation Protocol) follows MCP patterns
- `/api/v1/meta` - Service metadata discovery
- `/api/v1/actions` - Tool/action discovery
- `/api/v1/invoke` - Structured tool invocation

### 2.2 Service Discovery Patterns

**Source:** API Gateway patterns (Envoy, Kong), Service Mesh (Istio)

**Key Practices:**
- **Static Configuration**: Initial service registry (YAML/JSON)
- **Dynamic Discovery**: Runtime capability fetching
- **Health Checks**: Periodic service availability monitoring
- **Capability Indexing**: Fast lookup by keywords/capabilities

**Yukie's Approach:**
- `config/services.json` - Static service configuration
- Dynamic fetching via YWAIP `/api/v1/meta` and `/api/v1/actions`
- Health check endpoints for service monitoring
- Planned: Capability index for fast retrieval

### 2.3 LLM-Based Routing

**Source:** LangChain Tool Calling, OpenAI Function Calling, LLMRouter

**Key Practices:**
- **Retrieval Before Routing**: Pre-filter tools to avoid context overflow
- **Structured Output**: JSON Schema for tool selection
- **Multi-Tool Planning**: Support for sequential/parallel tool calls
- **Validation**: Schema validation before execution

**Yukie's Approach:**
- LLM-based routing with retrieval pre-filtering (planned)
- JSON Schema validation for tool parameters
- Multi-service orchestration support (planned)
- Deterministic execution with validation

### 2.4 Security Best Practices

**Source:** OWASP AI Security, MCP Security Guidelines

**Key Practices:**
- **Scope-Based Authorization**: Fine-grained permissions per tool
- **Risk Classification**: Low/medium/high risk levels
- **Input Validation**: JSON Schema validation prevents injection
- **Audit Logging**: Track all tool invocations
- **Confirmation Gates**: Require explicit approval for high-risk operations

**Yukie's Approach:**
- Scope-based auth (`habit:read`, `habit:write`, etc.)
- Planned: Risk classification per tool
- JSON Schema validation (planned)
- Audit logging (planned)
- Confirmation gates for high-risk operations (planned)

### 2.5 Tool Registry Patterns

**Source:** MCP Gateway (Microsoft), Tool Calling Frameworks

**Key Practices:**
- **Human-Editable Config**: YAML/JSON for service registration
- **Auto-Synced Manifests**: Runtime tool schema fetching
- **Versioning**: Track schema changes
- **Semantic Search**: Embeddings for capability matching

**Yukie's Approach:**
- `config/services.json` for static config
- Dynamic manifest fetching via YWAIP
- Planned: Version tracking, semantic search

---

## 3. Current Codebase Status

### 3.1 What's Already Built ✅

#### Protocol Layer
- **YWAIP Protocol** (`packages/shared/protocol/src/types.ts`)
  - Service metadata types (`YWAIPServiceMeta`)
  - Action types (`YWAIPAction`, `YWAIPActionsResponse`)
  - Invocation types (`YWAIPInvokeRequest`, `YWAIPInvokeResponse`)
  - Routing types (`YNFPRoutingResult`)

#### Service Registry
- **Basic Registry** (`packages/yukie-core/src/registry.ts`)
  - Static service loading from config
  - Dynamic metadata fetching (`fetchMeta`, `fetchActions`)
  - Health check support (`checkHealth`, `checkAllHealth`)
  - Service enable/disable management

#### Routing System
- **LLM-Based Router** (`packages/yukie-core/src/router.ts`)
  - `routeMessage()` - Analyzes user intent, selects service
  - `selectAction()` - Chooses which action to invoke
  - `invokeService()` - Executes service calls
  - `formatResponse()` - Formats service responses naturally
  - `processChatMessage()` - Full chat flow orchestration

#### LLM Integration
- **LLM Client** (`packages/yukie-core/src/llm/client.ts`)
  - Anthropic and OpenAI client implementations
  - JSON completion helper (`completeWithJSON`)
  - Singleton pattern for client reuse

#### Prompts
- **Routing Prompts** (`packages/yukie-core/src/llm/prompts.ts`)
  - `buildRoutingPrompt()` - Service selection prompt
  - `buildFallbackPrompt()` - Fallback response prompt
  - `buildResponseFormattingPrompt()` - Response formatting prompt

#### API Endpoints
- **Chat API** (`api/chat.ts`)
  - Currently simplified (direct-to-LLM, routing disabled)
  - Authentication via JWT
  - CORS support

#### Example Service
- **Habit Tracker** (`packages/services/habit-tracker/`)
  - YWAIP implementation
  - Action definitions (`lib/ywaip/actions.ts`)
  - Action executor (`lib/ywaip/action-executor.ts`)
  - Meta endpoint (`lib/ywaip/meta.ts`)

### 3.2 Current Limitations ❌

1. **Module Resolution Issues**
   - Routing system disabled in Vercel production
   - Monorepo imports fail in serverless environment
   - Currently using simplified direct-to-LLM endpoint

2. **No Retrieval-Based Pre-Filtering**
   - All services passed to LLM in routing prompt
   - Will fail beyond ~10 services (context limits)
   - No capability indexing

3. **No Multi-Service Orchestration**
   - Can only route to single service
   - No support for parallel/sequential tool calls
   - No working state management

4. **No Tool Schema Caching**
   - Fetches actions on every request
   - No versioning or change detection
   - No TTL-based refresh

5. **Limited Tool Documentation**
   - Basic capability strings only
   - No examples or structured metadata
   - No semantic search

6. **No Security Policy Layer**
   - No risk classification per tool
   - No confirmation gates
   - Limited input sanitization

### 3.3 File Structure

```
yukie-mvp-blueprint/
├── api/                          # Vercel serverless functions
│   ├── chat.ts                  # Chat endpoint (simplified)
│   ├── health.ts                 # Health check
│   └── inbox/                    # Inbox endpoints
├── apps/
│   └── chatbox/                  # Vue.js frontend
├── config/
│   └── services.json             # Static service config
├── packages/
│   ├── shared/
│   │   ├── protocol/             # YWAIP type definitions
│   │   ├── auth/                 # Auth utilities
│   │   └── observability/        # Logging
│   ├── yukie-core/              # Core orchestration engine
│   │   ├── src/
│   │   │   ├── registry.ts      # Service registry
│   │   │   ├── router.ts        # Routing logic
│   │   │   ├── llm/             # LLM client & prompts
│   │   │   └── routes/          # Express routes
│   └── services/
│       └── habit-tracker/        # Example MCP service
├── scripts/                      # Utility scripts
└── docs/                         # Documentation
```

---

## 4. Detailed Implementation Plan

### Phase 1: Fix Vercel Module Resolution & Restore Routing

**Goal:** Get routing system working in production

#### 4.1.1 Files to Modify

**`api/chat.ts`**
- **Current:** Simplified direct-to-LLM implementation
- **Change:** Import and use `processChatMessage` from `packages/yukie-core`
- **Challenge:** Fix monorepo imports for Vercel serverless

**`vercel.json`**
- **Current:** Has `includeFiles: "packages/**/*"` but not working
- **Change:** Ensure proper TypeScript compilation and bundling
- **Options:**
  - Use `@vercel/node` bundler configuration
  - Create bundled entry point
  - Use path aliases in `tsconfig.json`

**`tsconfig.json`**
- **Current:** Basic TypeScript config
- **Change:** Add path aliases for monorepo imports
- **Example:**
  ```json
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@yukie-core/*": ["packages/yukie-core/src/*"],
        "@shared/*": ["packages/shared/*/src/*"]
      }
    }
  }
  ```

#### 4.1.2 New Files to Create

**`api/_lib/vercel-bundler.ts`**
- **Purpose:** Helper to bundle monorepo imports for Vercel
- **Content:** Re-export core functions with proper bundling

**`scripts/build-vercel-api.ts`**
- **Purpose:** Pre-build script to bundle API routes
- **Content:** Bundle `packages/yukie-core` into single file for Vercel

#### 4.1.3 Test Scripts

**`scripts/test-routing.ts`**
- **Purpose:** Test routing system locally
- **Tests:**
  - Single service routing
  - Multi-service routing (when implemented)
  - Error handling
  - Schema validation

**`scripts/test-vercel-build.ts`**
- **Purpose:** Test Vercel build locally
- **Tests:**
  - Module resolution
  - Import paths
  - Bundle size

---

### Phase 2: Enhanced Tool Registry

**Goal:** Build machine-readable capability registry with caching and indexing

#### 4.2.1 New Files to Create

**`config/registry.yaml`**
- **Purpose:** Human-editable service registry
- **Structure:**
  ```yaml
  services:
    - id: habit-tracker
      name: Habit Tracker
      baseUrl: ${HABIT_TRACKER_URL}
      transport: http
      auth:
        method: bearer-token
        requiredScopes: [habit:read, habit:write]
      healthEndpoint: /api/health
      metaEndpoint: /api/v1/meta
      actionsEndpoint: /api/v1/actions
      documentationUrl: https://docs.example.com/habit-tracker
      tags: [habit, tracking, personal]
      ownerNotes: "Handles daily habit check-ins"
      enabled: true
  ```

**`packages/yukie-core/src/registry/enhanced-registry.ts`**
- **Purpose:** Enhanced registry with caching and indexing
- **Features:**
  - Load from `registry.yaml`
  - Cache tool manifests with TTL
  - Capability index (capability → serviceIds[])
  - Version tracking
  - Health-aware syncing

**`packages/yukie-core/src/registry/capability-index.ts`**
- **Purpose:** Fast capability lookup
- **Features:**
  - Keyword-based indexing
  - Tag-based indexing
  - Inverted index structure

**`packages/yukie-core/src/registry/manifest-cache.ts`**
- **Purpose:** Cache tool manifests with TTL
- **Features:**
  - In-memory cache with TTL (10 minutes)
  - Version tracking
  - Change detection
  - Background refresh

**`packages/yukie-core/src/registry/types.ts`**
- **Purpose:** Type definitions for enhanced registry
- **Types:**
  - `ToolManifest`
  - `ToolSchema`
  - `ToolExample`
  - `CapabilityIndex`

#### 4.2.2 Files to Modify

**`packages/yukie-core/src/registry.ts`**
- **Change:** Refactor to use enhanced registry
- **Keep:** Backward compatibility with existing API

**`config/services.json`**
- **Change:** Migrate to `registry.yaml` format
- **Keep:** JSON version for backward compatibility during migration

#### 4.2.3 Test Scripts

**`scripts/test-registry.ts`**
- **Purpose:** Test enhanced registry
- **Tests:**
  - Load from YAML
  - Cache TTL behavior
  - Capability indexing
  - Manifest syncing
  - Version tracking

**`scripts/test-manifest-sync.ts`**
- **Purpose:** Test automatic manifest syncing
- **Tests:**
  - Fetch from service endpoints
  - Cache updates
  - Change detection
  - Error handling

---

### Phase 3: Retrieval-Based Router

**Goal:** Pre-filter tools before LLM routing to scale to 100+ services

#### 4.3.1 New Files to Create

**`packages/yukie-core/src/router/retrieval-router.ts`**
- **Purpose:** Retrieval-based pre-filtering
- **Features:**
  - Keyword extraction from user query
  - Capability matching
  - Semantic search (if embeddings available)
  - Top-K candidate selection (5-15 tools)

**`packages/yukie-core/src/router/keyword-extractor.ts`**
- **Purpose:** Extract keywords/capabilities from user query
- **Features:**
  - Simple keyword matching
  - Capability phrase detection
  - Tag matching

**`packages/yukie-core/src/router/semantic-search.ts`** (Optional Phase 3.5)
- **Purpose:** Semantic search using embeddings
- **Features:**
  - Generate embeddings for tool descriptions
  - Vector similarity search
  - Hybrid search (keyword + semantic)

**`packages/yukie-core/src/router/types.ts`**
- **Purpose:** Router type definitions
- **Types:**
  - `RouterResult`
  - `RetrievalMethod`
  - `CandidateTool`

#### 4.3.2 Files to Modify

**`packages/yukie-core/src/router.ts`**
- **Change:** Add retrieval step before LLM routing
- **Flow:**
  1. `retrieveCandidateTools()` - Pre-filter to top-K
  2. `routeMessage()` - LLM routing with only candidates
  3. Keep existing `selectAction()` and `invokeService()`

**`packages/yukie-core/src/llm/prompts.ts`**
- **Change:** Update `buildRoutingPrompt()` to accept candidate tools only
- **Remove:** Full service list from prompt

#### 4.3.3 Test Scripts

**`scripts/test-retrieval-router.ts`**
- **Purpose:** Test retrieval-based routing
- **Tests:**
  - Keyword extraction
  - Capability matching
  - Top-K selection
  - Performance with 50+ services

**`scripts/test-routing-scale.ts`**
- **Purpose:** Test routing with many services
- **Tests:**
  - 10 services
  - 50 services
  - 100 services
  - Context window limits

---

### Phase 4: Multi-Tool Orchestration

**Goal:** Support multi-service workflows (parallel/sequential)

#### 4.4.1 New Files to Create

**`packages/yukie-core/src/planner/planner.ts`**
- **Purpose:** LLM-based planning for multi-tool workflows
- **Features:**
  - Single-tool planning
  - Multi-tool planning
  - Parallel vs sequential decision
  - Working state management

**`packages/yukie-core/src/planner/types.ts`**
- **Purpose:** Planning type definitions
- **Types:**
  - `Plan`
  - `ToolCall`
  - `ExecutionSequence`
  - `WorkingState`

**`packages/yukie-core/src/executor/executor.ts`**
- **Purpose:** Deterministic tool execution
- **Features:**
  - Schema validation
  - Auth/scope enforcement
  - Risk policy checks
  - Parallel execution
  - Sequential execution
  - Error handling

**`packages/yukie-core/src/executor/validator.ts`**
- **Purpose:** JSON Schema validation
- **Features:**
  - Parameter validation
  - Type checking
  - Required field validation

**`packages/yukie-core/src/executor/security-policy.ts`**
- **Purpose:** Security policy enforcement
- **Features:**
  - Risk classification
  - Confirmation gates
  - Scope checking
  - Input sanitization

**`packages/yukie-core/src/executor/audit-logger.ts`**
- **Purpose:** Audit logging for tool invocations
- **Features:**
  - Log all tool calls
  - Track parameters
  - Record results
  - Store in database (future)

**`packages/yukie-core/src/composer/composer.ts`**
- **Purpose:** Compose responses from multiple tool results
- **Features:**
  - Multi-tool result aggregation
  - Natural language composition
  - Error handling

#### 4.4.2 Files to Modify

**`packages/yukie-core/src/router.ts`**
- **Change:** Integrate planner and executor
- **New Flow:**
  1. Retrieve candidate tools
  2. Plan tool calls (single or multi)
  3. Execute plan
  4. Compose response

**`packages/shared/protocol/src/types.ts`**
- **Change:** Add multi-tool types
- **Add:**
  - `MultiToolPlan`
  - `ToolCallSequence`
  - `WorkingState`

#### 4.4.3 Test Scripts

**`scripts/test-multi-tool-planning.ts`**
- **Purpose:** Test multi-tool planning
- **Tests:**
  - Single-tool queries
  - Multi-tool queries
  - Parallel execution
  - Sequential execution
  - Working state management

**`scripts/test-executor.ts`**
- **Purpose:** Test executor
- **Tests:**
  - Schema validation
  - Auth enforcement
  - Risk policy
  - Parallel execution
  - Error handling

**`scripts/test-composer.ts`**
- **Purpose:** Test response composition
- **Tests:**
  - Single-tool responses
  - Multi-tool responses
  - Error composition

---

### Phase 5: Security & Polish

**Goal:** Add security policies, audit logging, and production hardening

#### 4.5.1 New Files to Create

**`packages/yukie-core/src/security/risk-classifier.ts`**
- **Purpose:** Classify tool risk levels
- **Features:**
  - Low/medium/high classification
  - Configurable risk rules
  - Per-tool risk assignment

**`packages/yukie-core/src/security/confirmation-gate.ts`**
- **Purpose:** Require confirmation for high-risk operations
- **Features:**
  - User confirmation prompts
  - Policy-based gates
  - Audit trail

**`packages/yukie-core/src/security/input-sanitizer.ts`**
- **Purpose:** Sanitize tool inputs
- **Features:**
  - Path traversal prevention
  - Command injection prevention
  - XSS prevention

**`packages/yukie-core/src/audit/audit-logger.ts`**
- **Purpose:** Comprehensive audit logging
- **Features:**
  - Log all tool invocations
  - Track user actions
  - Store in database (future)
  - Query interface

**`packages/yukie-core/src/audit/types.ts`**
- **Purpose:** Audit log types
- **Types:**
  - `AuditEntry`
  - `AuditQuery`
  - `AuditFilter`

#### 4.5.2 Files to Modify

**`packages/yukie-core/src/executor/executor.ts`**
- **Change:** Integrate security checks
- **Add:**
  - Risk classification check
  - Confirmation gate
  - Input sanitization
  - Audit logging

**`config/registry.yaml`**
- **Change:** Add risk levels to tools
- **Add:**
  - `riskLevel` field per tool
  - Security notes

#### 4.5.3 Test Scripts

**`scripts/test-security.ts`**
- **Purpose:** Test security features
- **Tests:**
  - Risk classification
  - Confirmation gates
  - Input sanitization
  - Scope enforcement

**`scripts/test-audit.ts`**
- **Purpose:** Test audit logging
- **Tests:**
  - Log creation
  - Query interface
  - Filtering
  - Retention

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Location:** `packages/yukie-core/src/**/*.test.ts`

**Coverage:**
- Registry operations
- Router functions
- Planner logic
- Executor validation
- Security checks

**Framework:** Jest or Vitest

### 5.2 Integration Tests

**Location:** `scripts/test-*.ts`

**Tests:**
- End-to-end routing flow
- Multi-tool workflows
- Error handling
- Performance benchmarks

### 5.3 Test Scripts Summary

| Script | Purpose | Phase |
|--------|---------|-------|
| `test-routing.ts` | Test routing system | 1 |
| `test-vercel-build.ts` | Test Vercel build | 1 |
| `test-registry.ts` | Test enhanced registry | 2 |
| `test-manifest-sync.ts` | Test manifest syncing | 2 |
| `test-retrieval-router.ts` | Test retrieval routing | 3 |
| `test-routing-scale.ts` | Test routing at scale | 3 |
| `test-multi-tool-planning.ts` | Test multi-tool planning | 4 |
| `test-executor.ts` | Test executor | 4 |
| `test-composer.ts` | Test response composition | 4 |
| `test-security.ts` | Test security features | 5 |
| `test-audit.ts` | Test audit logging | 5 |

### 5.4 Test Data

**Location:** `test/fixtures/`

**Files:**
- `services.yaml` - Test service configurations
- `tool-manifests.json` - Sample tool manifests
- `queries.json` - Test user queries
- `expected-routes.json` - Expected routing results

---

## Implementation Timeline

### Week 1-2: Phase 1 (Foundation)
- Fix Vercel module resolution
- Restore routing in production
- Basic testing

### Week 2-3: Phase 2 (Enhanced Registry)
- Implement YAML registry
- Add caching and indexing
- Manifest syncing

### Week 3-4: Phase 3 (Retrieval Router)
- Implement retrieval pre-filtering
- Keyword extraction
- Scale testing

### Week 4-5: Phase 4 (Multi-Tool)
- Multi-tool planning
- Parallel/sequential execution
- Response composition

### Week 5-6: Phase 5 (Security)
- Security policies
- Audit logging
- Production hardening

---

## Success Criteria

### Phase 1
- ✅ Routing system works in Vercel production
- ✅ Can route to habit-tracker service
- ✅ End-to-end flow working

### Phase 2
- ✅ Registry loads from YAML
- ✅ Tool manifests cached with TTL
- ✅ Capability index working
- ✅ Can handle 20+ services

### Phase 3
- ✅ Retrieval pre-filters to top-K tools
- ✅ Routing works with 50+ services
- ✅ Context window stays under limits

### Phase 4
- ✅ Can plan multi-tool workflows
- ✅ Parallel execution working
- ✅ Sequential execution working
- ✅ Response composition natural

### Phase 5
- ✅ Security policies enforced
- ✅ Audit logging comprehensive
- ✅ Production-ready

---

## Next Steps

1. **Review this plan** with team
2. **Set up development environment** for Phase 1
3. **Create GitHub issues** for each phase
4. **Start Phase 1 implementation**

---

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [MCP Best Practices](https://mcp-best-practice.github.io/mcp-best-practice/)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [LangChain Tool Calling](https://blog.langchain.com/tool-calling-with-langchain/)
- Design Document: `docs/11_routing_service_discovery_design.md`
