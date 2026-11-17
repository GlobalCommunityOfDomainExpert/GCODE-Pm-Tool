"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/apiFetch";
import { showActionError, showActionSuccess } from "./ActionToast";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";
import { LEVELS, LEVEL_NAMES, type RowIssue } from "@/lib/excel/schema";
import type { Counts } from "@/lib/excel/plan";

const ENDPOINT = "/api/hierarchy/excel";

type Preview = { counts: Counts; warnings: RowIssue[] };

// Admin-only (the page only renders this for an org Admin; the API re-checks).
// Flow: pick file -> Preview (nothing written, every problem listed) ->
// Import (same validation again, then one all-or-nothing transaction).
export function ExcelTransfer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<RowIssue[]>([]);
  const [totalErrors, setTotalErrors] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setErrors([]);
    setTotalErrors(0);
    setPreview(null);
    if (input.current) input.current.value = "";
  }

  function close() {
    reset();
    setOpen(false);
  }

  async function send(commit: boolean) {
    if (!file) return;
    setBusy(true);
    setErrors([]);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch(`${ENDPOINT}${commit ? "?commit=1" : ""}`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const list: RowIssue[] = data.errors ?? [{ row: 0, message: data.error || "Import failed." }];
        setErrors(list);
        setTotalErrors(data.totalErrors ?? list.length);
        setPreview(null);
        return;
      }
      if (commit) {
        showActionSuccess(`Imported: ${data.applied.created} created, ${data.applied.updated} updated, ${data.applied.unchanged} unchanged.`);
        close();
        router.refresh();
      } else {
        setPreview({ counts: data.counts, warnings: data.warnings ?? [] });
      }
    } catch {
      showActionError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const changes = preview ? LEVELS.reduce((a, l) => a + preview.counts[l].create + preview.counts[l].update, 0) : 0;

  const footer = (
    <>
      <button type="button" onClick={close} disabled={busy} className="rounded-sm border border-border px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 disabled:opacity-50">
        Cancel
      </button>
      {!preview && (
        <button
          type="button"
          data-testid="excel-preview"
          onClick={() => send(false)}
          disabled={!file || busy}
          className="flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {busy && <Spinner className="h-3.5 w-3.5" />} Check file
        </button>
      )}
      {preview && (
        <button
          type="button"
          data-testid="excel-commit"
          onClick={() => send(true)}
          disabled={busy || changes === 0}
          className="flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {busy && <Spinner className="h-3.5 w-3.5" />} {changes === 0 ? "Nothing to import" : `Import ${changes} change${changes === 1 ? "" : "s"}`}
        </button>
      )}
    </>
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <a href={ENDPOINT} data-testid="excel-export" className="rounded-sm border border-border bg-white px-3 py-2 text-[13px] font-medium hover:bg-slate-50">
          Export to Excel
        </a>
        <button type="button" data-testid="excel-open-import" onClick={() => setOpen(true)} className="rounded-sm border border-border bg-white px-3 py-2 text-[13px] font-medium hover:bg-slate-50">
          Import from Excel
        </button>
      </div>

      {open && (
        <Modal onClose={close} title="Import from Excel" subtitle="Admin only · adds and updates, never deletes" maxWidth="640px" closeDisabled={busy} footer={footer}>
          <div className="space-y-4 text-[13px]" data-testid="excel-modal">
            <p className="text-text-secondary">
              Start from an export of your current data (or the{" "}
              <a className="text-primary underline" href={`${ENDPOINT}?template=1`}>
                blank template
              </a>
              ). Nothing is saved until you review the check below. If any row has a problem, nothing is imported.
            </p>

            <input
              ref={input}
              type="file"
              data-testid="excel-file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setErrors([]);
                setPreview(null);
              }}
              className="block w-full text-[13px]"
            />

            {errors.length > 0 && (
              <div data-testid="excel-errors" className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                <div className="font-semibold text-danger">
                  {totalErrors} problem{totalErrors === 1 ? "" : "s"} found - fix the file and check again
                </div>
                <ul className="mt-2 max-h-[34vh] list-disc space-y-1 overflow-y-auto pl-5 text-red-900">
                  {errors.map((er, i) => (
                    <li key={i}>
                      {er.row > 0 && <b>Row {er.row}</b>}
                      {er.column && <> · {er.column}</>}
                      {er.row > 0 || er.column ? ": " : ""}
                      {er.message}
                    </li>
                  ))}
                </ul>
                {totalErrors > errors.length && <p className="mt-2 text-red-900">…and {totalErrors - errors.length} more.</p>}
              </div>
            )}

            {preview && (
              <div data-testid="excel-preview-result" className="rounded-md border border-border bg-slate-50 px-4 py-3">
                <div className="mb-2 font-semibold">File is valid. This import will:</div>
                <table className="w-full text-left">
                  <thead className="text-[12px] text-text-secondary">
                    <tr>
                      <th className="py-1 font-medium">Level</th>
                      <th className="py-1 font-medium">Create</th>
                      <th className="py-1 font-medium">Update</th>
                      <th className="py-1 font-medium">Unchanged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LEVELS.map((l) => (
                      <tr key={l}>
                        <td className="py-0.5">{LEVEL_NAMES[l]}s</td>
                        <td>{preview.counts[l].create}</td>
                        <td>{preview.counts[l].update}</td>
                        <td className="text-text-secondary">{preview.counts[l].unchanged}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.warnings.map((w, i) => (
                  <p key={i} className="mt-2 text-amber-800">
                    {w.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
