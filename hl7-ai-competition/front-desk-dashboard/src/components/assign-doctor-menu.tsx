"use client";

import { UserRound } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadAssignments, MOCK_DOCTORS, saveAssignment } from "@/lib/assignments";

export function AssignDoctorMenu({ taskId }: { taskId: string }) {
  const [assignee, setAssignee] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    setAssignee(loadAssignments()[taskId]);
  }, [taskId]);

  function assign(doctor: string | undefined) {
    saveAssignment(taskId, doctor);
    setAssignee(doctor);
  }

  return (
    // Stops a row-level onClick (used to navigate) from firing when triaging here.
    <div onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={assignee ? "secondary" : "outline"} size="sm">
            <UserRound className="size-3.5" />
            {assignee ?? "Assign"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {MOCK_DOCTORS.map((doctor) => (
            <DropdownMenuItem key={doctor} onSelect={() => assign(doctor)}>
              {doctor}
            </DropdownMenuItem>
          ))}
          {assignee ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => assign(undefined)}
              >
                Unassign
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
