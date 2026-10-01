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
