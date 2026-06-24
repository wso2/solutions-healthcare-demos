"use client";

import type { Question, Questionnaire } from "@/lib/questionnaire";
import type { ReplyRef } from "@/lib/transcript";

import { Reply, Send, X } from "lucide-react";
import * as React from "react";

type Phase =
  | "loading"
  | "notfound"
  | "active"
  | "submitting"
  | "done"
  | "error";

interface Message {
  key: string;
  role: "bot" | "user";
  text: string;
  time: string;
  questionId?: string;
  replyTo?: ReplyRef;
}

interface Outcome {
  delivered: boolean;
  deliveryError?: string;
}

const BOT_NAME = "Care Team";
const BOT_INITIALS = "CL";

export function QuestionnaireChat({ id }: { id: string }) {
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [questionnaire, setQuestionnaire] =
    React.useState<Questionnaire | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const [replyingTo, setReplyingTo] = React.useState<ReplyRef | null>(null);
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
        const res = await fetch(`/api/sessions/${id}`);
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
    resetInputHeight();
    setMessages((prev) => [
      ...prev,
      {
        key: `u-${prev.length}`,
        role: "user",
        text: trimmed,
        time: now(),
        replyTo: reply,
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
      const res = await fetch(`/api/sessions/${id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: messages.map(
            ({ role, text, time, questionId, replyTo }) => ({
              role,
              text,
              time,
              questionId,
              replyTo,
            }),
          ),
        }),
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
            <Row
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

function Row({
  message,
  previous,
  canReply,
  onReply,
}: {
  message: Message;
  previous?: Message;
  canReply: boolean;
  onReply: () => void;
}) {
  const me = message.role === "user";
  const senderChanged = !previous || previous.role !== message.role;
  const showAvatar = !me && senderChanged;

  return (
    <div
      className="group flex items-start gap-[9px]"
      style={{
        marginTop: senderChanged ? 12 : 2,
        flexDirection: me ? "row-reverse" : "row",
      }}
    >
      <div className="w-7 shrink-0">
        {showAvatar && (
          <div className="flex size-7 items-center justify-center rounded-full bg-[#e4e4e7] text-[11px] font-semibold text-[#52525b]">
            {BOT_INITIALS}
          </div>
        )}
      </div>
      <div
        className="flex min-w-0 flex-col"
        style={{ alignItems: me ? "flex-end" : "flex-start" }}
      >
        {message.replyTo && (
          <div
            className="-mb-1 flex max-w-[min(78vw,440px)] gap-1 overflow-hidden whitespace-nowrap border-l-2 border-[#d4d4d8] px-2.5 pb-2 pt-1 text-xs"
            style={{ marginLeft: me ? 0 : 4, marginRight: me ? 4 : 0 }}
          >
            <span className="font-medium opacity-80">{BOT_NAME}</span>
            <span className="opacity-[0.55]">
              {truncate(message.replyTo.questionText, 52)}
            </span>
          </div>
        )}
        <div
          className="flex items-center gap-[7px]"
          style={{ flexDirection: me ? "row-reverse" : "row" }}
        >
          <div
            className={
              me
                ? "max-w-[min(78vw,440px)] whitespace-pre-wrap break-words rounded-[13px] rounded-br-[4px] bg-[#0a0a0a] px-3 py-2 text-sm leading-normal text-[#fafafa]"
                : "max-w-[min(78vw,440px)] whitespace-pre-wrap break-words rounded-[13px] rounded-bl-[4px] bg-[#f4f4f5] px-3 py-2 text-sm leading-normal text-[#18181b]"
            }
          >
            {message.text}
          </div>
          {canReply && (
            <button
              type="button"
              onClick={onReply}
              aria-label="Reply"
              className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[#ececed] bg-white text-[#8a8a8e] opacity-0 transition hover:bg-[#f7f7f8] hover:text-[#0a0a0a] group-hover:opacity-100"
            >
              <Reply className="size-3" />
            </button>
          )}
        </div>
        <div className="mt-[3px] px-[3px] text-[11px] text-[#a1a1aa]">
          {message.time}
        </div>
      </div>
    </div>
  );
}

function Status({ phase, outcome }: { phase: Phase; outcome: Outcome | null }) {
  if (phase === "submitting") {
    return <p className="text-center text-sm text-[#8a8a8e]">Sending...</p>;
  }
  if (phase === "error") {
    return (
      <p className="text-center text-sm text-red-600">
        Something went wrong. Please try again later.
      </p>
    );
  }
  if (outcome && !outcome.delivered) {
    return (
      <p className="text-center text-sm text-amber-600">
        Conversation ended, but the callback could not be reached
        {outcome.deliveryError ? `: ${outcome.deliveryError}` : "."}
      </p>
    );
  }
  return (
    <p className="text-center text-sm text-[#8a8a8e]">
      Conversation ended. Your replies have been sent.
    </p>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-white p-6 text-center text-sm text-[#8a8a8e]">
      {text}
    </div>
  );
}

function introMessages(questionnaire: Questionnaire): Message[] {
  const time = now();
  const intro: Message[] = [
    {
      key: "greeting",
      role: "bot",
      text: "Hi, your care team has a few questions. Hover a question to reply to it, then tap End conversation when you are done.",
      time,
    },
  ];
  if (questionnaire.description) {
    intro.push({
      key: "description",
      role: "bot",
      text: questionnaire.description,
      time,
    });
  }
  for (const question of questionnaire.questions) {
    intro.push({
      key: `q-${question.id}`,
      role: "bot",
      text: questionText(question),
      time,
      questionId: question.id,
    });
  }
  return intro;
}

function questionText(question: Question): string {
  if (question.type === "choice" && question.options) {
    const options = question.options.map((option) => `- ${option}`).join("\n");
    return `${question.text}\n\n${options}`;
  }
  return question.text;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function now(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
