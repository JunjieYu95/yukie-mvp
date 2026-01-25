# Routing & Service Discovery: Current Status & Design Recommendations

## Executive Summary

This document synthesizes research on MCP orchestration patterns and provides a comprehensive design for Yukie's routing and service discovery system. The current implementation has a solid foundation but needs enhancements to scale beyond a few services.

---

## Current Status

### ✅ What's Already Built

1. **YWAIP Protocol (Yukie-Worker Agentic Invocation Protocol)**
   - `/api/v1/meta` - Service metadata endpoint
   - `/api/v1/actions` - Tool/action discovery endpoint
   - `/api/v1/invoke` - Structured tool invocation
   - Well-designed protocol with proper typing

2. **Basic Service Registry** (`packages/yukie-core/src/registry.ts`)
   - Static service configuration loading
   - Dynamic metadata fetching (`fetchMeta`, `fetchActions`)
   - Health check support
   - Service enable/disable management

3. **LLM-Based Routing** (`packages/yukie-core/src/router.ts`)
   - `routeMessage()` - Analyzes user intent and selects service
   - `selectAction()` - Chooses which action to invoke
   - `invokeService()` - Executes service calls
   - `formatResponse()` - Formats service responses naturally

4. **Current Flow**
   ```
   User Message → routeMessage() → selectAction() → invokeService() → formatResponse()
   ```

### ❌ Current Limitations

1. **Module Resolution Issues**
   - Routing system disabled in Vercel due to monorepo import problems
   - Currently using simplified direct-to-LLM chat endpoint

2. **No Retrieval-Based Pre-Filtering**
   - All services passed to LLM in routing prompt
   - Will fail to scale beyond ~10 services (context window limits)

3. **No Multi-Service Orchestration**
   - Can only route to single service
   - No support for "get streak + calendar events" type queries

4. **No Capability Indexing**
   - No fast lookup by capability/keyword
   - No semantic search over tool descriptions

5. **No Tool Schema Caching**
   - Fetches actions on every request
   - No versioning or change detection

6. **Limited Tool Documentation**
   - Basic capability strings only
   - No examples, no structured metadata

7. **No Security Policy Layer**
   - No risk classification per tool
   - No confirmation gates for high-risk operations

---

## Recommended Architecture: Tool Registry + Router → Planner → Executor

Based on MCP best practices and modern tool-calling patterns, here's the recommended design:

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Request                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Router (Capability Retrieval)                     │
│  - Keyword/semantic search over tool registry              │
│  - Returns top-K candidate tools (5-15 max)                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Planner (LLM-Based Tool Selection)                │
│  - Receives shortlist of tools                             │
│  - Decides: single-tool vs multi-tool plan                 │
│  - Outputs structured tool calls with parameters           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Executor (Deterministic Enforcement)              │
│  - Validates schemas (JSON Schema)                         │
│  - Enforces auth + scopes                                  │
│  - Applies risk policy (confirmations)                     │
│  - Executes calls (parallel/sequential)                    │
│  - Handles retries, idempotency                            │
│  - Audit logging                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Response Formatter                                 │
│  - Formats structured results into natural language         │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Enhanced Tool Registry

**Purpose**: Machine-readable capability registry (not a static manual book)

#### Structure: `registry.yaml` (Human-Editable Config)

```yaml
services:
  - id: habit-tracker
    name: Habit Tracker
    baseUrl: ${HABIT_TRACKER_URL}
    transport: http  # or stdio, websocket
    auth:
      method: bearer-token
      requiredScopes: [habit:read, habit:write]
    healthEndpoint: /api/health
    metaEndpoint: /api/v1/meta
    actionsEndpoint: /api/v1/actions
    documentationUrl: https://docs.example.com/habit-tracker
    tags: [habit, tracking, personal]
    ownerNotes: "Handles daily habit check-ins and streak tracking"
    enabled: true
    
  - id: calendar-service
    name: Google Calendar Analyzer
    baseUrl: ${CALENDAR_SERVICE_URL}
    transport: http
    auth:
      method: oauth2
      requiredScopes: [calendar:read]
    tags: [calendar, scheduling, analysis]
    enabled: true
```

#### Structure: `registry.db` (Auto-Synced Tool Manifests)

