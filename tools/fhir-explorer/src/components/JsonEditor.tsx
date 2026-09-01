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
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { cn } from "@/lib/utils";

/** CodeMirror-based JSON editor: syntax highlighting plus inline lint squiggles from jsonParseLinter, with the first parse error repeated below. */

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
  ariaLabel?: string;
}

export function JsonEditor({ value, onChange, rows = 14, className, ariaLabel }: Props) {
  const extensions = useMemo(
    () => [
      json(),
      linter(jsonParseLinter()),
      EditorView.lineWrapping,
      // Inherit the surrounding card background and match the app's mono sizing.
      EditorView.theme({
        "&": { backgroundColor: "transparent", fontSize: "0.75rem" },
        ".cm-gutters": { backgroundColor: "transparent" },
      }),
      EditorView.contentAttributes.of({ "aria-label": ariaLabel ?? "JSON body" }),
    ],
    [ariaLabel],
  );

  const jsonError = useMemo(() => {
    if (!value.trim()) return null;
    try {
      JSON.parse(value);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [value]);

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "overflow-hidden rounded-md border bg-card focus-within:ring-1 focus-within:ring-ring",
          jsonError && "border-destructive/60",
          className,
        )}
      >
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          maxHeight={`${rows * 1.625}em`}
          basicSetup={{
            foldGutter: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
        />
      </div>
      {jsonError && (
        <p className="text-xs text-destructive" role="status">
          {jsonError}
        </p>
      )}
    </div>
  );
}
