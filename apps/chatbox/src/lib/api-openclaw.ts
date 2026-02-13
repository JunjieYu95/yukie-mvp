/**
 * OpenClaw-specific API methods.
 * Use when chatbox is configured to connect to OpenClaw Gateway instead of Yukie HTTP API.
 *
 * Prerequisites:
 * - Add @openclaw/gateway-client: "file:../../../openclaw/packages/gateway-client"
 * - Set VITE_OPENCLAW_GATEWAY_URL and VITE_OPENCLAW_TOKEN in env
 */

import { createOpenClawClient, handleChatStream } from "./openclaw-client";

export interface OpenClawConfig {
  url: string;
  token: string;
}

export type OpenClawChatEventCallback = (params: {
  state: "delta" | "final" | "aborted" | "error";
  text?: string;
  error?: string;
}) => void;

let clientInstance: Awaited<ReturnType<typeof createOpenClawClient>> | null = null;
let chatEventCallback: OpenClawChatEventCallback | null = null;

export function setOpenClawChatEventHandler(cb: OpenClawChatEventCallback | null) {
  chatEventCallback = cb;
}

export async function getOpenClawClient(config: OpenClawConfig) {
  if (clientInstance) {
    try {
      await clientInstance.waitForHello();
      return clientInstance;
    } catch (err) {
      clientInstance.stop();
      clientInstance = null;
      throw err;
    }
  }

  clientInstance = await createOpenClawClient({
    url: config.url,
    token: config.token,
    clientId: "webchat-ui",
    onEvent: (evt) => {
      if (evt.event === "chat" && chatEventCallback) {
        handleChatStream(evt.payload as Parameters<typeof handleChatStream>[0], chatEventCallback);
      }
    },
  });

  await clientInstance.waitForHello();
  return clientInstance;
}

export function stopOpenClawClient() {
  if (clientInstance) {
    clientInstance.stop();
    clientInstance = null;
  }
  chatEventCallback = null;
}

export async function openclawSendMessage(
  config: OpenClawConfig,
  message: string,
  sessionKey = "main"
): Promise<{ runId: string }> {
  const client = await getOpenClawClient(config);
  const runId = crypto.randomUUID();

  await client.request("chat.send", {
    sessionKey,
    message,
    deliver: false,
    idempotencyKey: runId,
  });

  return { runId };
}

export async function openclawSendMessageProxy(
  token: string | null,
  message: string,
  sessionKey = "main"
): Promise<{ text: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch("/api/openclaw/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ message, sessionKey }),
    credentials: "include",
  });

  const data = (await response.json()) as { text?: string; error?: string; message?: string };
  if (!response.ok) {
    throw new Error(data.message || data.error || "OpenClaw proxy request failed");
  }
  return { text: data.text || "" };
}

export async function openclawGetHistory(
  config: OpenClawConfig,
  sessionKey = "main",
  limit = 50
) {
  const client = await getOpenClawClient(config);
  const res = (await client.request("chat.history", { sessionKey, limit })) as {
    messages?: unknown[];
    thinkingLevel?: string | null;
  };
  return { messages: res.messages ?? [], thinkingLevel: res.thinkingLevel };
}

export async function openclawCheckConnection(config: OpenClawConfig) {
  const client = await getOpenClawClient(config);
  await client.waitForHello();
  return { connected: client.connected };
}

export async function openclawCheckConnectionProxy(token: string | null) {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch("/api/openclaw/status", {
    method: "GET",
    headers,
    credentials: "include",
  });
  const data = (await response.json()) as { connected?: boolean; message?: string };
  if (!response.ok) {
    throw new Error(data.message || "OpenClaw proxy status failed");
  }
  return { connected: !!data.connected, message: data.message };
}
