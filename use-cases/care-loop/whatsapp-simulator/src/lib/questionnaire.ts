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

const nonEmpty = z.string().trim().min(1);

const questionSchema = z.object({
  id: nonEmpty,
  text: nonEmpty,
});

export const questionnaireSchema = z.object({
  title: nonEmpty,
  description: z.string().optional(),
  questions: z
    .array(questionSchema)
    .min(1)
    .refine(
      (questions) =>
        new Set(questions.map((q) => q.id)).size === questions.length,
      {
        message: "question ids must be unique",
      },
    ),
});

export type Questionnaire = z.infer<typeof questionnaireSchema>;
