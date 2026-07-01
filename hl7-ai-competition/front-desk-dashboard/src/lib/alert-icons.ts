import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Droplets,
  Gauge,
  HeartPulse,
  Scale,
  Wind,
} from "lucide-react";

export const alertTypeIcon = {
  "Weight gain": Scale,
  "Rising biomarkers": Activity,
  "Worsening dyspnea": Wind,
  "Low SpO2": Droplets,
  Arrhythmia: HeartPulse,
  "Blood pressure": Gauge,
} satisfies Record<string, LucideIcon>;

export type AlertType = keyof typeof alertTypeIcon;
