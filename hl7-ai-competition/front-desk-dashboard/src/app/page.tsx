"use client";

import { EhrTasks } from "@/components/ehr-tasks";
import { PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  const header = (
    <PageHeader
      title="Good morning, Maya"
      description="Care team tasks requested from the EHR are below. Open one to see the full task."
    />
  );

  return (
    <>
      {header}

      <EhrTasks />
    </>
  );
}
