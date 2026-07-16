"use client";

import type { Message, Outcome, Phase } from "@/lib/chat";
import type { Questionnaire } from "@/lib/questionnaire";
import type { SessionMode } from "@/lib/sessions";

import type { ReplyRef } from "@/lib/transcript";
import ky from "ky";
import { ArrowLeft, Send, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Notice, Status } from "@/components/chat/chat-status";
import { MessageRow } from "@/components/chat/message-row";
import {
  BOT_INITIALS,
  BOT_NAME,
  introMessages,
  liveIntroMessages,
  now,
} from "@/lib/chat";

interface TurnResult {
  done: boolean;
  botMessages: Array<{ text: string; questionId?: string }>;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// How long the typing indicator sits before a bubble lands, scaled to its length so longer
// messages read as taking longer to type. Capped so nothing feels sluggish.
function typingDelay(text: string): number {
  return Math.min(1100, 350 + text.length * 9);
}

export function QuestionnaireChat({ id }: { id: string }) {
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [mode, setMode] = React.useState<SessionMode>("scripted");
  const [questionnaire, setQuestionnaire] =
    React.useState<Questionnaire | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const [waiting, setWaiting] = React.useState(false);
  const [replyingTo, setReplyingTo] = React.useState<ReplyRef | null>(null);
  const [activeQuestion, setActiveQuestion] = React.useState<ReplyRef | null>(
    null,
  );
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  // The auto-submit on a live "done" turn fires after a delay, so it reads the
  // latest transcript from a ref rather than a stale render closure.
  const messagesRef = React.useRef<Message[]>([]);
  // Stops any in-flight bubble reveal from touching state after the chat unmounts.
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, waiting]);

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
          mode?: SessionMode;
          questionnaire: Questionnaire;
        };
        if (cancelled) return;

        const sessionMode: SessionMode =
          data.mode === "live" ? "live" : "scripted";
        setMode(sessionMode);
        setQuestionnaire(data.questionnaire);

        if (sessionMode === "live") {
          const intro = liveIntroMessages(data.questionnaire);
          // The collector seeds exactly one opening question; make it active so
          // the first plain reply is auto-tagged with its id.
          const opening = [...intro]
            .reverse()
            .find((message) => message.questionId);
          if (data.status === "completed") {
            setMessages(intro);
            setOutcome({ delivered: true });
            setPhase("done");
            return;
          }
          setPhase("active");
          // Play the opening bubbles in one at a time with a typing indicator so a
          // fresh chat reads like the care team is messaging, not a form dump.
          await revealBotMessages(
            intro.map((message) => ({
              text: message.text,
              questionId: message.questionId,
            })),
          );
          if (cancelled) return;
          if (opening?.questionId) {
            setActiveQuestion({
              questionId: opening.questionId,
              questionText: opening.text,
            });
          }
          return;
        }

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

  // Drops bot bubbles in sequentially, each preceded by the typing indicator, so a turn that
  // returns several messages arrives like a person typing rather than all at once.
  async function revealBotMessages(
    bots: Array<{ text: string; questionId?: string }>,
  ) {
    for (const bot of bots) {
      if (cancelledRef.current) return;
      setWaiting(true);
      await sleep(typingDelay(bot.text));
      if (cancelledRef.current) return;
      setWaiting(false);
      setMessages((prev) => [
        ...prev,
        {
          key: `b-${prev.length}`,
          role: "bot" as const,
          text: bot.text,
          time: now(),
          questionId: bot.questionId,
        },
      ]);
      await sleep(260);
    }
    if (!cancelledRef.current) setWaiting(false);
  }

  function send() {
    const trimmed = draft.trim();
    if (trimmed === "") return;
    if (mode === "live") {
      if (waiting) return;
      void sendLive(trimmed);
      return;
    }
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

  async function sendLive(trimmed: string) {
    const questionId = activeQuestion?.questionId;
    setDraft("");
    resetInputHeight();
    setMessages((prev) => [
      ...prev,
      {
        key: `u-${prev.length}`,
        role: "user",
        text: trimmed,
        time: now(),
        questionId,
      },
    ]);
    // Clear the answered question so nothing new tags onto it while the reply is in flight.
    setActiveQuestion(null);
    setWaiting(true);
    try {
      const res = await ky.post(`/api/sessions/${id}/messages`, {
        json: { text: trimmed },
        throwHttpErrors: false,
      });
      if (!res.ok) {
        setWaiting(false);
        return;
      }
      const data = (await res.json()) as TurnResult;
      // Reveal the reply one bubble at a time; the indicator stays up from the request
      // through the typing delay, so the wait always reads as the care team responding.
      await revealBotMessages(data.botMessages);
      if (cancelledRef.current) return;
      // The next plain reply auto-tags with the newest bot question's id. The live agent
      // never signals "done" - the chat stays open for follow-up questions after the
      // clinical check-in finishes, so there is no auto-submit here.
      const nextQuestion = [...data.botMessages]
        .reverse()
        .find((bot) => bot.questionId);
      setActiveQuestion(
        nextQuestion?.questionId
          ? {
              questionId: nextQuestion.questionId,
              questionText: nextQuestion.text,
            }
          : null,
      );
    } catch {
      setWaiting(false);
    }
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
          messages: messagesRef.current.map(
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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#ececed] px-4">
          <Link
            href="/"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#8a8a8e] transition hover:bg-[#ececed] hover:text-[#0a0a0a]"
          >
            <ArrowLeft className="size-[18px]" />
          </Link>
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
              large={mode === "live"}
              canReply={
                mode !== "live" &&
                message.role === "bot" &&
                Boolean(message.questionId) &&
                phase === "active"
              }
              onReply={() => startReply(message)}
            />
          ))}
          {waiting && (
            <div className="mt-3 flex items-start gap-[9px]">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e4e4e7] text-[11px] font-semibold text-[#52525b]">
                {BOT_INITIALS}
              </div>
              <div className="flex items-center gap-1 rounded-[13px] rounded-bl-[4px] bg-[#f4f4f5] px-3.5 py-3.5">
                <span className="size-1.5 animate-bounce rounded-full bg-[#a1a1aa] [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#a1a1aa] [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#a1a1aa]" />
              </div>
            </div>
          )}
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
                  disabled={waiting}
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
                  className={`max-h-[120px] flex-1 resize-none bg-transparent py-[5px] leading-normal outline-none placeholder:text-[#a1a1aa] disabled:opacity-60 ${
                    mode === "live" ? "text-base" : "text-sm"
                  }`}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={waiting}
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[#0a0a0a] text-[#fafafa] disabled:opacity-50"
                >
                  <Send className="size-[15px]" />
                </button>
              </div>
              {mode === "scripted" && (
                <button
                  type="button"
                  onClick={end}
                  disabled={waiting || !hasReply}
                  className="mt-2 w-full rounded-[10px] border border-[#e4e4e7] bg-white py-2 text-sm text-[#0a0a0a] transition hover:bg-[#f7f7f8] disabled:opacity-50 disabled:hover:bg-white"
                >
                  End conversation
                </button>
              )}
            </>
          ) : (
            <Status phase={phase} outcome={outcome} />
          )}
        </div>
      </div>
    </div>
  );
}
