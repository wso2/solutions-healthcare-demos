// Why an agent step failed, in words a presenter can say out loud. The integration appends the AI
// gateway's reply to an agent failure ("· AI gateway HTTP 429: …"); the status says which control acted.

export type FailureKind = 'budget' | 'tokens' | 'rate' | 'permission' | 'credit' | 'upstream' | 'gateway' | 'unknown'

export interface AgentFailure {
  kind: FailureKind
  title: string
  explanation: string
  /** Agent Manager refused the call on purpose (a budget or a permission), rather than something breaking. */
  governed: boolean
  status?: number
  raw: string
}

const COPILOT_PREFIX = 'I could not finish: '

export const isCopilotFailure = (text: string) => text.startsWith(COPILOT_PREFIX)

export function classifyAgentFailure(message: string): AgentFailure {
  const raw = message.startsWith(COPILOT_PREFIX) ? message.slice(COPILOT_PREFIX.length) : message
  const match = raw.match(/AI gateway HTTP (\d{3}):?\s*(.*)$/)
  const status = match ? Number(match[1]) : undefined
  const reply = (match?.[2] ?? raw).toLowerCase()
  const base = { raw, status }

  if (reply.includes('credit balance')) {
    return { ...base, kind: 'credit', governed: false, title: 'The Anthropic account is out of credit',
      explanation: 'Anthropic refused the model call: the API key has no credit left. Top up the account, then ask again.' }
  }
  if (status === 429 || reply.includes('quota') || reply.includes('rate limit')) {
    if (reply.includes('cost')) {
      return { ...base, kind: 'budget', governed: true, title: 'Daily budget reached — stopped by Agent Manager',
        explanation: 'This agent has spent its US$ budget for the day. The AI gateway refused the model call before it reached Claude. Raise the budget on the agent’s model configuration, then retry.' }
    }
    if (reply.includes('token')) {
      return { ...base, kind: 'tokens', governed: true, title: 'Hourly token limit reached — stopped by Agent Manager',
        explanation: 'This agent has used its tokens for the hour. The AI gateway refused the model call before it reached Claude. Wait for the window to reset or raise the limit, then retry.' }
    }
    return { ...base, kind: 'rate', governed: true, title: 'Rate limited by the AI gateway',
      explanation: 'Agent Manager’s AI gateway is throttling this agent’s model calls. Retry in a moment.' }
  }
  if (status === 401 || status === 403) {
    return { ...base, kind: 'permission', governed: true, title: 'Not permitted — refused by Agent Manager',
      explanation: 'The gateway did not accept this agent’s credentials for the call. Check the agent’s key and roles in Agent Manager.' }
  }
  if (status === 502 || status === 503 || status === 504 || reply.includes('timeout') || reply.includes('connection termination') || reply.includes('upstream')) {
    return { ...base, kind: 'upstream', governed: false, title: 'The model call did not complete',
      explanation: 'The AI gateway reached Anthropic, but the connection closed or timed out before an answer came back. Nothing was refused by policy. Ask again; a narrower question finishes sooner.' }
  }
  if (!status && reply.includes('unexpected response format')) {
    return { ...base, kind: 'gateway', governed: false, title: 'The AI gateway answered with an error',
      explanation: 'The model provider reports any error reply from the gateway as “unexpected response format”. This run was recorded before failures kept the HTTP status; new failures show it, and whether a budget or a permission refused the call.' }
  }
  if (status) {
    return { ...base, kind: 'gateway', governed: false, title: `The AI gateway answered HTTP ${status}`,
      explanation: 'The model call was not accepted. The details below have the gateway’s reply.' }
  }
  return { ...base, kind: 'unknown', governed: false, title: 'The agent could not finish',
    explanation: 'The run stopped before it produced an answer. The details below have the reason the integration recorded.' }
}
