"use client";

import { PageHeader } from "@/components/page-header";
import { PatientDirectory } from "@/components/patient-directory";
import { useData } from "@/lib/store";

export default function PatientsPage() {
  const { data } = useData();

  const header = (
    <PageHeader
      title="Patients"
      description="The monitored heart-failure cohort. Open a patient for risk and open alerts."
    />
  );

  return (
    <>
      {header}
      <PatientDirectory patients={data.patients} />
    </>
  );
}
