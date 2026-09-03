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

import { Check, Clock, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatComposer, PoweredBy, SuggestionButtons } from "./ChatComposer";
import { describeTool, isToolPart } from "./chat-state";
import { type ChatLimit, parseChatLimit } from "@/lib/chat-rate-limit";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Spinner } from "@/components/ui/spinner";
import type {
  ChatComposerProps,
  FhirChatMessage,
  FhirChatMessageMetadata,
} from "@/lib/fhir-chat-types";

interface ActiveChatProps extends Omit<ChatComposerProps, "compact"> {
  messages: FhirChatMessage[];
  suggestions: string[];
  showFollowUps: boolean;
  activity?: string;
  error?: Error;
  onClearError: () => void;
  onSelectSuggestion: (suggestion: string) => void;
}

interface ChatMessagePartProps {
  messageId: string;
  part: FhirChatMessage["parts"][number];
  index: number;
}

interface WorkloadSummaryProps {
  metadata?: FhirChatMessageMetadata;
}

function AssistantActivity({ label }: { label: string }) {
  return (
    <Message from="assistant">
      <MessageContent>
        <div
          role="status"
          aria-live="polite"
          className="flex w-fit items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground"
        >
          <Spinner className="size-3.5 text-primary" />
          <span>{label}</span>
          <span aria-hidden="true" className="animate-pulse tracking-widest">
            ...
          </span>
        </div>
      </MessageContent>
    </Message>
  );
}

function WorkloadSummary({ metadata }: WorkloadSummaryProps) {
  if (!metadata) return null;

  const seconds = (metadata.elapsedMs / 1000).toFixed(1);
  const calls = `${metadata.fhirCalls} FHIR ${metadata.fhirCalls === 1 ? "call" : "calls"}`;
  const tokens =
    typeof metadata.totalTokens === "number"
      ? `${metadata.totalTokens.toLocaleString()} tokens`
      : undefined;

  return (
    <p className="mt-2 text-[11px] text-muted-foreground">
      {[calls, `${seconds}s`, tokens].filter(Boolean).join(" · ")}
    </p>
  );
}

function ChatMessagePart({ messageId, part, index }: ChatMessagePartProps) {
  const key = `${messageId}-${part.type}-${index}`;

  if (part.type === "text") {
    return (
      <MessageResponse key={key} className="max-w-full [&_code]:break-words [&_table]:text-xs">
        {part.text}
      </MessageResponse>
    );
  }

  if (!isToolPart(part)) return null;
  const state = "state" in part ? part.state : undefined;
  if (state !== "output-available") return null;

  return (
    <div
      key={key}
      className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
    >
      <Check className="size-3.5 shrink-0 text-emerald-600" />
      <span>{describeTool(part)}</span>
    </div>
  );
}

function ChatMessage({ message }: { message: FhirChatMessage }) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => (
          <ChatMessagePart
            key={`${message.id}-${part.type}-${index}`}
            messageId={message.id}
            part={part}
            index={index}
          />
        ))}
        {message.role === "assistant" && <WorkloadSummary metadata={message.metadata} />}
      </MessageContent>
    </Message>
  );
}

// Ticks toward `until` (epoch ms), firing onExpire once at zero. The callback is
// held in a ref so an unstable prop can't restart the countdown each render.
function useCountdown(until: number | null, onExpire: () => void): number {
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });
  const secondsLeft = () => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0);
  const [remaining, setRemaining] = useState(secondsLeft);

  useEffect(() => {
    if (!until) return;
    setRemaining(secondsLeft());
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);

  return remaining;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBudgetReset(resetAt: string | null): string {
  if (!resetAt) return "Your limit resets at the start of the next window.";
  const reset = new Date(resetAt);
  const remainingMs = reset.getTime() - Date.now();
  if (remainingMs <= 0) return "Your limit should reset shortly.";
  const days = Math.ceil(remainingMs / 86_400_000);
  const when = days <= 1 ? "within a day" : `in ${days} days`;
  const date = reset.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Resets ${when} (${date}).`;
}

// One of three notices: transient per-minute cooldown (with live countdown),
// the persistent weekly spend budget, or a generic failure.
function ChatNotice({
  error,
  limit,
  cooldownRemaining,
}: {
  error?: Error;
  limit: ChatLimit | null;
  cooldownRemaining: number;
}) {
  if (!error) return null;

  if (limit?.kind === "per-minute") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400"
      >
        <Clock className="mt-0.5 size-4 shrink-0" />
        <p>
          You&apos;re sending messages too quickly. You can send again in{" "}
          <span className="font-medium tabular-nums">{formatCountdown(cooldownRemaining)}</span>.
        </p>
      </div>
    );
  }

  if (limit?.kind === "blocked") {
    return (
      <div
        role="alert"
        className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400"
      >
        <p>
          That request was blocked as out of scope. This assistant only answers read-only
          questions about the selected FHIR server — try rephrasing.
        </p>
      </div>
    );
  }

  if (limit?.kind === "weekly-budget") {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
      >
        <Wallet className="mt-0.5 size-4 shrink-0" />
        <p>You&apos;ve reached your AI usage limit for now. {formatBudgetReset(limit.resetAt)}</p>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm text-destructive">
        {error.message || "The assistant could not complete that request."}
      </p>
    </div>
  );
}

export function ActiveChat({
  messages,
  suggestions,
  showFollowUps,
  activity,
  error,
  onClearError,
  input,
  busy,
  status,
  onInputChange,
  onSubmit,
  onStop,
  onSelectSuggestion,
}: ActiveChatProps) {
  const limit = useMemo(() => parseChatLimit(error), [error]);
  const cooldownUntil = useMemo(
    () => (limit?.kind === "per-minute" ? Date.now() + limit.retryAfterSec * 1000 : null),
    [limit],
  );
  const cooldownRemaining = useCountdown(cooldownUntil, onClearError);
  const blocked =
    limit?.kind === "weekly-budget" || (limit?.kind === "per-minute" && cooldownRemaining > 0);
  const blockedLabel =
    limit?.kind === "weekly-budget"
      ? "AI usage limit reached"
      : limit?.kind === "per-minute" && cooldownRemaining > 0
        ? `Rate limited — retry in ${formatCountdown(cooldownRemaining)}`
        : undefined;

  return (
    <>
      <Conversation className="min-h-0 animate-in fade-in duration-300 motion-reduce:animate-none">
        <ConversationContent className="gap-5">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {activity && <AssistantActivity label={activity} />}
          <ChatNotice error={error} limit={limit} cooldownRemaining={cooldownRemaining} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="animate-in border-t bg-card px-3 pt-2 slide-in-from-bottom-3 duration-300 motion-reduce:animate-none">
        {showFollowUps && (
          <div className="pb-2">
            <SuggestionButtons
              suggestions={suggestions}
              busy={busy}
              onSelect={onSelectSuggestion}
              compact
            />
          </div>
        )}
        <ChatComposer
          compact
          input={input}
          busy={busy}
          status={status}
          onInputChange={onInputChange}
          onSubmit={onSubmit}
          onStop={onStop}
          sendDisabled={blocked}
          blockedLabel={blockedLabel}
        />
        <PoweredBy compact />
      </div>
    </>
  );
}
