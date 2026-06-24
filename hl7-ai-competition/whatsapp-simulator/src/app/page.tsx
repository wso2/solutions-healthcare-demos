"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { sampleQuestionnaire } from "@/lib/sample";

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function launchDemo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionnaire: sampleQuestionnaire,
          callbackUrl: new URL(
            "/api/demo-callback",
            window.location.origin,
          ).toString(),
        }),
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
          Renders a pushed questionnaire as a chat, collects the answers, and
          posts a FHIR QuestionnaireResponse back to the caller&apos;s callback
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
          A FHIR QuestionnaireResponse is POSTed to the callback URL on submit.
        </li>
      </ol>

      <div className="space-y-2">
        <Button onClick={launchDemo} disabled={busy}>
          {busy ? "Starting..." : "Launch demo questionnaire"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
