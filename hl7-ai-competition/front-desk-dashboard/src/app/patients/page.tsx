"use client";

import type { EhrPatient } from "@/app/api/patients/route";

import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatBirthDate(birthDate: string | undefined): string | undefined {
  if (!birthDate) return undefined;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return birthDate;
  return parsed.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function PatientsLoading() {
  return (
    <div className="flex h-[560px] items-center justify-center text-sm text-muted-foreground">
      Loading patients…
    </div>
  );
}

function PatientsEmpty() {
  return (
    <div className="flex h-[560px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <Users className="size-6" />
      No patients found.
    </div>
  );
}

function PatientListItem({ patient }: { patient: EhrPatient }) {
  return (
    <li>
      <Link
        href={`/patients/${patient.id}`}
        className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {patient.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatBirthDate(patient.birthDate) ?? "DOB unknown"}
            {patient.gender ? ` · ${patient.gender}` : ""}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 font-mono">
          Patient/{patient.id}
        </Badge>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function PatientList({ patients }: { patients: EhrPatient[] }) {
  return (
    <ul className="divide-y">
      {patients.map((patient) => (
        <PatientListItem key={patient.id} patient={patient} />
      ))}
    </ul>
  );
}

export default function PatientsPage() {
  const [patients, setPatients] = React.useState<EhrPatient[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/patients");
        const body = await response.json();
        if (!cancelled) setPatients(body.patients ?? []);
      } catch {
        if (!cancelled) setPatients([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const header = (
    <PageHeader
      title="Patients"
      description="The monitored heart-failure cohort, from the EHR."
    />
  );

  return (
    <>
      {header}

      <Card className="gap-0 border-foreground/15">
        <CardHeader className="border-b pb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-xl">Patients</CardTitle>
              <CardDescription>
                Patients registered in the EHR.
              </CardDescription>
            </div>
            <Badge variant="outline" className="h-7 px-3 text-sm font-semibold">
              {patients.length} total
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[560px]">
            {!loaded ? (
              <PatientsLoading />
            ) : patients.length === 0 ? (
              <PatientsEmpty />
            ) : (
              <PatientList patients={patients} />
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}
