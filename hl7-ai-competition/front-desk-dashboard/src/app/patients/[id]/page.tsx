"use client";

import type { EhrPatientDetail } from "@/app/api/patients/[id]/route";
import type { EhrTask } from "@/app/api/tasks/route";

import { ArrowLeft, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function PatientLoading() {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        Loading patient…
      </CardContent>
    </Card>
  );
}

function PatientNotFound({ id }: { id: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">
        Patient {id} could not be found in the EHR.
      </CardContent>
    </Card>
  );
}

function PatientSummary({
  patient,
  age,
}: {
  patient: EhrPatientDetail;
  age: number | undefined;
}) {
  return (
    <Card className="border-foreground/15">
      <CardHeader className="border-b pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">{patient.name}</CardTitle>
            <CardDescription className="font-mono text-xs">
              Patient/{patient.id}
            </CardDescription>
          </div>
          {patient.gender ? (
            <Badge
              variant="outline"
              className="h-7 px-3 text-sm font-semibold uppercase tracking-wide"
            >
              {patient.gender}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field
            label="Age"
            value={
              age !== undefined ? (
                age
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )
            }
          />
          <Field
            label="Date of birth"
            value={
              patient.birthDate ?? (
                <span className="text-muted-foreground">Unknown</span>
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PatientTasksEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
      <ClipboardCheck className="size-6" />
      No active tasks for this patient.
    </div>
  );
}

function PatientTaskListItem({ task }: { task: EhrTask }) {
  return (
    <li>
      <Link
        href={`/tasks/${task.id}`}
        className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {task.description}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatTimestamp(task.authoredOn) ?? "Not recorded"}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 uppercase tracking-wide">
          {task.status}
        </Badge>
      </Link>
    </li>
  );
}

function PatientTaskList({ tasks }: { tasks: EhrTask[] }) {
  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <PatientTaskListItem key={task.id} task={task} />
      ))}
    </ul>
  );
}

function PatientTasks({ tasks }: { tasks: EhrTask[] }) {
  return (
    <Card className="gap-0 border-foreground/15">
      <CardHeader className="border-b pb-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">Care team tasks</CardTitle>
            <CardDescription>
              Requested from the EHR for this patient.
            </CardDescription>
          </div>
          <Badge variant="outline" className="h-7 px-3 text-sm font-semibold">
            {tasks.length} open
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? (
          <PatientTasksEmpty />
        ) : (
          <PatientTaskList tasks={tasks} />
        )}
      </CardContent>
    </Card>
  );
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const [patient, setPatient] = React.useState<EhrPatientDetail | null>(null);
  const [tasks, setTasks] = React.useState<EhrTask[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      try {
        const [patientResponse, tasksResponse] = await Promise.all([
          fetch(`/api/patients/${params.id}`),
          fetch(`/api/tasks?patientId=${params.id}`),
        ]);
        const patientBody = await patientResponse.json();
        const tasksBody = await tasksResponse.json();
        if (cancelled) return;
        if (!patientResponse.ok || !patientBody.patient) {
          setStatus("error");
          return;
        }
        setPatient(patientBody.patient);
        setTasks(tasksBody.tasks ?? []);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const age = computeAge(patient?.birthDate);

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" asChild>
        <Link href="/patients">
          <ArrowLeft className="size-3.5" />
          Back to patients
        </Link>
      </Button>

      {status === "loading" ? (
        <PatientLoading />
      ) : status === "error" || !patient ? (
        <PatientNotFound id={params.id} />
      ) : (
        <>
          <PatientSummary patient={patient} age={age} />
          <PatientTasks tasks={tasks} />
        </>
      )}
    </div>
  );
}
