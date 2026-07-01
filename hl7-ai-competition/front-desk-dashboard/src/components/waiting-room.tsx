"use client";

import { Clock } from "lucide-react";

import { PatientAvatar } from "@/components/patient-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useData } from "@/lib/store";
import { cn } from "@/lib/utils";

function waitTone(minutes: number): string {
  if (minutes >= 60) return "text-rose-600";
  if (minutes >= 30) return "text-amber-600";
  return "text-muted-foreground";
}

export function WaitingRoom() {
  const { data, getPatient } = useData();
  const entries = data.waitingRoom;

  return (
    <Card className="gap-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Awaiting triage</CardTitle>
        <CardDescription>
          {entries.length} unassigned alerts waiting to be routed.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <ul className="divide-y">
            {entries.map((entry) => {
              const patient = getPatient(entry.patientId);
              const task = data.tasks.find((t) => t.id === entry.taskId);
              return (
                <li
                  key={entry.taskId}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <PatientAvatar name={patient?.name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {patient?.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task?.alertType} · flagged {entry.flaggedAt}
                    </p>
                  </div>
                  <Badge
                    variant="ghost"
                    className={cn(
                      "gap-1 tabular-nums",
                      waitTone(entry.waitMinutes),
                    )}
                  >
                    <Clock className="size-3" />
                    {entry.waitMinutes}m
                  </Badge>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
