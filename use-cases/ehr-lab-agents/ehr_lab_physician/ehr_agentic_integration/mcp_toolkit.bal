import ballerina/ai;
import ballerina/mcp;

// The EHR and the lab each sit behind a WSO2 FHIR MCP server, and both offer the same tools (search, read…).
// An agent needs tool names that are unique, and telling the model which system a tool reads helps it pick
// the right one, so each server's tools are published under its prefix: `ehr_search`, `lab_search`. The
// server is still called with its own tool name, so Agent Manager's MCP proxy grants apply unchanged.

# An MCP server's tools, published to the agent under a prefix.
isolated class PrefixedMcpToolKit {
    *ai:McpBaseToolKit;
    private final ai:McpToolKit server;
    private final int prefixLength;
    private final ai:ToolConfig[] & readonly tools;

    # + prefix - what the tool names start with (`ehr` → `ehr_search`)
    # + system - the system the server reads, put in front of each tool's description
    # + server - the connected MCP toolkit
    isolated function init(string prefix, string system, ai:McpToolKit server) {
        self.server = server;
        self.prefixLength = prefix.length() + 1;
        isolated function caller = self.callTool;
        self.tools = from ai:ToolConfig tool in server.getTools()
            select {
                name: string `${prefix}_${tool.name}`,
                description: string `${system}: ${tool.description}`,
                parameters: tool.parameters.cloneReadOnly(),
                caller
            };
    }

    # Calls the server's own tool for a prefixed name.
    #
    # + params - the call as the agent made it, with the prefixed tool name
    # + return - the server's result
    public isolated function callTool(mcp:CallToolParams params) returns mcp:CallToolResult|error {
        mcp:CallToolParams forwarded = params.clone();
        forwarded.name = params.name.substring(self.prefixLength);
        return self.server.callTool(forwarded);
    }

    public isolated function getTools() returns ai:ToolConfig[] => self.tools;
}
