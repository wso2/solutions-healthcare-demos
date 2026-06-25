import type { Questionnaire } from "@/lib/questionnaire";
import type { ChatMessage } from "@/lib/transcript";

export enum SessionStatus {
  Pending = "pending",
  Completed = "completed",
}

export interface Session {
  id: string;
  questionnaire: Questionnaire;
  callbackUrl: string;
  status: SessionStatus;
  createdAt: string;
  messages?: ChatMessage[];
  completedAt?: string;
  deliveryError?: string;
}

const globalForSessions = globalThis as unknown as {
  __whatsappSimulatorSessions?: Map<string, Session>;
};

const sessions: Map<string, Session> =
  globalForSessions.__whatsappSimulatorSessions ?? new Map<string, Session>();

globalForSessions.__whatsappSimulatorSessions = sessions;

export function createSession(
  questionnaire: Questionnaire,
  callbackUrl: string,
  now: string,
): Session {
  const session: Session = {
    id: crypto.randomUUID(),
    questionnaire,
    callbackUrl,
    status: SessionStatus.Pending,
    createdAt: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}
