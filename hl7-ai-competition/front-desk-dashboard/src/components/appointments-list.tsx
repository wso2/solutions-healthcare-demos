"use client";

import type { Appointment } from "@/lib/types";
import { AppointmentStatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useData } from "@/lib/store";

export function AppointmentsList({
  items,
  title = "Upcoming reviews",
  description,
}: {
  items?: Appointment[];
  title?: string;
  description?: string;
}) {
  const { data, getPatient } = useData();
  const source = items ?? data.appointments;
  const sorted = [...source].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <Card className="gap-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? `${source.length} reviews on the schedule.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <ul className="divide-y">
            {sorted.map((appt) => {
              const patient = getPatient(appt.patientId);
              return (
                <li key={appt.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className="text-sm font-semibold tabular-nums">
                      {appt.time}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {patient?.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {appt.doctor} · {appt.reason}
                    </p>
                  </div>
                  <AppointmentStatusBadge status={appt.status} />
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
