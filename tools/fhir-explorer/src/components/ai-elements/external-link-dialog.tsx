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

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";
import type { LinkSafetyModalProps } from "streamdown";

function getDestination(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function ExternalLinkDialog({ isOpen, onClose, onConfirm, url }: LinkSafetyModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-4 rounded-xl p-4">
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="text-base">Open this link?</DialogTitle>
          <DialogDescription className="text-xs">
            This takes you to{" "}
            <span className="font-medium text-foreground">{getDestination(url)}</span>.
          </DialogDescription>
        </DialogHeader>

        <div
          className="truncate rounded-md border bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground"
          title={url}
        >
          {url}
        </div>

        <DialogFooter className="flex-row justify-end gap-2 space-x-0">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            <ExternalLink />
            Open link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
