import type { AlertType } from "@/lib/alert-icons";

type Sex = "Male" | "Female";

export type RiskLevel = "High" | "Moderate" | "Low";

export type PatientStatus = "Flagged" | "Monitoring" | "Stable" | "Inactive";

export interface Patient {
  id: string;
  name: string;
  mrn: string;
  dob: string;
  age: number;
  sex: Sex;
  phone: string;
  email: string;
  insurance: string;
  memberId: string;
  diagnosis: string;
  status: PatientStatus;
  riskLevel: RiskLevel;
  riskScore: number;
  lastReading: string;
  pronouns?: string;
  address: string;
}

export type TaskPriority = "Urgent" | "Routine";

export type TaskStatus = "Unassigned" | "Assigned" | "Closed";

interface Vitals {
  weightKg: number;
  weightChangeKg: number;
  heartRate: number;
  bloodPressure: string;
  spo2: number;
}

export interface Task {
  id: string;
  code: string;
  alertType: AlertType;
  title: string;
  description: string;
  patientId: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo: string | null;
  riskScore: number;
  vitals: Vitals;
  symptom: string;
  raisedAt: string;
  order: number;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  initials: string;
}

export type AppointmentStatus =
  | "Scheduled"
  | "Confirmed"
  | "In review"
  | "Completed"
  | "Missed";

type Modality = "Telehealth" | "In-person";

export interface Appointment {
  id: string;
  patientId: string;
  time: string;
  doctor: string;
  reason: string;
  modality: Modality;
  status: AppointmentStatus;
}

export interface WaitingEntry {
  patientId: string;
  flaggedAt: string;
  waitMinutes: number;
  taskId: string;
}
