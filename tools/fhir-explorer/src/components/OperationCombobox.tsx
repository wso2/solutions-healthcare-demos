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

import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useOperations, type AvailableOperation } from "@/hooks/use-operations";
import type { OperationScope } from "@/lib/fhir-operations";

interface OperationComboboxProps {
  scope: OperationScope;
  resourceType: string;
  baseUrl: string;
  /** Selected operation name without the leading "$". */
  value: string;
  onChange: (name: string) => void;
  className?: string;
}

/**
 * Autocomplete for a FHIR operation, scoped to the chosen level/resource type.
 * Groups operations the server advertises ahead of the curated catalogue, shows
 * GET/POST and documentation, and still allows arbitrary names via "Use $…".
 */
export function OperationCombobox({
  scope,
  resourceType,
  baseUrl,
  value,
  onChange,
  className,
}: OperationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { operations } = useOperations(scope, resourceType, baseUrl);

  const { advertised, catalogue } = useMemo(
    () => ({
      advertised: operations.filter((o) => o.advertised),
      catalogue: operations.filter((o) => !o.advertised),
    }),
    [operations],
  );

  function select(next: string) {
    onChange(next.replace(/^\$/, ""));
    setQuery("");
    setOpen(false);
  }

  const trimmed = query.trim().replace(/^\$/, "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Operation"
          className={cn("w-full justify-between font-mono text-sm font-normal", className)}
        >
          <span className={cn("truncate", !value && "font-sans text-muted-foreground")}>
            {value ? `$${value}` : "operation…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[20rem] p-0"
      >
        <Command>
          <CommandInput placeholder="Search operations…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {trimmed ? (
                <button
                  type="button"
                  onClick={() => select(trimmed)}
                  className="mx-auto block rounded px-2 py-1 text-sm text-foreground hover:underline"
                >
                  Use “${trimmed}”
                </button>
              ) : (
                "No operation found."
              )}
            </CommandEmpty>

            {advertised.length > 0 && (
              <CommandGroup heading="Supported by this server">
                {advertised.map((op) => (
                  <OperationItem key={op.name} op={op} onSelect={select} />
                ))}
              </CommandGroup>
            )}

            {catalogue.length > 0 && (
              <CommandGroup heading="Common FHIR operations">
                {catalogue.map((op) => (
                  <OperationItem key={op.name} op={op} onSelect={select} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function OperationItem({
  op,
  onSelect,
}: {
  op: AvailableOperation;
  onSelect: (name: string) => void;
}) {
  return (
    <CommandItem
      value={op.name}
      onSelect={() => onSelect(op.name)}
      className="flex flex-col items-start gap-0.5"
    >
      <div className="flex w-full items-center gap-2">
        <span className="font-mono text-sm">${op.name}</span>
        <Badge variant="outline" className="text-[10px] font-normal">
          {op.affectsState ? "POST" : "GET"}
        </Badge>
      </div>
      {op.documentation && (
        <span className="line-clamp-1 text-xs text-muted-foreground">{op.documentation}</span>
      )}
    </CommandItem>
  );
}
