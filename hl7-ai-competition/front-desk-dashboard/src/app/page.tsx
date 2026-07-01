"use client";

import { CalendarCheck, ClipboardList, UserCheck, Users } from "lucide-react";

import { AppointmentsList } from "@/components/appointments-list";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TaskQueue } from "@/components/task-queue";
import { WaitingRoom } from "@/components/waiting-room";
import { useData } from "@/lib/store";

export default function DashboardPage() {
  const { data } = useData();

  const header = (
    <PageHeader
      title="Good morning, Maya"
      description="Heart-failure alerts flagged for triage are below. Assign each to a clinician."
    />
  );

  const openAlerts = data.tasks.filter((t) => t.status !== "Closed").length;
  const flagged = data.patients.filter((p) => p.status === "Flagged").length;
  const assigned = data.tasks.filter((t) => t.status === "Assigned").length;

  return (
    <>
      {header}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open alerts"
          value={openAlerts}
          icon={ClipboardList}
          sublabel="awaiting triage or in review"
        />
        <StatCard
          label="Flagged patients"
          value={flagged}
          icon={Users}
          sublabel="trending toward an event"
        />
        <StatCard
          label="Assigned to clinicians"
          value={assigned}
          icon={UserCheck}
          sublabel="routed for review"
        />
        <StatCard
          label="Reviews today"
          value={data.appointments.length}
          icon={CalendarCheck}
          sublabel={`${data.doctors.length} clinicians on call`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TaskQueue tasks={data.tasks} />
        </div>
        <div className="flex flex-col gap-6">
          <WaitingRoom />
          <AppointmentsList />
        </div>
      </div>
    </>
  );
}
