"use client";

import type { EhrTask } from "@/app/api/tasks/route";

import { ChevronRight, ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { AssignDoctorMenu } from "@/components/assign-doctor-menu";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { summarize } from "@/lib/format";
import { priorityBadgeVariant } from "@/lib/priority";

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

function TaskTableRow({ task }: { task: EhrTask }) {
  const router = useRouter();

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(`/tasks/${task.id}`)}
    >
      <TableCell className="font-medium text-foreground">
        {task.patientName ?? "Unknown patient"}
      </TableCell>
      <TableCell className="max-w-md min-w-0 truncate whitespace-nowrap text-muted-foreground">
        {summarize(task.description)}
      </TableCell>
      <TableCell>
        {task.priority ? (
          <Badge
            variant={priorityBadgeVariant(task.priority)}
            className="uppercase tracking-wide"
          >
            {task.priority}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatAuthoredOn(task.authoredOn) ?? "Not recorded"}
      </TableCell>
      <TableCell>
        <AssignDoctorMenu taskId={task.id} />
      </TableCell>
      <TableCell>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}

function TaskTable({ tasks }: { tasks: EhrTask[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Patient</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Assigned</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TaskTableRow key={task.id} task={task} />
        ))}
      </TableBody>
    </Table>
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
            <TaskTable tasks={tasks} />
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
