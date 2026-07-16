"use client";

import type { EhrPatientDetail } from "@/app/api/patients/[id]/route";

import { Cake, CalendarDays, Mail, MapPin, Phone } from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

function computeAge(birthDate: string | undefined): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-muted/30 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="text-sm font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function PatientSummaryLoading() {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        Loading patient…
      </CardContent>
    </Card>
  );
}

function PatientSummaryError({ patientId }: { patientId: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        Patient {patientId} could not be found in the EHR.
      </CardContent>
    </Card>
  );
}

// Self-contained: fetches and renders the patient's demographics/contact card from just an id, so any page that needs "who is this about" (patient page, task page) can drop it in.
export function PatientSummary({ patientId }: { patientId: string }) {
  const [patient, setPatient] = React.useState<EhrPatientDetail | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      try {
        const response = await fetch(`/api/patients/${patientId}`);
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok || !body.patient) {
          setStatus("error");
          return;
        }
        setPatient(body.patient);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (status === "loading") return <PatientSummaryLoading />;
  if (status === "error" || !patient) {
    return <PatientSummaryError patientId={patientId} />;
  }

  const age = computeAge(patient.birthDate);

  return (
    <Card className="border-foreground/15 py-0">
      <div className="flex items-center gap-4 bg-muted/40 px-6 py-6">
        <Avatar className="size-14">
          <AvatarFallback className="bg-foreground text-base font-semibold text-background">
            {initials(patient.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1.5">
          <CardTitle className="text-xl">{patient.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <CardDescription className="font-mono text-xs">
              Patient/{patient.id}
            </CardDescription>
            {patient.gender ? (
              <Badge
                variant="outline"
                className="h-5 px-2 text-[10px] font-semibold uppercase tracking-wide"
              >
                {patient.gender}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
      <CardContent className="grid grid-cols-1 gap-3 px-6 py-6 sm:grid-cols-2">
        <Stat
          icon={Cake}
          label="Age"
          value={
            age !== undefined ? (
              `${age} years`
            ) : (
              <span className="font-normal text-muted-foreground">
                Unknown
              </span>
            )
          }
        />
        <Stat
          icon={CalendarDays}
          label="Date of birth"
          value={
            patient.birthDate ?? (
              <span className="font-normal text-muted-foreground">
                Unknown
              </span>
            )
          }
        />
        <Stat
          icon={Phone}
          label="Phone"
          value={
            patient.phone ?? (
              <span className="font-normal text-muted-foreground">
                Not on file
              </span>
            )
          }
        />
        {patient.email ? (
          <Stat icon={Mail} label="Email" value={patient.email} />
        ) : null}
        <Stat
          icon={MapPin}
          label="Address"
          value={
            patient.address ?? (
              <span className="font-normal text-muted-foreground">
                Not on file
              </span>
            )
          }
        />
      </CardContent>
    </Card>
  );
}
