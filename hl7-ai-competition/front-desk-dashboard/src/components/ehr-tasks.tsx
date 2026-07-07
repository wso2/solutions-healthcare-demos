"use client";

import type { EhrTask } from "@/app/api/tasks/route";

import { ChevronRight, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

const POLL_INTERVAL_MS = 15_000;

function formatAuthoredOn(authoredOn: string | undefined): string | undefined {
  if (!authoredOn) return undefined;
  const parsed = new Date(authoredOn);
  if (Number.isNaN(parsed.getTime())) return authoredOn;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function TasksLoading() {
  return (
    <div className="flex h-[440px] items-center justify-center text-sm text-muted-foreground">
      Loading tasks…
    </div>
  );
}

function TasksEmpty() {
  return (
    <div className="flex h-[440px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <ClipboardCheck className="size-6" />
      No active tasks.
    </div>
  );
}

function TaskListItem({ task }: { task: EhrTask }) {
  return (
    <li className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted">
      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          href={`/tasks/${task.id}`}
          className="block text-sm font-semibold text-foreground focus-visible:outline-none"
        >
          {task.description}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {task.patientId ? (
            <Link
              href={`/patients/${task.patientId}`}
              className="underline-offset-2 hover:underline"
            >
              Patient/{task.patientId}
            </Link>
          ) : (
            "Unknown patient"
          )}
          {formatAuthoredOn(task.authoredOn)
            ? ` · ${formatAuthoredOn(task.authoredOn)}`
            : ""}
        </p>
      </div>
      <Badge variant="outline" className="shrink-0 uppercase tracking-wide">
        {task.status}
      </Badge>
      <Link href={`/tasks/${task.id}`}>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function TaskList({ tasks }: { tasks: EhrTask[] }) {
  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <TaskListItem key={task.id} task={task} />
      ))}
    </ul>
  );
}

export function EhrTasks() {
  const [tasks, setTasks] = React.useState<EhrTask[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/tasks");
        const body = await response.json();
        if (!cancelled) setTasks(body.tasks ?? []);
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Card className="gap-0 border-foreground/15">
      <CardHeader className="border-b pb-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">Care team tasks</CardTitle>
            <CardDescription>
              Requested from the EHR, awaiting front-desk action.
            </CardDescription>
          </div>
          <Badge variant="outline" className="h-7 px-3 text-sm font-semibold">
            {tasks.length} open
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[440px]">
          {!loaded ? (
            <TasksLoading />
          ) : tasks.length === 0 ? (
            <TasksEmpty />
          ) : (
            <TaskList tasks={tasks} />
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
