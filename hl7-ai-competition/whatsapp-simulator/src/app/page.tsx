"use client";

import ky from "ky";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { sampleQuestionnaire } from "@/lib/sample";

interface SessionSummary {
  id: string;
  patientId?: string;
  patientName?: string;
  title: string;
  status: string;
  createdAt: string;
  path: string;
}

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);

  const loadSessions = React.useCallback(async () => {
    try {
      const res = await ky.get("/api/sessions", { throwHttpErrors: false });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions: SessionSummary[] };
      setSessions(data.sessions);
    } catch {
      // best-effort; leave the list as-is
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function launchDemo() {
    setBusy(true);
    setError(null);
    try {
      const res = await ky.post("/api/sessions", {
        json: {
          questionnaire: sampleQuestionnaire,
          callbackUrl: new URL(
            "/api/demo-callback",
            window.location.origin,
          ).toString(),
        },
        throwHttpErrors: false,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Could not create the demo session.");
        return;
      }
      const data = (await res.json()) as { path: string };
      router.push(data.path);
    } catch {
      setError("Could not create the demo session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">WhatsApp Simulator</h1>
        <p className="text-muted-foreground">
          Renders a pushed questionnaire as a chat, collects the replies, and
          posts the conversation transcript back to the caller&apos;s callback
          URL.
        </p>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          An upstream system POSTs{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            {"{ questionnaire, callbackUrl }"}
          </code>{" "}
          to <code className="rounded bg-muted px-1 py-0.5">/api/sessions</code>
          .
        </li>
        <li>The patient opens the returned link and answers in chat.</li>
        <li>
          The conversation transcript is POSTed to the callback URL on End
          conversation.
        </li>
      </ol>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button onClick={launchDemo} disabled={busy}>
            {busy ? "Starting..." : "Launch demo questionnaire"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Chats</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={session.path}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {session.patientName ?? session.patientId ?? session.id}
                    </span>
                    <span className="text-muted-foreground">
                      {session.title}
                    </span>
                  </span>
                  <span
                    className={
                      session.status === "completed"
                        ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600"
                        : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600"
                    }
                  >
                    {session.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
