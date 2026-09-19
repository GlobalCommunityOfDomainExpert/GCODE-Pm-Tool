"use client";

import { useEffect, useRef, useState } from "react";
import type { Assignee } from "@/lib/types";
import type { ScopeKind } from "@/lib/auth/scope";

// Searchable, pick-only select backing Accountable/Responsible: results come
// from /api/team/assignable-users, already filtered to real org teammates
// whose RBAC scope covers `kind`+`nodeId` (the item's own (level, id) when
// editing, its parent's (level, id) when creating - see CreateItemModal).
// Unlike the old PeopleCombobox this never lets you type a brand-new name
// into existence - only an actual account with the right scope is selectable.
export function AssigneeCombobox({
  value,
  onChange,
  kind,
  nodeId,
  placeholder = "Search teammates...",
}: {
  value: Assignee | null;
  onChange: (assignee: Assignee | null) => void;
  kind: ScopeKind | null;
  nodeId: string | null;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const handle = setTimeout(async () => {
      const params = new URLSearchParams();
      if (kind && nodeId) {
        params.set("kind", kind);
        params.set("id", nodeId);
      }
      if (query.trim()) params.set("q", query.trim());
      try {
        const res = await fetch(`/api/team/assignable-users?${params.toString()}`);
        setResults(res.ok ? await res.json() : []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, kind, nodeId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-left text-[13px] outline-none"
      >
        {value ? value.name : <span className="text-text-secondary">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-white shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full border-b border-border px-3 py-2 text-[13px] outline-none"
          />
          <div className="max-h-48 overflow-y-auto py-1">
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left text-[13px] text-text-secondary hover:bg-app"
              >
                Unassigned
              </button>
            )}
            {results.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => {
                  onChange(a);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left text-[13px] hover:bg-app"
              >
                <div className="text-text-primary">{a.name}</div>
                {a.email && <div className="text-[11px] text-text-secondary">{a.email}</div>}
              </button>
            ))}
            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-[13px] text-text-secondary">
                {query.trim() ? "No matching teammates in scope." : "No teammates in scope for this level."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
