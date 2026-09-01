// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { ToolSet } from "ai";

const READ_ONLY_TOOL_NAMES = ["get_capabilities", "search", "read"] as const;
const DEFAULT_IDLE_TTL_MS = 5 * 60 * 1000;
// Each distinct base URL spawns an MCP subprocess; cap them so attacker-varied
// URLs can't exhaust process/memory limits.
const MAX_CLIENTS = 8;

interface CachedMcpClient {
  client: MCPClient;
  tools: ToolSet;
  activeRequests: number;
  idleTimer?: NodeJS.Timeout;
  lastUsedAt: number;
}

const globalMcpCache = globalThis as typeof globalThis & {
  __fhirMcpClients?: Map<string, Promise<CachedMcpClient>>;
};

const clients =
  globalMcpCache.__fhirMcpClients ??
  (globalMcpCache.__fhirMcpClients = new Map<string, Promise<CachedMcpClient>>());

function idleTtlMs(): number {
  const configured = Number(process.env.FHIR_MCP_IDLE_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_IDLE_TTL_MS;
}

function commandConfig() {
  const command = process.env.FHIR_MCP_COMMAND?.trim() || "uvx";
  const args = process.env.FHIR_MCP_ARGS?.trim()
    ? process.env.FHIR_MCP_ARGS.trim().split(/\s+/)
    : ["--from", "fhir-mcp-server==0.10.0", "fhir-mcp-server", "--transport", "stdio"];

  return { command, args };
}

async function createCachedClient(baseUrl: string): Promise<CachedMcpClient> {
  const { command, args } = commandConfig();
  const transport = new Experimental_StdioMCPTransport({
    command,
    args,
    env: {
      FHIR_SERVER_BASE_URL: baseUrl,
      // Defaults to disabled for the open local dev server; set the env var to
      // "False" (plus the fhir-mcp-server auth env vars) for a secured server.
      FHIR_SERVER_DISABLE_AUTHORIZATION: process.env.FHIR_SERVER_DISABLE_AUTHORIZATION ?? "True",
      FHIR_MCP_REQUEST_TIMEOUT: process.env.FHIR_MCP_REQUEST_TIMEOUT ?? "30",
    },
  });

  const client = await createMCPClient({ transport });

  try {
    const availableTools = await client.tools();
    const tools: ToolSet = {};

    for (const name of READ_ONLY_TOOL_NAMES) {
      const tool = availableTools[name];
      if (!tool) {
        throw new Error(`WSO2 FHIR MCP Server did not expose the required '${name}' tool.`);
      }
      tools[name] = tool;
    }

    return { client, tools, activeRequests: 0, lastUsedAt: Date.now() };
  } catch (error) {
    await client.close();
    throw error;
  }
}

/** Evicts the least-recently-used idle client to make room for a new one. */
async function evictIdleClient(): Promise<boolean> {
  let lruKey: string | undefined;
  let lru: CachedMcpClient | undefined;

  for (const [key, pending] of clients) {
    const cached = await pending.catch(() => null);
    if (!cached || cached.activeRequests > 0 || clients.get(key) !== pending) continue;
    if (!lru || cached.lastUsedAt < lru.lastUsedAt) {
      lruKey = key;
      lru = cached;
    }
  }

  if (!lruKey || !lru) return false;
  clients.delete(lruKey);
  if (lru.idleTimer) clearTimeout(lru.idleTimer);
  void lru.client.close();
  return true;
}

export async function acquireReadOnlyFhirMcpClient(baseUrl: string): Promise<{
  client: MCPClient;
  tools: ToolSet;
  release: () => void;
}> {
  let pendingClient = clients.get(baseUrl);
  if (!pendingClient) {
    if (clients.size >= MAX_CLIENTS && !(await evictIdleClient())) {
      throw new Error("Too many FHIR servers in use right now. Try again shortly.");
    }
    pendingClient = createCachedClient(baseUrl);
    clients.set(baseUrl, pendingClient);
    pendingClient.catch(() => clients.delete(baseUrl));
  }

  const cached = await pendingClient;
  cached.lastUsedAt = Date.now();
  if (cached.idleTimer) {
    clearTimeout(cached.idleTimer);
    cached.idleTimer = undefined;
  }
  cached.activeRequests += 1;

  let released = false;
  return {
    client: cached.client,
    tools: cached.tools,
    release: () => {
      if (released) return;
      released = true;
      cached.activeRequests = Math.max(0, cached.activeRequests - 1);
      if (cached.activeRequests > 0) return;

      cached.idleTimer = setTimeout(() => {
        if (cached.activeRequests > 0) return;
        if (clients.get(baseUrl) === pendingClient) {
          clients.delete(baseUrl);
        }
        void cached.client.close();
      }, idleTtlMs());
      cached.idleTimer.unref();
    },
  };
}