```typescript
interface ToolManifest {
  // From YWAIP /api/v1/meta
  serviceId: string;
  serviceVersion: string;
  protocolVersion: string;
  description: string;
  capabilities: string[];
  
  // From YWAIP /api/v1/actions
  tools: ToolSchema[];
  
  // Metadata
  lastSynced: number;
  syncVersion: string;  // For change detection
}

interface ToolSchema {
  name: string;  // e.g., "getCurrentStreak"
  description: string;
  parameters: JSONSchema;  // Full JSON Schema
  requiredScopes: string[];
  riskLevel: 'low' | 'medium' | 'high';
  examples: ToolExample[];
  tags: string[];
}

interface ToolExample {
  userQuery: string;  // "what's my current streak"
  toolCall: {
    name: string;
    params: Record<string, unknown>;
  };
  expectedResult: string;  // Example output description
}
```

#### Registry Features

1. **Automatic Sync**
   - On startup: Fetch all tool manifests
   - Periodic refresh: Every 10 minutes
   - Version tracking: Detect schema changes
   - Health-aware: Skip unhealthy services

2. **Capability Index**
   ```typescript
   // Fast lookup: capability → serviceIds[]
   capabilityIndex: Map<string, string[]>
   
   // Semantic index: embeddings for tool descriptions + examples
   semanticIndex: VectorStore
   ```

3. **Query Methods**
   ```typescript
   // Keyword-based
   findToolsByCapability(capability: string): ToolSchema[]
   findToolsByTag(tag: string): ToolSchema[]
   
   // Semantic search
   findToolsBySemanticQuery(query: string, topK: number): ToolSchema[]
   
   // Combined retrieval
   retrieveCandidateTools(userQuery: string, topK: number): ToolSchema[]
   ```

---

### 2. Router (Capability Retrieval)

**Purpose**: Pre-filter tools before LLM routing to avoid context overflow

```typescript
interface RouterResult {
  candidateTools: ToolSchema[];  // Top-K tools (5-15 max)
  retrievalMethod: 'keyword' | 'semantic' | 'hybrid';
  confidence: number;
}

async function route(userQuery: string): Promise<RouterResult> {
  const registry = getToolRegistry();
  
  // Step 1: Extract keywords/capabilities from query
  const keywords = extractKeywords(userQuery);
  const capabilities = extractCapabilities(userQuery);
  
  // Step 2: Multi-strategy retrieval
  const keywordMatches = registry.findToolsByKeywords(keywords);
  const capabilityMatches = registry.findToolsByCapabilities(capabilities);
  const semanticMatches = await registry.findToolsBySemanticQuery(userQuery, 5);
  
  // Step 3: Combine and deduplicate
  const candidates = combineAndRank([
    ...keywordMatches,
    ...capabilityMatches,
    ...semanticMatches
  ]);
  
  // Step 4: Limit to top-K (critical for LLM context)
  return {
    candidateTools: candidates.slice(0, 15),
    retrievalMethod: 'hybrid',
    confidence: calculateConfidence(candidates)
  };
}
```

**Benefits**:
- Scales to 100+ services (only relevant tools in context)
- Faster routing (smaller LLM prompts)
- Lower cost (fewer tokens)

---

### 3. Planner (LLM-Based Tool Selection)

**Purpose**: Decide which tool(s) to call and with what parameters

```typescript
interface Plan {
  type: 'single-tool' | 'multi-tool';
  toolCalls: ToolCall[];
  sequence: 'parallel' | 'sequential';
  workingState?: Record<string, unknown>;  // For multi-tool workflows
}

interface ToolCall {
  serviceId: string;
  toolName: string;
  params: Record<string, unknown>;
  expectedOutput?: string;  // For planning
}

async function plan(
  userQuery: string,
  candidateTools: ToolSchema[]
): Promise<Plan> {
  // Build prompt with ONLY candidate tools (not all services)
  const prompt = buildPlanningPrompt(userQuery, candidateTools);
  
  // LLM outputs structured plan
  const plan = await llm.completeWithJSON<Plan>(prompt, {
    temperature: 0.1,  // Low temp for consistency
    schema: planSchema  // JSON Schema validation
  });
  
  return plan;
}
```

