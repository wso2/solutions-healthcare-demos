"use client";

/* eslint-disable react-refresh/only-export-components -- provider co-locates DataProvider with the useData hook and receptionist identity */

import type {
  Appointment,
  Doctor,
  Patient,
  Task,
  WaitingEntry,
} from "@/lib/types";

import * as React from "react";

export const receptionist = {
  name: "Maya Okonkwo",
  role: "Front Desk Operator",
  email: "maya.okonkwo@careloop.health",
  initials: "MO",
};

interface DataSet {
  patients: Patient[];
  doctors: Doctor[];
  tasks: Task[];
  appointments: Appointment[];
  waitingRoom: WaitingEntry[];
}

const EMPTY: DataSet = {
  patients: [],
  doctors: [],
  tasks: [],
  appointments: [],
  waitingRoom: [],
};

interface DataApi {
  data: DataSet;
  assignTask: (taskId: string, doctorId: string) => void;
  closeTask: (taskId: string) => void;
  reopenTask: (taskId: string) => void;
  getPatient: (id: string | null | undefined) => Patient | undefined;
  getDoctor: (id: string | null | undefined) => Doctor | undefined;
  tasksForPatient: (patientId: string) => Task[];
  openTasksForPatient: (patientId: string) => Task[];
  nextReviewForPatient: (patientId: string) => Appointment | undefined;
}

const DataContext = React.createContext<DataApi | null>(null);

// Stub provider: no-op actions and empty selectors until the FHIR layer lands.
const EMPTY_API: DataApi = {
  data: EMPTY,
  assignTask: () => {},
  closeTask: () => {},
  reopenTask: () => {},
  getPatient: () => undefined,
  getDoctor: () => undefined,
  tasksForPatient: () => [],
  openTasksForPatient: () => [],
  nextReviewForPatient: () => undefined,
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  return (
    <DataContext.Provider value={EMPTY_API}>{children}</DataContext.Provider>
  );
}

export function useData(): DataApi {
  const ctx = React.useContext(DataContext);
  if (!ctx) {
    throw new Error("useData must be used within a DataProvider");
  }
  return ctx;
}
