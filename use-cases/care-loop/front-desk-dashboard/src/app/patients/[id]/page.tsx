"use client";

import type { EhrTask } from "@/app/api/tasks/route";

import { ArrowLeft, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { AssignDoctorMenu } from "@/components/assign-doctor-menu";
import { PatientSummary } from "@/components/patient-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { summarize } from "@/lib/format";
import { priorityBadgeVariant } from "@/lib/priority";

function formatTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function TasksLoading() {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        Loading tasks…
      </CardContent>
    </Card>
  );
}

function PatientTasksEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <ClipboardCheck className="size-6" />
      No active tasks for this patient.
    </div>
  );
}

function PatientTaskListItem({ task }: { task: EhrTask }) {
  return (
    <li className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted">
      <Link
        href={`/tasks/${task.id}`}
        className="flex min-w-0 flex-1 items-center gap-4 focus-visible:outline-none"
      >
        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {summarize(task.description)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatTimestamp(task.authoredOn) ?? "Not recorded"}
          </p>
        </div>
      </Link>
      {task.priority ? (
        <Badge
          variant={priorityBadgeVariant(task.priority)}
          className="shrink-0 uppercase tracking-wide"
        >
          {task.priority}
        </Badge>
      ) : null}
      <AssignDoctorMenu taskId={task.id} />
    </li>
  );
}

function PatientTaskList({ tasks }: { tasks: EhrTask[] }) {
  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <PatientTaskListItem key={task.id} task={task} />
      ))}
    </ul>
  );
}

function PatientTasks({ tasks }: { tasks: EhrTask[] }) {
  return (
    <Card className="gap-0 border-foreground/15">
      <CardHeader className="border-b pb-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">Care team tasks</CardTitle>
            <CardDescription>
              Requested from the EHR for this patient.
            </CardDescription>
          </div>
          <Badge variant="outline" className="h-7 px-3 text-sm font-semibold">
            {tasks.length} open
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? (
          <PatientTasksEmpty />
        ) : (
          <PatientTaskList tasks={tasks} />
        )}
      </CardContent>
    </Card>
  );
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const [tasks, setTasks] = React.useState<EhrTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setTasksLoaded(false);
      try {
        const response = await fetch(`/api/tasks?patientId=${params.id}`);
        const body = await response.json();
        if (!cancelled) setTasks(body.tasks ?? []);
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setTasksLoaded(true);
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
        <Link href="/patients">
          <ArrowLeft className="size-3.5" />
          Back to patients
        </Link>
      </Button>

      <PatientSummary patientId={params.id} />
      {tasksLoaded ? <PatientTasks tasks={tasks} /> : <TasksLoading />}
    </div>
  );
}
