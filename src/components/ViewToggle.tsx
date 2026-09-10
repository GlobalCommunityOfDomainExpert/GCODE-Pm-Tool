"use client";

export type ViewMode = "cards" | "list";

export function ViewToggle({
  mode,
  onChange,
  cardsLabel = "Cards",
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  cardsLabel?: string;
}) {
  return (
    <div className="flex gap-1 rounded-md bg-slate-100 p-1">
      {(["cards", "list"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
            mode === m ? "bg-white text-primary shadow-sm" : "text-text-secondary"
          }`}
        >
          {m === "cards" ? cardsLabel : "List"}
        </button>
      ))}
    </div>
  );
}
