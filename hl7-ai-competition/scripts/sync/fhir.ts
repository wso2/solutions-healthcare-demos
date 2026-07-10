import { log } from "./util";
import { SYNC_LEVELS } from "./types";
import type { FhirBundle, FhirResource } from "./types";

export const EHR_FHIR_SERVER_URL = process.env.EHR_FHIR_SERVER_URL ?? "http://localhost:9090/fhir/r4";
export const CARE_LOOP_FHIR_SERVER_URL = process.env.CARE_LOOP_FHIR_SERVER_URL ?? "http://localhost:9091/fhir/r4";
const EHR_BASE_PATH = new URL(EHR_FHIR_SERVER_URL).pathname;

async function getFhirBundle(path: string): Promise<FhirBundle> {
  const res = await fetch(`${EHR_FHIR_SERVER_URL}${path}`, { headers: { accept: "application/fhir+json" } });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as FhirBundle;
}

function nextPagePath(bundle: FhirBundle): string | null {
  const nextUrl = bundle.link?.find((l) => l.relation === "next")?.url;
  if (!nextUrl) {
    return null;
  }
  const url = new URL(nextUrl);
  return url.pathname.slice(EHR_BASE_PATH.length) + url.search;
}

async function fetchAll(resourceType: string): Promise<FhirResource[]> {
  const resources: FhirResource[] = [];
  let path: string | null = `/${resourceType}?_count=100`;
  while (path) {
    const bundle = await getFhirBundle(path);
    resources.push(...(bundle.entry ?? []).map((entry) => entry.resource));
    path = nextPagePath(bundle);
  }
  return resources;
}

async function putResource(resourceType: string, resource: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${CARE_LOOP_FHIR_SERVER_URL}/${resourceType}/${resource.id}`, {
    method: "PUT",
    headers: { "content-type": "application/fhir+json" },
    body: JSON.stringify(resource),
  });
  if (res.status === 404) {
    const created = await fetch(`${CARE_LOOP_FHIR_SERVER_URL}/${resourceType}`, {
      method: "POST",
      headers: { "content-type": "application/fhir+json" },
      body: JSON.stringify(resource),
    });
    if (!created.ok) {
      throw new Error(`POST ${resourceType} (id ${resource.id}) failed: ${created.status} ${await created.text()}`);
    }
    return;
  }
  if (!res.ok) {
    throw new Error(`PUT ${resourceType}/${resource.id} failed: ${res.status} ${await res.text()}`);
  }
}

async function syncResourceType(resourceType: string): Promise<void> {
  const resources = await fetchAll(resourceType);
  log(`${resourceType}: ${resources.length} resource(s) in ehr-fhir-server`);
  await Promise.all(
    resources.map((resource) => putResource(resourceType, resource).then(() => log(`synced ${resourceType}/${resource.id}`))),
  );
}

export async function syncAll(): Promise<void> {
  for (const level of SYNC_LEVELS) {
    await Promise.all(level.map(syncResourceType));
  }
}
