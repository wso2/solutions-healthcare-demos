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

import { useCallback, useState } from "react";

const PAGER_BUTTON =
  "cursor-pointer rounded-[7px] border border-[rgba(0,0,0,0.14)] bg-white px-3 py-[5px] text-[11px] font-semibold text-[#16161a] hover:border-accent-brand hover:bg-accent-brand hover:text-white disabled:pointer-events-none disabled:text-[rgba(0,0,0,0.25)]";

export interface Pager {
  currentPage: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  setPage: (page: number) => void;
  reset: () => void;
}

// Clamping (rather than resetting) keeps the user on their page when the poll grows or shrinks the list underneath them.
export function usePagination(total: number, pageSize: number): Pager {
  const [page, setPage] = useState(0);
  const reset = useCallback(() => setPage(0), []);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * pageSize;
  return {
    currentPage,
    totalPages,
    start,
    end: Math.min(start + pageSize, total),
    total,
    setPage,
    reset,
  };
}

export function PaginationFooter({ pager }: { pager: Pager }) {
  if (pager.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-2.5">
      <span className="text-[11.5px] text-[rgba(0,0,0,0.45)]">
        {`Showing ${pager.start + 1}–${pager.end} of ${pager.total} · page ${pager.currentPage + 1} / ${pager.totalPages}`}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pager.currentPage === 0}
          onClick={() => pager.setPage(Math.max(0, pager.currentPage - 1))}
          className={PAGER_BUTTON}
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={pager.currentPage >= pager.totalPages - 1}
          onClick={() => pager.setPage(Math.min(pager.totalPages - 1, pager.currentPage + 1))}
          className={PAGER_BUTTON}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
