import type { Questionnaire } from "@/lib/questionnaire";
import type { ReplyRef } from "@/lib/transcript";

export type Phase =
  | "loading"
  | "notfound"
  | "active"
  | "submitting"
  | "done"
  | "error";

export interface Message {
  key: string;
  role: "bot" | "user";
  text: string;
  time: string;
  questionId?: string;
  replyTo?: ReplyRef;
}

export interface Outcome {
  delivered: boolean;
  deliveryError?: string;
}

export const BOT_NAME = "Care Team";
export const BOT_INITIALS = "CL";

export function introMessages(questionnaire: Questionnaire): Message[] {
  const time = now();
  const intro: Message[] = [
    {
      key: "greeting",
      role: "bot",
      text: "Hi, your care team has a few questions. Hover a question to reply to it, then tap End conversation when you are done.",
      time,
    },
  ];
  if (questionnaire.description) {
    intro.push({
      key: "description",
      role: "bot",
      text: questionnaire.description,
      time,
    });
  }
  for (const question of questionnaire.questions) {
    intro.push({
      key: `q-${question.id}`,
      role: "bot",
      text: question.text,
      time,
      questionId: question.id,
    });
  }
  return intro;
}

export function liveIntroMessages(questionnaire: Questionnaire): Message[] {
  const time = now();
  const intro: Message[] = [
    {
      key: "greeting",
      role: "bot",
      text: "Hi, your care team has a few questions. Reply here whenever you are ready.",
      time,
    },
  ];
  if (questionnaire.description) {
    intro.push({
      key: "description",
      role: "bot",
      text: questionnaire.description,
      time,
    });
  }
  for (const question of questionnaire.questions) {
    intro.push({
      key: `q-${question.id}`,
      role: "bot",
      text: question.text,
      time,
      questionId: question.id,
    });
  }
  return intro;
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function now(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
