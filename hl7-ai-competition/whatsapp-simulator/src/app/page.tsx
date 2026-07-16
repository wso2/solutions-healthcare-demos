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
  mode: "scripted" | "live";
  createdAt: string;
  path: string;
}

type Busy = "scripted" | "live" | null;

// Live sessions can appear at any moment (the healthkit cron runs on its own ~6 minute
// schedule), so the list polls rather than loading once.
const SESSIONS_POLL_MS = 5_000;

// How long to wait, after triggering a vitals cycle, for the real pipeline (vitals -> ML
// risk -> adaptive agent) to open a new live session before giving up.
const LIVE_CHECKIN_TIMEOUT_MS = 45_000;
const LIVE_CHECKIN_POLL_MS = 2_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Busy>(null);
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
    const interval = setInterval(() => void loadSessions(), SESSIONS_POLL_MS);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // Creates a scripted (no-backend) demo chat and returns its path, or null on failure.
  async function createScriptedSession(): Promise<string | null> {
    const callbackUrl = new URL(
      "/api/demo-callback",
      window.location.origin,
    ).toString();
    const res = await ky.post("/api/sessions", {
      json: { questionnaire: sampleQuestionnaire, callbackUrl },
      throwHttpErrors: false,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Could not create the demo session.");
      return null;
    }
    const data = (await res.json()) as { path: string };
    return data.path;
  }

  async function launchScriptedDemo() {
    setBusy("scripted");
    setError(null);
    try {
      const path = await createScriptedSession();
      if (path) router.push(path);
    } catch {
      setError("Could not create the demo session.");
    } finally {
      setBusy(null);
    }
  }

  // Forces a fresh vitals-forward cycle and opens whichever new live session the real
  // pipeline (vitals -> ML risk -> adaptive agent) opens as a result. Never falls back to
  // the scripted demo - if nobody crosses the risk threshold this cycle, that is reported
  // plainly rather than silently substituting a canned questionnaire.
  async function openLiveCheckIn() {
    setBusy("live");
    setError(null);
    try {
      const before = await ky.get("/api/sessions", { throwHttpErrors: false });
      const seenLiveIds = new Set<string>();
      if (before.ok) {
        const data = (await before.json()) as { sessions: SessionSummary[] };
        for (const session of data.sessions) {
          if (session.mode === "live") seenLiveIds.add(session.id);
        }
      }

      const triggerRes = await ky.post("/api/trigger-check", {
        throwHttpErrors: false,
      });
      if (!triggerRes.ok) {
        setError("Could not trigger the vitals check.");
        return;
      }

      const deadline = Date.now() + LIVE_CHECKIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(LIVE_CHECKIN_POLL_MS);
        const res = await ky.get("/api/sessions", { throwHttpErrors: false });
        if (!res.ok) continue;
        const data = (await res.json()) as { sessions: SessionSummary[] };
        const fresh = data.sessions.find(
          (session) => session.mode === "live" && !seenLiveIds.has(session.id),
        );
        if (fresh) {
          router.push(fresh.path);
          return;
        }
      }
      setError(
        "No patient crossed the risk threshold this cycle. Try again in a bit.",
      );
    } catch {
      setError("Could not open a live check-in.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">WhatsApp Simulator</h1>
        <p className="text-muted-foreground">
          Renders a pushed questionnaire as a chat and collects the replies.
          Live check-ins are created by the real care-loop pipeline (vitals →
          ML risk model → adaptive agent) and appear below as soon as the
          pipeline escalates a patient.
        </p>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          The healthkit vitals cron forwards each patient&apos;s vitals to the
          collector, which runs automatically every ~6 minutes.
        </li>
        <li>
          Analysis-service scores the vitals with the heart-risk ML model; a
          patient who crosses the risk threshold gets a live check-in here.
        </li>
        <li>
          The patient answers in chat; the agent can also answer general
          questions. The chat stays open for follow-ups after the check-in.
        </li>
      </ol>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button onClick={openLiveCheckIn} disabled={busy !== null}>
            {busy === "live" ? "Waiting for escalation..." : "Open live check-in"}
          </Button>
          <Button
            variant="outline"
            onClick={launchScriptedDemo}
            disabled={busy !== null}
          >
            {busy === "scripted" ? "Starting..." : "Launch scripted demo"}
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
