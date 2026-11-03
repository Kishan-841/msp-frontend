"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { useDataChanged } from "@/hooks/useDataChanged";

/** Server page envelope: GET …?page=&limit= → { items, total, page, limit, totalPages, …extra } */
interface Envelope<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  [extra: string]: unknown;
}

type Params = Record<string, string | number | undefined>;

/**
 * One server page of a list at a time (accounts, vendors, users).
 * - search is debounced (300 ms) and sent as ?search=
 * - changing `params` (filters) or the search goes back to page 1
 * - first load shows the table spinner; later refreshes (live `data:changed`, refreshKey) keep the rows
 */
export function usePagedList<T>(
  url: string,
  params: Params,
  opts: { enabled?: boolean; refreshKey?: number; errorTitle: string; defaultPageSize?: number }
) {
  const { enabled = true, refreshKey = 0, errorTitle, defaultPageSize = 20 } = opts;
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [search, setSearchRaw] = useState("");
  const [debounced, setDebounced] = useState("");
  const reqId = useRef(0);

  // filters changed → back to page 1 (derived-state reset during render, no effect needed)
  const paramsKey = JSON.stringify(params);
  const [lastKey, setLastKey] = useState(paramsKey);
  if (lastKey !== paramsKey) {
    setLastKey(paramsKey);
    setPage(1);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(async () => {
    if (!enabled) return;
    const id = ++reqId.current;
    try {
      const { data } = await api.get(url, {
        params: { ...JSON.parse(paramsKey), page, limit: pageSize, search: debounced || undefined },
      });
      if (id !== reqId.current) return; // a newer request is on its way
      const env = data.data as Envelope<T>;
      setItems(env.items ?? []);
      setTotal(env.total ?? 0);
      // anything beyond the standard fields (e.g. `unpaid`) is passed through
      const rest: Record<string, unknown> = { ...env };
      for (const k of ["items", "total", "page", "limit", "totalPages"]) delete rest[k];
      setExtra(rest);
    } catch (err) {
      if (id === reqId.current) notify.apiError(err, errorTitle);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [enabled, url, paramsKey, page, pageSize, debounced, errorTitle]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage, refreshKey]);
  useDataChanged(fetchPage);

  return {
    items,
    total,
    extra,
    loading,
    refetch: fetchPage,
    search,
    setSearch: setSearchRaw,
    /** props to spread on <DataTable> for server paging */
    pagination: {
      total,
      page,
      pageSize,
      onPageChange: setPage,
      onPageSizeChange: (n: number) => {
        setPageSize(n);
        setPage(1);
      },
    },
  };
}

/** A count from a 1-row page (`total`, or an extra like `unpaid`) — for tab pills */
export function usePagedCount(url: string, params: Params, refreshKey = 0, field: string = "total") {
  const [count, setCount] = useState<number | undefined>(undefined);
  const key = JSON.stringify(params);
  const fetchCount = useCallback(async () => {
    try {
      const { data } = await api.get(url, { params: { ...JSON.parse(key), page: 1, limit: 1 } });
      const n = (data.data as Record<string, unknown>)[field];
      setCount(typeof n === "number" ? n : undefined);
    } catch {
      // pills are a convenience — the list itself reports errors
    }
  }, [url, key, field]);
  useEffect(() => {
    // request after the effect; state is only set when it resolves
    const t = setTimeout(fetchCount, 0);
    return () => clearTimeout(t);
  }, [fetchCount, refreshKey]);
  useDataChanged(fetchCount);
  return count;
}
