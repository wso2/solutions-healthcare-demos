import type { Questionnaire } from "@/lib/questionnaire";
import type { ChatMessage } from "@/lib/transcript";

export enum SessionStatus {
  Pending = "pending",
  Completed = "completed",
}

export type SessionMode = "scripted" | "live";

export interface Session {
  id: string;
  questionnaire: Questionnaire;
  callbackUrl: string;
  status: SessionStatus;
  createdAt: string;
  mode: SessionMode;
  turnUrl?: string;
  messages?: ChatMessage[];
  completedAt?: string;
  deliveryError?: string;
  patientId?: string;
  patientName?: string;
}

const sessions = new Map<string, Session>();

export function createSession(
  questionnaire: Questionnaire,
  callbackUrl: string,
  now: string,
  patientId?: string,
  patientName?: string,
  mode: SessionMode = "scripted",
  turnUrl?: string,
): Session {
  const session: Session = {
    id: crypto.randomUUID(),
    questionnaire,
    callbackUrl,
    status: SessionStatus.Pending,
    createdAt: now,
    mode,
    turnUrl,
    patientId,
    patientName,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function listSessions(): Session[] {
  return Array.from(sessions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
