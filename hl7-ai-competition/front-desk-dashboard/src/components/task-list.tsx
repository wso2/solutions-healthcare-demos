"use client";

import type { Task } from "@/lib/types";

import { Clock, Inbox } from "lucide-react";
import { AssignControl } from "@/components/assign-control";
import { PatientAvatar } from "@/components/patient-avatar";
import { PriorityBadge } from "@/components/priority-badge";
import { TaskStatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { alertTypeIcon } from "@/lib/alert-icons";
import { useData } from "@/lib/store";

export function TaskList({ tasks }: { tasks: Task[] }) {
  const { getPatient } = useData();

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <Inbox className="size-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">Nothing here</p>
        <p className="text-xs text-muted-foreground">
          No alerts match this view.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[28%]">Alert</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead className="hidden md:table-cell">Priority</TableHead>
          <TableHead className="hidden xl:table-cell">Risk</TableHead>
          <TableHead className="hidden lg:table-cell">Raised</TableHead>
          <TableHead className="hidden md:table-cell">Status</TableHead>
          <TableHead className="text-right">Assignment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => {
          const patient = getPatient(task.patientId);
          const Icon = alertTypeIcon[task.alertType];
          return (
            <TableRow key={task.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.alertType}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <PatientAvatar name={patient?.name ?? "?"} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {patient?.name}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {patient?.mrn}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <PriorityBadge priority={task.priority} />
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                <span className="text-sm font-medium tabular-nums">
                  {task.riskScore}
                </span>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
                  <Clock className="size-3.5" />
                  {task.raisedAt}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <TaskStatusBadge status={task.status} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <AssignControl task={task} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
