import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  sublabel: string;
  trend?: { direction: "up" | "down"; value: string };
}

export function StatCard({
  label,
  value,
  icon: Icon,
  sublabel,
  trend,
}: StatCardProps) {
  const TrendIcon = trend?.direction === "down" ? TrendingDown : TrendingUp;
  return (
    <Card className="gap-0 overflow-hidden">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  trend.direction === "up" ? "text-primary" : "text-rose-600",
                )}
              >
                <TrendIcon className="size-3" />
                {trend.value}
              </span>
            ) : null}
            {sublabel}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
