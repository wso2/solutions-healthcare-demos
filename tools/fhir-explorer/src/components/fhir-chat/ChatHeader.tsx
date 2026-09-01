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

import { Bot, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  baseUrl: string;
  hasMessages: boolean;
  onClear: () => void;
  onClose: () => void;
}

export function ChatHeader({ baseUrl, hasMessages, onClear, onClose }: ChatHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">FHIR Assistant</h2>
        <p className="truncate text-xs text-muted-foreground" title={baseUrl}>
          Read-only access to {baseUrl}
        </p>
      </div>
      {hasMessages && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClear}
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <RotateCcw className="size-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onClose}
        aria-label="Close FHIR assistant"
      >
        <X className="size-4" />
      </Button>
    </header>
  );
}
