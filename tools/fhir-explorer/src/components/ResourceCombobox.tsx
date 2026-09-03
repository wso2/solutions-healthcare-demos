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
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { partitionResourceTypes } from "@/lib/fhir-resources";
import { useSupportedResourceTypes } from "@/hooks/use-capabilities";

interface ResourceComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Used to fetch the server's supported resource types (surfaced first). */
  baseUrl?: string;
  /** id for an associated <label htmlFor>. */
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Searchable resource-type picker. Surfaces the server's supported resources
 * first (from its CapabilityStatement), then the full FHIR R4 catalogue, and
 * still lets power users enter an arbitrary/custom type via "Use …".
 */
export function ResourceCombobox({
  value,
  onChange,
  baseUrl,
  id,
  ariaLabel,
  placeholder = "Select resource type…",
  className,
  disabled,
}: ResourceComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const supported = useSupportedResourceTypes(baseUrl ?? "");

  const { supported: supportedTypes, others } = useMemo(
    () => partitionResourceTypes(supported),
    [supported],
  );

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
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("w-full justify-between font-mono", className)}
        >
          <span className={cn("truncate", !value && "font-sans text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-0"
      >
        <Command>
          <CommandInput
            placeholder="Search resource type…"
            value={query}
            onValueChange={setQuery}
          />
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
                "No resource type found."
              )}
            </CommandEmpty>

            {supportedTypes.length > 0 && (
              <CommandGroup heading="Supported by this server">
                {supportedTypes.map((type) => (
                  <ResourceItem key={type} type={type} selected={value} onSelect={select} />
                ))}
              </CommandGroup>
            )}

            <CommandGroup
              heading={supportedTypes.length > 0 ? "All FHIR R4 resources" : "FHIR R4 resources"}
            >
              {others.map((type) => (
                <ResourceItem key={type} type={type} selected={value} onSelect={select} />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ResourceItem({
  type,
  selected,
  onSelect,
}: {
  type: string;
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <CommandItem value={type} onSelect={() => onSelect(type)} className="font-mono">
      <Check className={cn("mr-2 h-4 w-4", selected === type ? "opacity-100" : "opacity-0")} />
      {type}
    </CommandItem>
  );
}
