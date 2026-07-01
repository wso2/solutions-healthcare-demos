"use client";

import type { Task } from "@/lib/types";
import { CheckCircle2, RotateCcw, UserCog, UserPlus } from "lucide-react";

import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useData } from "@/lib/store";
import { cn } from "@/lib/utils";

// Routes a flagged alert to a clinician and renders its lifecycle.
export function AssignControl({
  task,
  className,
}: {
  task: Task;
  className?: string;
}) {
  const { data, getPatient, getDoctor, assignTask, closeTask, reopenTask } =
    useData();
  const patientName = getPatient(task.patientId)?.name ?? "patient";

  if (task.status === "Unassigned") {
    return (
      <Select
        value=""
        onValueChange={(doctorId) => {
          assignTask(task.id, doctorId);
          toast.success("Alert assigned", {
            description: `${patientName} routed to ${
              getDoctor(doctorId)?.name ?? "clinician"
            }.`,
          });
        }}
      >
        <SelectTrigger size="sm" className={cn("w-full sm:w-48", className)}>
          <UserPlus className="size-4 text-muted-foreground" />
          <SelectValue placeholder="Assign to doctor" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectLabel>Assign to doctor</SelectLabel>
            {data.doctors.map((doc) => (
              <SelectItem key={doc.id} value={doc.id}>
                {doc.name} · {doc.specialty}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  const doctor = getDoctor(task.assignedTo);

  if (task.status === "Assigned") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("w-full justify-start gap-2 sm:w-48", className)}
          >
            <Avatar className="size-5">
              <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
                {doctor?.initials ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{doctor?.name ?? "Assigned"}</span>
            <UserCog className="ml-auto size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Reassign to</DropdownMenuLabel>
          {data.doctors.map((doc) => (
            <DropdownMenuItem
              key={doc.id}
              disabled={doc.id === task.assignedTo}
              onSelect={() => {
                assignTask(task.id, doc.id);
                toast.success("Alert reassigned", {
                  description: `${patientName} routed to ${doc.name}.`,
                });
              }}
            >
              <Avatar className="size-5">
                <AvatarFallback className="bg-muted text-[10px] font-medium">
                  {doc.initials}
                </AvatarFallback>
              </Avatar>
              {doc.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              closeTask(task.id);
              toast.success("Alert closed", { description: patientName });
            }}
          >
            <CheckCircle2 />
            Close alert
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Closed
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start gap-2 text-muted-foreground sm:w-48",
            className,
          )}
        >
          <CheckCircle2 className="size-4 text-primary" />
          <span className="truncate">
            Closed{doctor ? ` · ${doctor.initials}` : ""}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onSelect={() => {
            reopenTask(task.id);
            toast.info("Alert reopened", { description: patientName });
          }}
        >
          <RotateCcw />
          Reopen alert
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
