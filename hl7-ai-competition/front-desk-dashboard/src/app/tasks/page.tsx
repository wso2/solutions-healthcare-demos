"use client";

import { PageHeader } from "@/components/page-header";
import { TaskBoard } from "@/components/task-board";
import { useData } from "@/lib/store";

export default function TasksPage() {
  const { data } = useData();

  const header = (
    <PageHeader
      title="Alerts"
      description="Triage remote-monitoring alerts and route each to a clinician."
    />
  );

  return (
    <>
      {header}
      <TaskBoard tasks={data.tasks} />
    </>
  );
}
