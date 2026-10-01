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

export const sampleQuestionnaire: Questionnaire = {
  title: "Daily heart check-in",
  description: "A quick check-in from your care team. It takes about a minute.",
  questions: [
    {
      id: "chest_pain",
      text: "Have you had any **chest pain** today? If so, what did it feel like?",
    },
    {
      id: "breathlessness",
      text: "How is your breathlessness today — _none_, _mild_, _moderate_, or _severe_?",
    },
    {
      id: "weight_kg",
      text: "What is your weight this morning, in **kg**?",
    },
    {
      id: "notes",
      text: "Anything else you would like your care team to know?",
    },
  ],
};
