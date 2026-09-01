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

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActiveChat } from "@/components/fhir-chat/ActiveChat";
import { currentActivity, followUpSuggestions } from "@/components/fhir-chat/chat-state";
import { ChatHeader } from "@/components/fhir-chat/ChatHeader";
import { EmptyChat } from "@/components/fhir-chat/EmptyChat";
import { Button } from "@/components/ui/button";
import { ChatRateLimitError, parseChatLimit } from "@/lib/chat-rate-limit";
import type { FhirChatMessage } from "@/lib/fhir-chat-types";
import { cn } from "@/lib/utils";

const STARTER_QUESTIONS = [
  "What can I ask about this FHIR server?",
  "Summarize key Patient capabilities in a compact Markdown table.",
  "How many Patient resources are available?",
  "Show the five most recently updated Observations.",
];

interface FhirChatProps {
  baseUrl: string;
}

export function FhirChat({ baseUrl }: FhirChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ baseUrl }),
        // The transport otherwise swallows the HTTP status; surface the
        // per-minute 429 as a typed error carrying its Retry-After.
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (response.status === 429) {
            throw new ChatRateLimitError(Number(response.headers.get("Retry-After")) || 60);
          }
          return response;
        },
      }),
    [baseUrl],
  );
  const { messages, sendMessage, setMessages, status, stop, error, clearError } =
    useChat<FhirChatMessage>({ transport });

  // A gateway guardrail block (out of scope) is keyed on the first user message,
  // so leaving it in history would re-block every later turn. Drop the blocked
  // user turn so the conversation can continue.
  useEffect(() => {
    if (error && parseChatLimit(error)?.kind === "blocked") {
      setMessages((prev) => {
        const next = [...prev];
        while (next.length && next[next.length - 1].role === "user") next.pop();
        return next;
      });
    }
  }, [error, setMessages]);

  const busy = status === "submitted" || status === "streaming";
  const hasConversation = messages.length > 0;
  const suggestions = hasConversation ? followUpSuggestions(messages) : STARTER_QUESTIONS;
  const showFollowUps = !busy && messages.at(-1)?.role === "assistant";
  const activity = currentActivity(messages, status);

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    clearError();
    void sendMessage({ text: question });
    setInput("");
  }

  const composerProps = {
    input,
    busy,
    status,
    onInputChange: setInput,
    onSubmit: ask,
    onStop: stop,
  };

  return (
    <>
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "fixed right-5 bottom-5 z-40 size-12 rounded-full shadow-lg transition-transform hover:scale-105",
          open && "scale-0",
        )}
        aria-label="Open FHIR assistant"
      >
        <MessageCircle className="size-5" />
      </Button>

      <section
        aria-label="FHIR assistant"
        aria-hidden={!open}
        className={cn(
          "fixed right-4 bottom-4 z-50 flex h-[min(720px,calc(100vh-2rem))] w-[min(420px,calc(100vw-2rem))] origin-bottom-right flex-col overflow-hidden rounded-xl border bg-card shadow-2xl transition-all duration-200",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-3 scale-95 opacity-0",
        )}
      >
        <ChatHeader
          baseUrl={baseUrl}
          hasMessages={hasConversation}
          onClear={() => setMessages([])}
          onClose={() => setOpen(false)}
        />
        {!hasConversation && (
          <EmptyChat {...composerProps} suggestions={suggestions} onSelectSuggestion={ask} />
        )}
        {hasConversation && (
          <ActiveChat
            {...composerProps}
            messages={messages}
            suggestions={suggestions}
            showFollowUps={showFollowUps}
            activity={activity}
            error={error}
            onClearError={clearError}
            onSelectSuggestion={ask}
          />
        )}
      </section>
    </>
  );
}
