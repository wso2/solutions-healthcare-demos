"use client";

import type { FhirDrawerTarget } from "@/lib/fhir-drawer-context";

import { useState } from "react";

import { FhirDrawerContext, useFhirDrawer } from "@/lib/fhir-drawer-context";
import { cn } from "@/lib/utils";

const JSON_COLORS = {
  key: "#7fb5f5",
  str: "#9ece8c",
  num: "#f0a36c",
  lit: "#c792ea",
  punc: "#6f6f78",
};

const JSON_TOKEN_RE =
  /("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function highlightJson(value: unknown): React.ReactNode[] {
  const json = JSON.stringify(value, null, 2) ?? "";
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let match = JSON_TOKEN_RE.exec(json);
  while (match) {
    if (match.index > last) {
      out.push(
        <span key={`p${i}`} style={{ color: JSON_COLORS.punc }}>
          {json.slice(last, match.index)}
        </span>,
      );
    }
    const token = match[0];
    let color: string = JSON_COLORS.num;
    if (token.startsWith('"')) {
      color = token.endsWith(":") ? JSON_COLORS.key : JSON_COLORS.str;
    } else if (/^(?:true|false|null)$/.test(token)) {
      color = JSON_COLORS.lit;
    }
    out.push(
      <span key={`t${i}`} style={{ color }}>
        {token}
      </span>,
    );
    last = match.index + token.length;
    i += 1;
    match = JSON_TOKEN_RE.exec(json);
  }
  if (last < json.length) {
    out.push(
      <span key="end" style={{ color: JSON_COLORS.punc }}>
        {json.slice(last)}
      </span>,
    );
  }
  return out;
}

export function FhirDrawerProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<FhirDrawerTarget | null>(null);

  return (
    <FhirDrawerContext value={{ open: setTarget }}>
      {children}
      {target ? (
        <>
          <button
            type="button"
            aria-label="Close FHIR viewer"
            onClick={() => setTarget(null)}
            className="fixed inset-0 z-40 bg-[rgba(10,10,12,0.35)]"
          />
          <div className="animate-fhir-drawer-in fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-[92vw] flex-col bg-white shadow-[-20px_0_60px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.07)] px-5 py-4">
              <div className="min-w-0">
                <div className="text-[14px] font-bold">Raw FHIR resource</div>
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-[rgba(0,0,0,0.45)]">
                  {target.resourcePath}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close FHIR viewer"
                onClick={() => setTarget(null)}
                className="size-[30px] shrink-0 cursor-pointer rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[rgba(0,0,0,0.04)] text-[13px] text-[rgba(0,0,0,0.6)] transition-colors hover:border-accent-brand hover:bg-accent-brand hover:text-white"
              >
                &#x2715;
              </button>
            </div>
            <div className="m-3.5 min-h-0 flex-1 overflow-auto rounded-[12px] bg-[#0e0e11]">
              <pre className="m-0 p-[18px] font-mono text-[11px] leading-[1.65] whitespace-pre text-[#d9d9de]">
                {highlightJson(target.raw)}
              </pre>
            </div>
          </div>
        </>
      ) : null}
    </FhirDrawerContext>
  );
}

// The server-name prefix mirrors which server each dashboard API route fetches the type from; Observation exists on both (live vitals on care-loop, EHR intake baselines), so those call sites pass an explicit server override.
const SERVER_PREFIXES = {
  "care-loop": "care-loop-fhir-server /fhir",
  ehr: "ehr-fhir-server /fhir/r4",
} as const;

const EHR_RESOURCE_TYPES = new Set([
  "AllergyIntolerance",
  "Condition",
  "Encounter",
  "MedicationRequest",
  "Task",
]);

function fhirDrawerPath(resourcePath: string, server?: keyof typeof SERVER_PREFIXES): string {
  const resourceType = resourcePath.split("/")[0];
  const prefix =
    SERVER_PREFIXES[server ?? (EHR_RESOURCE_TYPES.has(resourceType) ? "ehr" : "care-loop")];
  return `${prefix}/${resourcePath}`;
}

export function FhirButton({
  resourcePath,
  raw,
  className,
  label = "FHIR",
  size = "sm",
  server,
}: {
  resourcePath: string;
  raw: unknown;
  className?: string;
  label?: string;
  size?: "sm" | "md";
  server?: "care-loop" | "ehr";
}) {
  const { open } = useFhirDrawer();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open({ resourcePath: fhirDrawerPath(resourcePath, server), raw });
      }}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap border border-[rgba(0,0,0,0.1)] bg-[rgba(0,0,0,0.04)] font-mono text-[10px] font-semibold text-[rgba(0,0,0,0.6)] transition-colors hover:border-accent-brand hover:bg-accent-brand hover:text-white",
        size === "sm" ? "rounded-[5px] px-2 py-[3px]" : "rounded-[6px] px-2.5 py-[5px]",
        className,
      )}
    >
      {`{ } ${label}`}
    </button>
  );
}
