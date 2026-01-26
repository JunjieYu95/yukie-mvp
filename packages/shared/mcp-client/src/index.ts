/**
 * MCP Client Package
 *
 * Provides utilities for connecting to MCP (Model Context Protocol) servers.
 */

export {
  MCPClient,
  MCPClientError,
  getMCPClient,
  clearMCPClientCache,
  // Context conversion
  authContextToMCPContext,
  // Utility functions
  findTool,
  getToolNames,
  extractTextContent,
  extractStructuredContent,
  // Types
  type MCPClientConfig,
  type MCPClientContext,
  type MCPConnectionState,
} from './client';
