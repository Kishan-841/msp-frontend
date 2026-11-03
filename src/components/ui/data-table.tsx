"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search as SearchIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  /** Unique key for the column. */
  key: string;
  /** Rendered header content. */
  header: React.ReactNode;
  /** Cell renderer. Receives the row and the row index. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Extra classes applied to the <td>. */
  className?: string;
  /** Extra classes applied to the <th>. */
  headClassName?: string;
}

interface DataTableProps<T> {
  /** Card header title (e.g. "Customers"). */
  title?: React.ReactNode;
  /** Count shown next to the title — typically the total count. */
  count?: number;
  /** Column definitions. */
  columns: DataTableColumn<T>[];
  /** Row data for the current page. */
  data: T[];
  /** Stable key function for each row. */
  getRowKey: (row: T, index: number) => string;

  /** Loading state (shows skeleton rows). */
  loading?: boolean;
  /** Empty-state message. */
  emptyMessage?: React.ReactNode;

  /** Search input value (controlled). Omit to hide the search box. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  /** Pagination — all required to enable the footer. */
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];

  /** Optional extra toolbar content (filters, buttons) rendered in the header. */
  toolbar?: React.ReactNode;

  /** Callback when a row is clicked. */
  onRowClick?: (row: T, index: number) => void;

  className?: string;
}

export function DataTable<T>({
  title,
  count,
  columns,
  data,
  getRowKey,
  loading = false,
  emptyMessage = "No data found.",
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  toolbar,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const hasSearch = typeof searchValue === "string" && !!onSearchChange;
  const hasPagination =
    typeof total === "number" &&
    typeof page === "number" &&
    typeof pageSize === "number" &&
    !!onPageChange;

  const totalPages = hasPagination
    ? Math.max(1, Math.ceil((total ?? 0) / (pageSize ?? 1)))
    : 1;
  const startItem =
    hasPagination && (total ?? 0) > 0 ? (page! - 1) * pageSize! + 1 : 0;
  const endItem = hasPagination
    ? Math.min(page! * pageSize!, total ?? 0)
    : 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm overflow-hidden",
        className
      )}
    >
      {/* Header */}
      {(title !== undefined || hasSearch || toolbar) && (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {title !== undefined && (
              <h2 className="text-base font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {typeof count === "number" && (
              <span className="text-sm text-muted-foreground">({count})</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {toolbar}
            {hasSearch && (
              <div className="relative w-full sm:w-72">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="h-9 pl-9"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page-size selector */}
      {hasPagination && onPageSizeChange && (
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm text-muted-foreground">
          <span>Show</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              if (!v) return;
              onPageSizeChange(Number(v));
              onPageChange?.(1);
            }}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>entries</span>
        </div>
      )}

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
            <tr className="border-b border-border">
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                    i < columns.length - 1 && "border-r border-border",
                    col.headClassName
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr
                  key={`skeleton-${rowIdx}`}
                  className="border-b border-border last:border-b-0"
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-5 py-4",
                        i < columns.length - 1 && "border-r border-border"
                      )}
                    >
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={getRowKey(row, rowIdx)}
                  onClick={
                    onRowClick ? () => onRowClick(row, rowIdx) : undefined
                  }
                  className={cn(
                    "group border-b border-border transition-colors last:border-b-0 hover:bg-muted/40",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-5 py-4 align-middle",
                        i < columns.length - 1 && "border-r border-border",
                        col.className
                      )}
                    >
                      {col.cell(row, rowIdx)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / Pagination */}
      {hasPagination && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground sm:flex-row">
          <p>
            {(total ?? 0) === 0
              ? "No results"
              : `Showing ${startItem} to ${endItem} of ${total} results`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="First page"
              disabled={page! <= 1}
              onClick={() => onPageChange?.(1)}
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={page! <= 1}
              onClick={() => onPageChange?.(page! - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-3 text-xs font-medium text-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={page! >= totalPages}
              onClick={() => onPageChange?.(page! + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Last page"
              disabled={page! >= totalPages}
              onClick={() => onPageChange?.(totalPages)}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
