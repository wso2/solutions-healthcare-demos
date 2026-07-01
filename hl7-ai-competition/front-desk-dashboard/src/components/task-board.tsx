"use client";

import type { Task, TaskStatus } from "@/lib/types";
import { Clock } from "lucide-react";
import { AssignControl } from "@/components/assign-control";
import { PatientAvatar } from "@/components/patient-avatar";
import { PriorityBadge } from "@/components/priority-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { alertTypeIcon } from "@/lib/alert-icons";
import { useData } from "@/lib/store";
import { cn } from "@/lib/utils";

const columns: { status: TaskStatus; accent: string }[] = [
  { status: "Unassigned", accent: "bg-rose-500" },
  { status: "Assigned", accent: "bg-sky-500" },
  { status: "Closed", accent: "bg-primary" },
];

function TaskCard({ task }: { task: Task }) {
  const { getPatient } = useData();
  const patient = getPatient(task.patientId);
  const Icon = alertTypeIcon[task.alertType];
  return (
    <Card className="gap-0 p-0 transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {task.alertType}
            </span>
          </div>
          <PriorityBadge priority={task.priority} />
        </div>

        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {task.description}
        </p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <PatientAvatar name={patient?.name ?? "?"} className="size-6" />
            <span className="truncate text-xs font-medium">
              {patient?.name}
            </span>
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            Risk {task.riskScore}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="size-3" />
            {task.raisedAt}
          </span>
        </div>

        <AssignControl task={task} className="w-full sm:w-full" />
      </CardContent>
    </Card>
  );
}

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {columns.map((col) => {
        const colTasks = tasks
          .filter((t) => t.status === col.status)
          .sort((a, b) => b.order - a.order);
        return (
          <div
            key={col.status}
            className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3"
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", col.accent)} />
                <h2 className="text-sm font-semibold">{col.status}</h2>
              </div>
              <Badge variant="secondary" className="tabular-nums">
                {colTasks.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-3">
              {colTasks.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  No alerts
                </p>
              ) : (
                colTasks.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
