"use client";

import type { Task, TaskStatus } from "@/lib/types";

import * as React from "react";
import { TaskList } from "@/components/task-list";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const filters: { label: string; value: "All" | TaskStatus }[] = [
  { label: "All", value: "All" },
  { label: "Unassigned", value: "Unassigned" },
  { label: "Assigned", value: "Assigned" },
  { label: "Closed", value: "Closed" },
];

export function TaskQueue({ tasks }: { tasks: Task[] }) {
  const [tab, setTab] = React.useState<"All" | TaskStatus>("All");

  const counts = React.useMemo(
    () => ({
      All: tasks.length,
      Unassigned: tasks.filter((t) => t.status === "Unassigned").length,
      Assigned: tasks.filter((t) => t.status === "Assigned").length,
      Closed: tasks.filter((t) => t.status === "Closed").length,
    }),
    [tasks],
  );

  const sorted = React.useMemo(
    () => [...tasks].sort((a, b) => b.order - a.order),
    [tasks],
  );

  const visible =
    tab === "All" ? sorted : sorted.filter((t) => t.status === tab);

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="border-b pb-4">
        <CardTitle>Alert queue</CardTitle>
        <CardDescription>
          Remote-monitoring alerts flagged for triage. Assign each to a
          clinician.
        </CardDescription>
      </CardHeader>
      <div className="px-4 pt-4">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "All" | TaskStatus)}
        >
          <TabsList>
            {filters.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
                {f.label}
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 px-1 tabular-nums"
                >
                  {counts[f.value]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <CardContent className="px-2 pt-2">
        <TaskList tasks={visible} />
      </CardContent>
    </Card>
  );
}
