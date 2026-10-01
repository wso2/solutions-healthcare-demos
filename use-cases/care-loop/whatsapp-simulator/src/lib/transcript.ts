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
