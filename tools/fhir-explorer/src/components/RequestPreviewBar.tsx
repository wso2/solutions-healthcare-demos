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

/** Shared request-preview bar: highlighted method + truncated path, with the panel's action button(s) in `children`. `framed={false}` drops the border/background so a parent can supply its own frame. */
export function RequestPreviewBar({
  method,
  path,
  children,
  framed = true,
}: {
  method: string;
  path: string;
  children?: ReactNode;
  framed?: boolean;
}) {
  const row = (
    <div className="flex items-center gap-3 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">
        <span className="mr-2 font-semibold text-primary">{method}</span>
        {path}
      </code>
      {children}
    </div>
  );
  if (!framed) return row;
  return <div className="rounded-md border bg-muted/30">{row}</div>;
}