**Planning Prompt Structure**:
```
You are Yukie's planning agent. Given the user's request and available tools,
determine which tool(s) to call.

Available tools (only these):
${candidateTools.map(t => `
Tool: ${t.serviceId}.${t.name}
  Description: ${t.description}
  Parameters: ${JSON.stringify(t.parameters)}
  Examples: ${t.examples.map(e => e.userQuery).join(', ')}
`).join('\n')}

User request: "${userQuery}"

Output a plan:
- If single tool: type="single-tool", one toolCall
- If multiple tools: type="multi-tool", multiple toolCalls, specify sequence
- Include expected parameters based on user query
```

**Multi-Tool Planning**:
```typescript
// Example: "What's my streak and what meetings do I have today?"
{
  type: 'multi-tool',
  toolCalls: [
    { serviceId: 'habit-tracker', toolName: 'getCurrentStreak', params: {...} },
    { serviceId: 'calendar-service', toolName: 'getTodayEvents', params: {...} }
  ],
  sequence: 'parallel',  // Can run simultaneously
  workingState: {
    streak: null,  // Will be populated by tool 1
    events: null   // Will be populated by tool 2
  }
}
```

---

### 4. Executor (Deterministic Enforcement)

**Purpose**: Execute tool calls with strict validation and security

```typescript
interface ExecutionResult {
  success: boolean;
  results: Record<string, unknown>;  // Keyed by toolCall index
  errors?: Record<string, string>;
  auditLog: AuditEntry[];
}

async function execute(
  plan: Plan,
  auth: AuthContext
): Promise<ExecutionResult> {
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const auditLog: AuditEntry[] = [];
  
  // Validate all tool calls before execution
  for (const toolCall of plan.toolCalls) {
    const tool = registry.getTool(toolCall.serviceId, toolCall.toolName);
    
    // 1. Schema validation
    const validation = validateParams(toolCall.params, tool.parameters);
    if (!validation.valid) {
      errors[toolCall.toolName] = validation.error;
      continue;
    }
    
    // 2. Auth/scope check
    if (!hasRequiredScopes(auth.scopes, tool.requiredScopes)) {
      errors[toolCall.toolName] = 'Missing required scopes';
      continue;
    }
    
    // 3. Risk policy check
    if (tool.riskLevel === 'high') {
      // Require explicit confirmation (could be user prompt or policy)
      if (!await checkConfirmation(toolCall)) {
        errors[toolCall.toolName] = 'High-risk operation not confirmed';
        continue;
      }
    }
    
    // 4. Execute
    try {
      const result = await invokeService({
        serviceId: toolCall.serviceId,
        action: toolCall.toolName,
        params: toolCall.params,
        auth
      });
      
      results[toolCall.toolName] = result;
      auditLog.push(createAuditEntry(toolCall, result, auth));
      
    } catch (error) {
      errors[toolCall.toolName] = error.message;
    }
  }
  
  return { success: Object.keys(errors).length === 0, results, errors, auditLog };
}
```

**Security Features**:
- ✅ JSON Schema validation (prevents injection)
- ✅ Scope enforcement (least privilege)
- ✅ Risk-based confirmations
- ✅ Audit logging
- ✅ Idempotency keys (prevent duplicate operations)
- ✅ Input sanitization (especially for CLI/file paths)

---

### 5. Multi-Tool Workflow Support

**Pattern**: Plan → Execute → Compose

```typescript
// Example: "Summarize my week: workouts + work logs + calendar"
async function executeMultiToolPlan(plan: Plan): Promise<string> {
  // Step 1: Execute all tools
  const executionResult = await execute(plan, auth);
  
  // Step 2: Build working state
  const workingState = {
    ...plan.workingState,
    ...executionResult.results
  };
  
  // Step 3: Compose final response
  const composePrompt = `
You received data from multiple services:
${JSON.stringify(workingState, null, 2)}

User's original request: "${originalQuery}"

