// Demo-only triage assignment: there is no assignment concept in the FHIR backend,
// so this is a client-side mock (localStorage) purely for showing the interaction.
const STORAGE_KEY = "care-loop-task-assignments";

export const MOCK_DOCTORS = [
  "Dr. Amara Osei",
  "Dr. Elena Marchetti",
  "Dr. Rajesh Iyer",
];

export function loadAssignments(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveAssignment(
  taskId: string,
  doctor: string | undefined,
): void {
  if (typeof window === "undefined") return;
  const next = loadAssignments();
  if (doctor) {
    next[taskId] = doctor;
  } else {
    delete next[taskId];
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
