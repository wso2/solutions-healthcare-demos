"use client";

import type { EhrRiskAssessment } from "@/app/api/risk-assessments/[id]/route";
import type { EhrTaskDetail } from "@/app/api/tasks/[id]/route";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function formatTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function TaskLoading() {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        Loading task…
      </CardContent>
    </Card>
  );
}

function TaskNotFound({ id }: { id: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        Task {id} could not be found in the EHR.
      </CardContent>
    </Card>
  );
}

function TaskDetail({ task }: { task: EhrTaskDetail }) {
  return (
    <Card className="border-foreground/15">
      <CardHeader className="border-b pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">Task</CardTitle>
            <CardDescription className="font-mono text-xs">
              Task/{task.id}
            </CardDescription>
          </div>
          <Badge variant="outline" className="h-7 px-3 text-sm font-semibold uppercase tracking-wide">
            {task.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <Field
          label="Description"
          value={<p className="leading-relaxed">{task.description}</p>}
        />

        <Separator />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field
            label="Patient"
            value={
              task.patientId ? (
                <Link
                  href={`/patients/${task.patientId}`}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  Patient/{task.patientId}
                </Link>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )
            }
          />
          <Field
            label="Intent"
            value={
              task.intent ?? (
                <span className="text-muted-foreground">Not set</span>
              )
            }
          />
          <Field
            label="Authored on"
            value={
              formatTimestamp(task.authoredOn) ?? (
                <span className="text-muted-foreground">Not recorded</span>
              )
            }
          />
          <Field
            label="Last modified"
            value={
              formatTimestamp(task.lastModified) ?? (
                <span className="text-muted-foreground">Not recorded</span>
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function RiskAssessmentCard({
  basedOn,
}: {
  basedOn: { id: string; display: string | undefined };
}) {
  const [assessment, setAssessment] = React.useState<EhrRiskAssessment | null>(
    null,
  );
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/risk-assessments/${basedOn.id}`);
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok || !body.riskAssessment) {
          setStatus("error");
          return;
        }
        setAssessment(body.riskAssessment);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [basedOn.id]);

  const label = basedOn.display ?? `RiskAssessment/${basedOn.id}`;

  if (status === "loading") {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Loading {label}…
      </div>
    );
  }
  if (status === "error" || !assessment) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Could not load {label}.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <Badge variant="outline" className="font-mono">
          RiskAssessment/{basedOn.id}
        </Badge>
      </div>
      {assessment.method ? (
        <p className="text-xs text-muted-foreground">{assessment.method}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {assessment.predictions.map((prediction) => (
          <Badge key={prediction.rationale ?? prediction.probability} variant="outline">
            {prediction.probability !== undefined
              ? `${Math.round(prediction.probability * 100)}%`
              : "—"}
            {prediction.rationale ? ` · ${prediction.rationale}` : ""}
          </Badge>
        ))}
      </div>
      {assessment.note ? (
        <p className="text-sm leading-relaxed">{assessment.note}</p>
      ) : null}
    </div>
  );
}

function TaskRiskAssessments({
  basedOn,
}: {
  basedOn: { id: string; display: string | undefined }[];
}) {
  if (basedOn.length === 0) return null;
  return (
    <Card className="border-foreground/15">
      <CardHeader className="border-b pb-5">
        <CardTitle className="text-xl">Basis</CardTitle>
        <CardDescription>
          Risk assessments this Task is based on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-6">
        {basedOn.map((ref) => (
          <RiskAssessmentCard key={ref.id} basedOn={ref} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const [task, setTask] = React.useState<EhrTaskDetail | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      try {
        const response = await fetch(`/api/tasks/${params.id}`);
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok || !body.task) {
          setStatus("error");
          return;
        }
        setTask(body.task);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" asChild>
        <Link href="/">
          <ArrowLeft className="size-3.5" />
          Back to tasks
        </Link>
      </Button>

      {status === "loading" ? (
        <TaskLoading />
      ) : status === "error" || !task ? (
        <TaskNotFound id={params.id} />
      ) : (
        <>
          <TaskDetail task={task} />
          <TaskRiskAssessments basedOn={task.basedOnRiskAssessments} />
        </>
      )}
    </div>
  );
}
