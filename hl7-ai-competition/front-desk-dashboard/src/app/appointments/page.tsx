"use client";

import { CalendarCheck, CalendarClock, CircleCheck, UserX } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PatientAvatar } from "@/components/patient-avatar";
import { StatCard } from "@/components/stat-card";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useData } from "@/lib/store";

export default function AppointmentsPage() {
  const { data, getPatient } = useData();

  const header = (
    <PageHeader
      title="Reviews"
      description="Scheduled telehealth and follow-up reviews for flagged patients."
    />
  );

  const appointments = data.appointments;
  const sorted = [...appointments].sort((a, b) => a.time.localeCompare(b.time));
  const confirmed = appointments.filter(
    (a) => a.status === "Confirmed" || a.status === "In review",
  ).length;
  const completed = appointments.filter((a) => a.status === "Completed").length;
  const missed = appointments.filter((a) => a.status === "Missed").length;

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Scheduled"
          value={appointments.length}
          icon={CalendarClock}
          sublabel="total today"
        />
        <StatCard
          label="Confirmed"
          value={confirmed}
          icon={CircleCheck}
          sublabel="confirmed or in review"
        />
        <StatCard
          label="Completed"
          value={completed}
          icon={CalendarCheck}
          sublabel="reviews closed"
        />
        <StatCard
          label="Missed"
          value={missed}
          icon={UserX}
          sublabel="no-shows today"
        />
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b p-5">
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            {appointments.length} reviews, ordered by time.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20">Time</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead className="hidden md:table-cell">Clinician</TableHead>
              <TableHead className="hidden lg:table-cell">Reason</TableHead>
              <TableHead className="hidden sm:table-cell">Modality</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((appt) => {
              const patient = getPatient(appt.patientId);
              return (
                <TableRow key={appt.id}>
                  <TableCell className="font-semibold tabular-nums">
                    {appt.time}
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
                  <TableCell className="hidden text-sm md:table-cell">
                    {appt.doctor}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {appt.reason}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="font-normal">
                      {appt.modality}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <AppointmentStatusBadge status={appt.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
