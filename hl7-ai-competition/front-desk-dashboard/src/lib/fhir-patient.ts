import type { Patient as FhirPatient } from "fhir/r4";

export function formatPatientName(patient: FhirPatient): string {
  const name = patient.name?.[0];
  if (!name) return "Unknown patient";
  return [...(name.given ?? []), name.family].filter(Boolean).join(" ");
}

export function formatPatientPhone(patient: FhirPatient): string | undefined {
  return patient.telecom?.find((entry) => entry.system === "phone")?.value;
}

export function formatPatientEmail(patient: FhirPatient): string | undefined {
  return patient.telecom?.find((entry) => entry.system === "email")?.value;
}

export function formatPatientAddress(
  patient: FhirPatient,
): string | undefined {
  const address = patient.address?.[0];
  if (!address) return undefined;
  const line = (address.line ?? []).join(", ");
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, address.postalCode]
    .filter(Boolean)
    .join(" ");
  return [line, cityStateZip, address.country].filter(Boolean).join(", ") || undefined;
}
