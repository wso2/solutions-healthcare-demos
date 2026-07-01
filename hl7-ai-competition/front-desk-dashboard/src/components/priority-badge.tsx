import type { TaskPriority } from "@/lib/types";

import { AlertTriangle, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const config: Record<TaskPriority, { className: string; icon: typeof Minus }> =
  {
    Urgent: {
      className: "bg-rose-500/12 text-rose-600",
      icon: AlertTriangle,
    },
    Routine: {
      className: "bg-slate-500/12 text-slate-600",
      icon: Minus,
    },
  };

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const { className: tone, icon: Icon } = config[priority];
  return (
    <Badge variant="ghost" className={cn("gap-1 font-medium", tone, className)}>
      <Icon data-icon="inline-start" />
      {priority}
    </Badge>
  );
}
