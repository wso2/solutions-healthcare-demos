// A small MCP server over NCBI E-utilities, so the agents can ground their reasoning in the literature.
// It holds no patient data: the agents send it search terms, never identifiers.

# Port the MCP server listens on (the MCP endpoint is /mcp).
configurable int port = 8000;

# NCBI E-utilities base URL.
configurable string eutilsBaseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

# Optional NCBI API key: raises the rate limit from 3 to 10 requests per second.
configurable string ncbiApiKey = "";

# Tool name NCBI asks callers to identify themselves with.
configurable string ncbiTool = "wso2-ehr-lab-agents";

# Contact email NCBI asks for, so they can reach the operator before blocking a misbehaving client.
configurable string ncbiEmail = "";

# Most articles one search returns.
configurable int maxResultsCap = 10;

# Longest abstract returned, in characters.
configurable int maxAbstractChars = 4000;
