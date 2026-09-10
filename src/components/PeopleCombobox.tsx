"use client";

import { useEffect, useRef, useState } from "react";
import type { Person } from "@/lib/types";

// Searchable + creatable select backing Accountable/Responsible (FR-8): typing a
// name with no exact match offers "Add '{name}'", which POSTs /api/people and
// selects the result inline - there is no separate people-management screen.
export function PeopleCombobox({
  value,
  onChange,
  placeholder = "Search people...",
}: {
  value: Person | null;
  onChange: (person: Person | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/people?q=${encodeURIComponent(query)}`);
      setResults(await res.json());
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const exactMatch = results.some((p) => p.name.toLowerCase() === query.trim().toLowerCase());

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const person: Person = await res.json();
      onChange(person);
      setOpen(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  }

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
            placeholder="Type a name..."
            className="w-full border-b border-border px-3 py-2 text-[13px] outline-none"
          />
          <div className="max-h-48 overflow-y-auto py-1">
            {results.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left text-[13px] hover:bg-app"
              >
                {p.name}
              </button>
            ))}
            {query.trim() && !exactMatch && (
              <button
                type="button"
                disabled={creating}
                onClick={handleCreate}
                className="block w-full px-3 py-2 text-left text-[13px] font-medium text-primary hover:bg-app disabled:opacity-50"
              >
                + Add &quot;{query.trim()}&quot;
              </button>
            )}
            {results.length === 0 && !query.trim() && (
              <div className="px-3 py-2 text-[13px] text-text-secondary">Start typing to search...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
