import { z } from "zod";

const replyRefSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
});

const chatMessageSchema = z.object({
  role: z.enum(["bot", "user"]),
  text: z.string(),
  time: z.string(),
  questionId: z.string().optional(),
  replyTo: replyRefSchema.optional(),
});

export const submitSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
});

export type ReplyRef = z.infer<typeof replyRefSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export interface CallbackPayload {
  sessionId: string;
  title: string;
  messages: ChatMessage[];
}
