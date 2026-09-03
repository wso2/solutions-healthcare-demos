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
import { COMMON_SEARCH_PARAMS, type SearchParamDef } from "@/lib/fhir-search-params";
import { useResourceSearchParams } from "@/hooks/use-resource-search-params";

interface SearchParamComboboxProps {
  resourceType: string;
  baseUrl: string;
  value: string;
  onChange: (name: string) => void;
  className?: string;
}

const COMMON_NAMES = new Set(COMMON_SEARCH_PARAMS.map((p) => p.name));

/**
 * Autocomplete for a search parameter name, scoped to the selected resource.
 * Shows the parameter type and documentation, and still allows arbitrary names
 * (custom params, chained/modifier syntax) via "Use …".
 */
export function SearchParamCombobox({
  resourceType,
  baseUrl,
  value,
  onChange,
  className,
}: SearchParamComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { params } = useResourceSearchParams(resourceType, baseUrl);

  const { specific, common } = useMemo(() => {
    return {
      specific: params.filter((p) => !COMMON_NAMES.has(p.name)),
      common: params.filter((p) => COMMON_NAMES.has(p.name)),
    };
  }, [params]);

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
          aria-label="Search parameter name"
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
          <CommandInput
            placeholder={`Search ${resourceType} parameters…`}
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
                "No parameter found."
              )}
            </CommandEmpty>

            {specific.length > 0 && (
              <CommandGroup heading={`${resourceType} parameters`}>
                {specific.map((p) => (
                  <ParamItem key={p.name} param={p} onSelect={select} />
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="Result & meta parameters">
              {common.map((p) => (
                <ParamItem key={p.name} param={p} onSelect={select} />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ParamItem({
  param,
  onSelect,
}: {
  param: SearchParamDef;
  onSelect: (name: string) => void;
}) {
  return (
    <CommandItem
      value={param.name}
      onSelect={() => onSelect(param.name)}
      className="flex flex-col items-start gap-0.5"
    >
      <div className="flex w-full items-center gap-2">
        <span className="font-mono text-sm">{param.name}</span>
        {param.type && (
          <Badge variant="outline" className="text-[10px] font-normal">
            {param.type}
          </Badge>
        )}
      </div>
      {param.documentation && (
        <span className="line-clamp-1 text-xs text-muted-foreground">{param.documentation}</span>
      )}
    </CommandItem>
  );
}
