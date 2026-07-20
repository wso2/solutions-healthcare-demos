import { createContext, useContext } from "react";

export interface FhirDrawerTarget {
  resourcePath: string;
  raw: unknown;
}

export interface FhirDrawerContextValue {
  open: (target: FhirDrawerTarget) => void;
}

export const FhirDrawerContext = createContext<FhirDrawerContextValue | null>(null);

export function useFhirDrawer(): FhirDrawerContextValue {
  const ctx = useContext(FhirDrawerContext);
  if (!ctx) throw new Error("useFhirDrawer must be used within FhirDrawerProvider");
  return ctx;
}
