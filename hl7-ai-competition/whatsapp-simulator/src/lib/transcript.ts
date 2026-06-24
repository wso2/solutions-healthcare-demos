type ChatRole = "bot" | "user";

export interface ReplyRef {
  questionId: string;
  questionText: string;
}

export interface ChatMessage {
  role: ChatRole;
  text: string;
  time: string;
  questionId?: string;
  replyTo?: ReplyRef;
}

export interface CallbackPayload {
  sessionId: string;
  title: string;
  messages: ChatMessage[];
}

export function parseTranscript(input: unknown): ChatMessage[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  return input.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`messages[${index}] must be an object`);
    }
    const { role, text, time, questionId, replyTo } = raw as Record<
      string,
      unknown
    >;
    if (role !== "bot" && role !== "user") {
      throw new Error(`messages[${index}].role must be "bot" or "user"`);
    }
    if (typeof text !== "string") {
      throw new Error(`messages[${index}].text is required`);
    }
    if (typeof time !== "string") {
      throw new Error(`messages[${index}].time is required`);
    }

    const message: ChatMessage = { role, text, time };

    if (questionId !== undefined) {
      if (typeof questionId !== "string") {
        throw new Error(`messages[${index}].questionId must be a string`);
      }
      message.questionId = questionId;
    }

    if (replyTo !== undefined && replyTo !== null) {
      if (typeof replyTo !== "object") {
        throw new Error(`messages[${index}].replyTo must be an object`);
      }
      const ref = replyTo as Record<string, unknown>;
      if (
        typeof ref.questionId !== "string" ||
        typeof ref.questionText !== "string"
      ) {
        throw new Error(
          `messages[${index}].replyTo needs questionId and questionText`,
        );
      }
      message.replyTo = {
        questionId: ref.questionId,
        questionText: ref.questionText,
      };
    }

    return message;
  });
}
