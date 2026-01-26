/**
 * MCP Server Package
 *
 * Provides utilities for building MCP (Model Context Protocol) servers.
 */

export {
  MCPServer,
  MCPError,
  // Tool handlers
  type ToolHandler,
  type ResourceHandler,
  type PromptHandler,
  type MCPRequestContext,
  type RegisteredTool,
  type RegisteredResource,
  type RegisteredPrompt,
  // YWAIP conversion
  ywaipActionToMCPTool,
  ywaipActionsToMCPTools,
  ywaipParameterToJsonSchemaProperty,
  ywaipTypeToJsonSchemaType,
  // Result helpers
  textContent,
  jsonContent,
  successResult,
  errorResult,
} from './server';

export {
  createMCPHttpHandler,
  createVercelMCPHandler,
  createExpressMCPHandler,
  type MCPHttpRequest,
  type MCPHttpResponse,
  type MCPHttpHandlerOptions,
  type ExpressRequest,
  type ExpressResponse,
} from './http-handler';
