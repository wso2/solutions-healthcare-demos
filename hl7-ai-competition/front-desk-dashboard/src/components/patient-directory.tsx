"use client";

import type { Patient } from "@/lib/types";
import {
  Activity,
  CalendarClock,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";

import * as React from "react";
import { PatientAvatar } from "@/components/patient-avatar";
import { PriorityBadge } from "@/components/priority-badge";
import {
  PatientStatusBadge,
  RiskBadge,
  TaskStatusBadge,
} from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

function formatDob(dob: string): string {
  return new Date(dob).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatReading(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PatientSheet({
  patient,
  open,
  onOpenChange,
}: {
  patient: Patient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { openTasksForPatient, nextReviewForPatient } = useData();
  const tasks = patient ? openTasksForPatient(patient.id) : [];
  const review = patient ? nextReviewForPatient(patient.id) : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {patient ? (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarFallback className="bg-primary/10 font-medium text-primary">
                    {patient.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{patient.name}</SheetTitle>
                  <SheetDescription className="font-mono">
                    {patient.mrn}
                  </SheetDescription>
                </div>
                <PatientStatusBadge
                  status={patient.status}
                  className="ml-auto"
                />
              </div>
            </SheetHeader>

            <div className="space-y-6 p-4">
              <section className="space-y-3">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Monitoring
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Diagnosis</dt>
                    <dd>{patient.diagnosis}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Risk</dt>
                    <dd>
                      <RiskBadge
                        level={patient.riskLevel}
                        score={patient.riskScore}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Last reading
                    </dt>
                    <dd className="flex items-center gap-1.5">
                      <Activity className="size-3.5 text-muted-foreground" />
                      {formatReading(patient.lastReading)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Date of birth
                    </dt>
                    <dd>
                      {formatDob(patient.dob)} ({patient.age})
                    </dd>
                  </div>
                </dl>
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Contact
                </h3>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    {patient.phone}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    {patient.email}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    {patient.address}
                  </p>
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    {patient.insurance} ·{" "}
                    <span className="font-mono text-xs">
                      {patient.memberId}
                    </span>
                  </p>
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Next review
                </h3>
                {review ? (
                  <Card className="gap-0 p-0">
                    <CardContent className="flex items-center gap-3 p-3.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CalendarClock className="size-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {review.time} · {review.doctor}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {review.modality} · {review.reason}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No review scheduled.
                  </p>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Open alerts ({tasks.length})
                </h3>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No open alerts for this patient.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {tasks.map((task) => {
                      const Icon = alertTypeIcon[task.alertType];
                      return (
                        <li
                          key={task.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {task.title}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <PriorityBadge priority={task.priority} />
                              <TaskStatusBadge status={task.status} />
                            </div>
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {task.raisedAt}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function PatientDirectory({ patients }: { patients: Patient[] }) {
  const [selected, setSelected] = React.useState<Patient | null>(null);
  const [open, setOpen] = React.useState(false);

  function openPatient(patient: Patient) {
    setSelected(patient);
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Patient</TableHead>
              <TableHead className="hidden md:table-cell">Diagnosis</TableHead>
              <TableHead className="hidden sm:table-cell">Risk</TableHead>
              <TableHead className="hidden lg:table-cell">
                Last reading
              </TableHead>
              <TableHead className="hidden xl:table-cell">DOB / Age</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => (
              <TableRow
                key={patient.id}
                className="cursor-pointer"
                onClick={() => openPatient(patient)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <PatientAvatar name={patient.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {patient.name}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {patient.mrn}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    <HeartPulse className="size-3.5 text-muted-foreground" />
                    {patient.diagnosis}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <RiskBadge
                    level={patient.riskLevel}
                    score={patient.riskScore}
                  />
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {formatReading(patient.lastReading)}
                </TableCell>
                <TableCell className="hidden text-sm xl:table-cell">
                  {formatDob(patient.dob)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {patient.age}
                  </span>
                </TableCell>
                <TableCell>
                  <PatientStatusBadge status={patient.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {patients.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No patients yet.
          </p>
        ) : null}
      </Card>

      <PatientSheet patient={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
