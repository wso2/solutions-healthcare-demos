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

"use client";

import { ExternalLink } from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import type { ChatComposerProps } from "@/lib/fhir-chat-types";
import { cn } from "@/lib/utils";

interface PoweredByProps {
  compact?: boolean;
}

interface SuggestionButtonsProps {
  suggestions: string[];
  busy: boolean;
  onSelect: (suggestion: string) => void;
  compact?: boolean;
}

export function PoweredBy({ compact = false }: PoweredByProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 text-muted-foreground",
        compact ? "py-1 text-[10px]" : "py-2 text-[11px]",
      )}
    >
      <span>Powered by</span>
      <a
        href="https://github.com/wso2/fhir-mcp-server"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium text-foreground/75 hover:text-primary hover:underline"
      >
        WSO2 FHIR MCP Server
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

export function SuggestionButtons({
  suggestions,
  busy,
  onSelect,
  compact = false,
}: SuggestionButtonsProps) {
  const visibleSuggestions = compact ? suggestions.slice(0, 1) : suggestions;

  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-2")}>
      {visibleSuggestions.map((question) => (
        <Suggestion
          key={question}
          suggestion={question}
          onClick={onSelect}
          disabled={busy}
          className={cn(
            "h-auto whitespace-normal rounded-lg text-left leading-snug",
            compact
              ? "min-h-8 w-full justify-start border-0 bg-muted/60 px-3 py-1.5 text-xs shadow-none hover:bg-muted"
              : "min-h-12 justify-start px-3 py-2.5 text-xs",
          )}
        />
      ))}
    </div>
  );
}

export function ChatComposer({
  compact,
  input,
  busy,
  status,
  onInputChange,
  onSubmit,
  onStop,
  sendDisabled = false,
  blockedLabel,
}: ChatComposerProps) {
  const typingDisabled = busy || sendDisabled;
  const submit = (
    <PromptInputSubmit
      status={status}
      onStop={onStop}
      disabled={!busy && (sendDisabled || !input.trim())}
    />
  );

  return (
    <PromptInput
      onSubmit={({ text }) => {
        if (!sendDisabled) onSubmit(text);
      }}
      className={cn(
        "rounded-xl bg-background shadow-sm transition-[box-shadow,transform] duration-300 focus-within:shadow-md",
        !compact && "border-primary/30 shadow-md",
        sendDisabled && "opacity-60",
      )}
    >
      <PromptInputBody>
        <PromptInputTextarea
          rows={compact ? 1 : 3}
          value={input}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          placeholder={
            sendDisabled && blockedLabel ? blockedLabel : "Ask about the selected FHIR server…"
          }
          disabled={typingDisabled}
          aria-disabled={typingDisabled}
          className={cn(
            "transition-[min-height] duration-300 motion-reduce:transition-none",
            compact ? "!min-h-9 max-h-24 py-2 pl-3" : "min-h-16",
            sendDisabled && "cursor-not-allowed",
          )}
        />
      </PromptInputBody>
      {compact ? (
        <div className="mr-1.5 shrink-0 self-center">{submit}</div>
      ) : (
        <PromptInputFooter className="justify-end">{submit}</PromptInputFooter>
      )}
    </PromptInput>
  );
}
