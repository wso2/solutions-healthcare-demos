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

import { useState } from "react";
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
import type { OperationParam } from "@/lib/fhir-operations";

interface OperationParamComboboxProps {
  /** The selected operation's documented input parameters. */
  params: readonly OperationParam[];
  value: string;
  onChange: (name: string) => void;
  className?: string;
}

/**
 * Autocomplete for an operation input-parameter name, scoped to the selected
 * operation. Mirrors SearchParamCombobox: shows the parameter type/docs and
 * still allows arbitrary names (undocumented params) via "Use …".
 */
export function OperationParamCombobox({
  params,
  value,
  onChange,
  className,
}: OperationParamComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function select(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  const trimmed = query.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Parameter name"
          className={cn("w-full justify-between font-mono text-sm font-normal", className)}
        >
          <span className={cn("truncate", !value && "font-sans text-muted-foreground")}>
            {value || "parameter…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0"
      >
        <Command>
          <CommandInput placeholder="Search parameters…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {trimmed ? (
                <button
                  type="button"
                  onClick={() => select(trimmed)}
                  className="mx-auto block rounded px-2 py-1 text-sm text-foreground hover:underline"
                >
                  Use “{trimmed}”
                </button>
              ) : (
                "No parameter found."
              )}
            </CommandEmpty>

            {params.length > 0 && (
              <CommandGroup heading="Parameters">
                {params.map((p) => (
                  <CommandItem
                    key={p.name}
                    value={p.name}
                    onSelect={() => select(p.name)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="font-mono text-sm">{p.name}</span>
                      {p.type && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {p.type}
                        </Badge>
                      )}
                      {p.min ? (
                        <span className="text-[10px] text-destructive">required</span>
                      ) : null}
                    </div>
                    {p.documentation && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {p.documentation}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
