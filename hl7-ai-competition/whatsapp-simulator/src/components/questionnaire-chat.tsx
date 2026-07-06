"use client";

import type { Message, Outcome, Phase } from "@/lib/chat";
import type { Questionnaire } from "@/lib/questionnaire";

import type { ReplyRef } from "@/lib/transcript";
import ky from "ky";
import { Send, X } from "lucide-react";
import * as React from "react";

import { Notice, Status } from "@/components/chat/chat-status";
import { MessageRow } from "@/components/chat/message-row";
import { BOT_INITIALS, BOT_NAME, introMessages, now } from "@/lib/chat";

export function QuestionnaireChat({ id }: { id: string }) {
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [questionnaire, setQuestionnaire] =
    React.useState<Questionnaire | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const [replyingTo, setReplyingTo] = React.useState<ReplyRef | null>(null);
  const [activeQuestion, setActiveQuestion] = React.useState<ReplyRef | null>(
    null,
  );
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await ky.get(`/api/sessions/${id}`, {
          throwHttpErrors: false,
        });
        if (res.status === 404) {
          if (!cancelled) setPhase("notfound");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setPhase("error");
          return;
        }
        const data = (await res.json()) as {
          status: string;
          questionnaire: Questionnaire;
        };
        if (cancelled) return;

        setQuestionnaire(data.questionnaire);
        setMessages(introMessages(data.questionnaire));
        setPhase(data.status === "completed" ? "done" : "active");
        if (data.status === "completed") {
          setOutcome({ delivered: true });
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function resetInputHeight() {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
    }
  }

  function autoSize() {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }

  function send() {
    const trimmed = draft.trim();
    if (trimmed === "") return;
    const reply = replyingTo ?? undefined;
    setDraft("");
    setReplyingTo(null);
    if (reply) {
      setActiveQuestion(reply);
    }
    resetInputHeight();
    setMessages((prev) => [
      ...prev,
      {
        key: `u-${prev.length}`,
        role: "user",
        text: trimmed,
        time: now(),
        // A plain follow-up carries the active question's id (no quote UI) so it bundles into the same answer until the next explicit reply.
        replyTo: reply,
        questionId: reply ? undefined : activeQuestion?.questionId,
      },
    ]);
  }

  function startReply(message: Message) {
    if (!message.questionId) return;
    setReplyingTo({
      questionId: message.questionId,
      questionText: message.text,
    });
    inputRef.current?.focus();
  }

  async function end() {
    setPhase("submitting");
    try {
      const res = await ky.post(`/api/sessions/${id}/submit`, {
        json: {
          messages: messages.map(
            ({ role, text, time, questionId, replyTo }) => ({
              role,
              text,
              time,
              questionId,
              replyTo,
            }),
          ),
        },
        throwHttpErrors: false,
      });
      const data = (await res.json()) as Outcome & { error?: string };
      if (!res.ok) {
        setPhase("error");
        return;
      }
      setOutcome({
        delivered: data.delivered,
        deliveryError: data.deliveryError,
      });
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return <Notice text="Loading questionnaire..." />;
  }
  if (phase === "notfound") {
    return <Notice text="This questionnaire link is invalid or expired." />;
  }

  const hasReply = messages.some((message) => message.role === "user");

  return (
    <div
      className="flex h-dvh flex-col items-center bg-white text-[#0a0a0a] antialiased"
      style={{ letterSpacing: "-0.006em" }}
    >
      <div className="flex h-full w-full min-w-0 max-w-[760px] flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-[#ececed] px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] text-xs font-semibold text-white">
              {BOT_INITIALS}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-[550]">
                {questionnaire?.title}
              </div>
              <div className="flex items-center gap-1.5 text-xs leading-tight text-[#8a8a8e]">
                <span className="inline-block size-[5px] rounded-full bg-[#0a0a0a]" />
                Online
              </div>
            </div>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-4 pb-2 pt-5"
        >
          {messages.map((message, index) => (
            <MessageRow
              key={message.key}
              message={message}
              previous={messages[index - 1]}
              canReply={
                message.role === "bot" &&
                Boolean(message.questionId) &&
                phase === "active"
              }
              onReply={() => startReply(message)}
            />
          ))}
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2">
          {phase === "active" ? (
            <>
              {replyingTo && (
                <div className="mb-[7px] flex items-center justify-between gap-2.5 rounded-lg border border-[#ececed] bg-[#f7f7f8] px-[11px] py-[7px]">
                  <div className="flex min-w-0 items-center gap-[9px]">
                    <div className="h-7 w-0.5 shrink-0 rounded-[3px] bg-[#0a0a0a]" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium">
                        Replying to {BOT_NAME}
                      </div>
                      <div className="truncate text-xs text-[#8a8a8e]">
                        {replyingTo.questionText}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-[#8a8a8e] transition hover:bg-[#ececed] hover:text-[#0a0a0a]"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 rounded-[10px] border border-[#e4e4e7] bg-white py-[7px] pl-[13px] pr-[7px]">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    autoSize();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Message ${BOT_NAME}…`}
                  className="max-h-[120px] flex-1 resize-none bg-transparent py-[5px] text-sm leading-normal outline-none placeholder:text-[#a1a1aa]"
                />
                <button
                  type="button"
                  onClick={send}
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[#0a0a0a] text-[#fafafa]"
                >
                  <Send className="size-[15px]" />
                </button>
              </div>
              <button
                type="button"
                onClick={end}
                disabled={!hasReply}
                className="mt-2 w-full rounded-[10px] border border-[#e4e4e7] bg-white py-2 text-sm text-[#0a0a0a] transition hover:bg-[#f7f7f8] disabled:opacity-50 disabled:hover:bg-white"
              >
                End conversation
              </button>
            </>
          ) : (
            <Status phase={phase} outcome={outcome} />
          )}
        </div>
      </div>
    </div>
  );
}
