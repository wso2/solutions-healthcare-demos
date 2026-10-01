// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

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