Synthesize a natural response combining all the data.
`;
  
  return await llm.complete(composePrompt);
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. ✅ Fix Vercel module resolution issues
2. ✅ Restore routing system in production
3. ✅ Add tool schema caching to registry
4. ✅ Implement capability indexing

### Phase 2: Enhanced Registry (Week 2-3)
1. ✅ Create `registry.yaml` schema
2. ✅ Implement automatic tool manifest sync
3. ✅ Add semantic search (embeddings)
4. ✅ Build capability index

### Phase 3: Router Enhancement (Week 3-4)
1. ✅ Implement retrieval-based pre-filtering
2. ✅ Add keyword extraction
3. ✅ Integrate semantic search
4. ✅ Test with 10+ services

### Phase 4: Multi-Tool Support (Week 4-5)
1. ✅ Enhance planner for multi-tool plans
2. ✅ Implement parallel/sequential execution
3. ✅ Add working state management
4. ✅ Build composition step

### Phase 5: Security & Polish (Week 5-6)
1. ✅ Add risk classification per tool
2. ✅ Implement confirmation gates
3. ✅ Add audit logging
4. ✅ Input sanitization
5. ✅ Comprehensive testing

---

## Key Design Decisions

### ✅ Do This

1. **Machine-readable registry, not manual book**
   - YAML config + auto-synced DB
   - Structured schemas, not free-form text

2. **Retrieval before LLM routing**
   - Pre-filter to top-K tools
   - Prevents context overflow

3. **Structured tool calls, not free-form messages**
   - JSON Schema parameters
   - Validated, replayable calls

4. **LLM proposes, system enforces**
   - LLM for planning (flexible)
   - Deterministic validation/execution (reliable)

5. **Multi-tool with typed state**
   - Working state object
   - Prevents "forgetting" intermediate results

### ❌ Avoid This

1. **Don't put all tools in every prompt**
   - Will fail beyond ~15 services
   - Use retrieval instead

2. **Don't use free-form messages between services**
   - Use structured tool calls
   - Prevents ambiguity

3. **Don't trust LLM output blindly**
   - Always validate schemas
   - Always check auth/scopes

4. **Don't hard-code routing rules**
   - Use LLM + retrieval
   - More flexible, less brittle

---

## Migration Path

### Current → Recommended

1. **Keep existing YWAIP protocol** ✅
   - Already well-designed
   - No changes needed

2. **Enhance registry incrementally**
   - Start with caching tool manifests
   - Add capability index
   - Then add semantic search

3. **Add router pre-filtering**
   - Keep existing `routeMessage()` as fallback
   - Add retrieval step before it
   - Gradually migrate

4. **Add multi-tool support**
   - Extend `Plan` interface
   - Add execution orchestration
   - Test with simple 2-tool queries first

---

## Example: Complete Flow

**User Query**: "What's my current streak for early wakeup and what meetings do I have today?"

### Step 1: Router (Retrieval)
```
Input: "What's my current streak for early wakeup and what meetings do I have today?"

Retrieval:
- Keyword match: "streak" → habit-tracker.getCurrentStreak
- Keyword match: "meetings" → calendar-service.getTodayEvents
- Semantic match: "early wakeup" → habit-tracker (high confidence)

Output: [habit-tracker.getCurrentStreak, calendar-service.getTodayEvents]
```

### Step 2: Planner (LLM)
```
Input: User query + 2 candidate tools

LLM Output:
{
  type: "multi-tool",
  toolCalls: [
    {
      serviceId: "habit-tracker",
      toolName: "getCurrentStreak",
      params: { habitId: "early_wakeup" }
    },
    {
      serviceId: "calendar-service",
      toolName: "getTodayEvents",
      params: { date: "2026-01-24" }
    }
  ],
  sequence: "parallel"
}
```

### Step 3: Executor
```
- Validate schemas ✅
- Check scopes ✅
- Check risk levels (both low) ✅
- Execute in parallel:
  - habit-tracker → { streak: 7 }
  - calendar-service → { events: [...] }
```

### Step 4: Formatter
```
LLM composes:
"Your current streak for early wakeup is 7 days! 🎉 
Today you have 3 meetings: Standup at 10am, Design review at 2pm, and Team sync at 4pm."
```

---

## Conclusion

Your current system has a solid foundation with YWAIP protocol and basic routing. The recommended enhancements will:

1. **Scale** to 100+ services (via retrieval)
2. **Support** multi-tool workflows
3. **Improve** reliability (via validation)
4. **Enhance** security (via risk policies)
5. **Maintain** flexibility (via LLM planning)

The key insight: **Don't replace your LLM-based routing—enhance it with retrieval-based pre-filtering and deterministic execution enforcement.**
