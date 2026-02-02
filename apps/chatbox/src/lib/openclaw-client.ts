/**
 * OpenClaw Gateway WebSocket client wrapper.
 *
 * Add @openclaw/gateway-client (from OpenClaw repo) or copy
 * packages/gateway-client from openclaw into this project.
 *
 * Example with workspace (openclaw as sibling):
 *   "dependencies": { "@openclaw/gateway-client": "file:../../../openclaw/packages/gateway-client" }
 *
 * @see https://docs.openclaw.ai/web/custom-ui-integration
 */

// Types - inline for independence; replace with import when using the package
type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

type OpenClawClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientId?: string;
  onEvent?: (evt: { event: string; payload?: unknown }) => void;
};

export type OpenClawChatStreamHandler = (params: {
  state: "delta" | "final" | "aborted" | "error";
  text?: string;
  error?: string;
}) => void;

/**
 * Creates and starts an OpenClaw Gateway client.
 * Returns a client instance with request() and stop().
 *
 * Uses dynamic import to avoid hard dependency when @openclaw/gateway-client
 * is not installed. When integrated, replace with direct import.
 */
export async function createOpenClawClient(
  options: OpenClawClientOptions
): Promise<{
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  waitForHello: () => Promise<unknown>;
  stop: () => void;
  connected: boolean;
}> {
  try {
    const mod = await import("@openclaw/gateway-client");
    const { OpenClawGatewayClient } = mod;

    const client = new OpenClawGatewayClient({
      url: options.url,
      token: options.token,
      password: options.password,
      clientId: options.clientId ?? "yukie-chatbox",
      clientVersion: "1.0.0",
      platform: "web",
      onEvent: options.onEvent,
    });

    client.start();

    return {
      request: (method, params) => client.request(method, params),
      waitForHello: () => client.waitForHello(),
      stop: () => client.stop(),
      get connected() {
        return client.connected;
      },
    };
  } catch (err) {
    throw new Error(
      `OpenClaw client not available. Add @openclaw/gateway-client or copy from openclaw/packages/gateway-client. ${err}`
    );
  }
}

/**
 * Helper to extract streaming text from chat events.
 */
export function handleChatStream(
  payload: ChatEventPayload | undefined,
  handler: OpenClawChatStreamHandler
): void {
  if (!payload) return;

  if (payload.state === "delta") {
    const content = payload.message as { content?: Array<{ type?: string; text?: string }> } | undefined;
    const textBlock = content?.content?.find((c) => c?.type === "text");
    handler({ state: "delta", text: textBlock?.text ?? "" });
  } else if (payload.state === "final") {
    handler({ state: "final" });
  } else if (payload.state === "aborted") {
    handler({ state: "aborted" });
  } else if (payload.state === "error") {
    handler({ state: "error", error: payload.errorMessage });
  }
}
