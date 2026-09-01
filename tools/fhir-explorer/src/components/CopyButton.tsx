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

import { useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** Text written to the clipboard. */
  value: string;
  /** Accessible label; defaults to `Copy <value>`. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Small icon button that copies `value` to the clipboard. Stops event
 * propagation so it can sit inside clickable rows without triggering them.
 */
export function CopyButton({ value, ariaLabel, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={copy}
      aria-label={ariaLabel ?? `Copy ${value}`}
      className={cn("h-6 w-6 shrink-0", className)}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}
