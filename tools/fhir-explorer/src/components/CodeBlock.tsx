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

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import Prism from "prismjs";
import "prismjs/components/prism-json";

// Read-only Prism code block; payloads above this size render as plain text since highlighting them locks the main thread.
const MAX_HIGHLIGHT_CHARS = 1_500_000;

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const html = useMemo(() => {
    if (code.length > MAX_HIGHLIGHT_CHARS) return null;
    const grammar = Prism.languages.json;
    return grammar ? Prism.highlight(code, grammar, "json") : null;
  }, [code]);

  const cls = cn(
    "max-h-[600px] overflow-auto rounded-md border bg-card p-3 font-mono text-xs leading-relaxed",
    className,
  );
  if (html === null) return <pre className={cls}>{code}</pre>;
  // Safe: Prism.highlight HTML-escapes token content before wrapping it in spans.
  return <pre className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}
