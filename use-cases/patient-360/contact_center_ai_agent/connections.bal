import ballerinax/ai.anthropic;

final anthropic:ModelProvider _CallCenterAgentModel = check new (ANTHROPIC_API_KEY, "claude-sonnet-4-20250514", maxTokens = 1028);
