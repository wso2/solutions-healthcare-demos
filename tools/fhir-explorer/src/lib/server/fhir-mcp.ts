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

import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

const READ_ONLY_TOOL_NAMES = ["get_capabilities", "search", "read"] as const;

const globalMcpCache = globalThis as typeof globalThis & {
  __fhirMcpTools?: Promise<ToolSet>;
};

async function connectToFhirMcp(): Promise<ToolSet> {
  const url = process.env.FHIR_MCP_URL?.trim();
  if (!url) throw new Error("Set FHIR_MCP_URL to the standalone FHIR MCP endpoint.");

  const client = await createMCPClient({ transport: { type: "http", url } });

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

    return tools;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function getReadOnlyFhirMcpTools(): Promise<ToolSet> {
  const tools = globalMcpCache.__fhirMcpTools ?? connectToFhirMcp();
  globalMcpCache.__fhirMcpTools = tools;
  try {
    return await tools;
  } catch (error) {
    if (globalMcpCache.__fhirMcpTools === tools) delete globalMcpCache.__fhirMcpTools;
    throw error;
  }
}
