// Why an agent step failed, in plain words. The integration appends the AI gateway's reply to an agent
// failure ("· AI gateway HTTP 429: …"); the status says which control acted.

export type FailureKind = 'budget' | 'tokens' | 'rate' | 'permission' | 'credit' | 'upstream' | 'gateway' | 'unknown'

export interface AgentFailure {
  kind: FailureKind
  title: string
  explanation: string
  /** A policy refused the call on purpose (a budget or a permission), rather than something breaking. */
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
    return { ...base, kind: 'credit', governed: false, title: 'The AI provider account is out of credit',
      explanation: 'The model provider refused the call: the API key has no credit left. Top up the account, then try again.' }
  }
  if (status === 429 || reply.includes('quota') || reply.includes('rate limit')) {
    if (reply.includes('cost')) {
      return { ...base, kind: 'budget', governed: true, title: 'Daily AI budget reached',
        explanation: 'This agent has spent its budget for the day, so the AI gateway stopped the call. Raise the budget, then try again.' }
    }
    if (reply.includes('token')) {
      return { ...base, kind: 'tokens', governed: true, title: 'Hourly AI usage limit reached',
        explanation: 'This agent has used its tokens for the hour, so the AI gateway stopped the call. Wait for the window to reset, then try again.' }
    }
    return { ...base, kind: 'rate', governed: true, title: 'Too many requests',
      explanation: 'The AI gateway is throttling this agent’s calls. Try again in a moment.' }
  }
  if (status === 401 || status === 403) {
    return { ...base, kind: 'permission', governed: true, title: 'Not permitted',
      explanation: 'The AI gateway did not accept this agent’s credentials for the call.' }
  }
  if (status === 502 || status === 503 || status === 504 || reply.includes('timeout') || reply.includes('connection termination') || reply.includes('upstream')) {
    return { ...base, kind: 'upstream', governed: false, title: 'The model call did not complete',
      explanation: 'The connection to the model closed or timed out before an answer came back. Try again; fewer records finish sooner.' }
  }
  if (!status && reply.includes('unexpected response format')) {
    return { ...base, kind: 'gateway', governed: false, title: 'The AI service answered with an error',
      explanation: 'The model call was not accepted. Try again.' }
  }
  if (status) {
    return { ...base, kind: 'gateway', governed: false, title: 'The AI service answered with an error',
      explanation: 'The model call was not accepted. The details have the reply.' }
  }
  return { ...base, kind: 'unknown', governed: false, title: 'The AI could not finish',
    explanation: 'The run stopped before it produced an answer. Try again.' }
}
