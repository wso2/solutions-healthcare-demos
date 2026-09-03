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

import type { ReactNode } from "react";

/** Two-column layout: form left, sticky response right; stacks vertically below lg. */
export function PanelSplit({ form, response }: { form: ReactNode; response: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="min-w-0 space-y-4">{form}</div>
      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">{response}</div>
    </div>
  );
}
