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

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

/** Section of repeatable rows with the shared "Label + Add row" header. */
export function RowSection({
  label,
  addLabel,
  onAdd,
  children,
}: {
  label: ReactNode;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /> {addLabel}
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Ghost trash-icon button used to delete one row. */
export function RemoveRowButton({
  onClick,
  ariaLabel,
}: {
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={ariaLabel}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
