"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HierarchyLevel } from "@/lib/types";
import { LEVEL_LABEL } from "@/lib/types";
import { checkMove, countTasks, findNode, flatten, levelNo, type MoveNode } from "@/lib/move/plan";
import { apiFetch } from "@/lib/client/apiFetch";
import { mutate } from "./ActionToast";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

const TAG = (level: HierarchyLevel) => `L${levelNo(level)}`;

type Step = "pick" | "confirm";

// "Move to..." for one item: pick a new parent, review, and (only if the
// shifted subtree would run past L5) tick which levels to remove. Nothing is
// written until the final Confirm. Validation is the same pure function the
// server re-runs (lib/move/plan.ts).
export function MoveItemModal({
  level,
  id,
  name,
  onClose,
  onMoved,
}: {
  level: HierarchyLevel;
  id: string;
  name: string;
  onClose: () => void;
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [forest, setForest] = useState<MoveNode[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [deleteIds, setDeleteIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch("/api/move")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) setLoadError(data?.error || "Couldn't load the hierarchy.");
        else setForest(data.tree as MoveNode[]);
      })
      .catch(() => live && setLoadError("Couldn't load the hierarchy."));
    return () => {
      live = false;
    };
  }, []);

  const source = useMemo(() => {
    if (!forest) return null;
    for (const root of forest) {
      const hit = findNode(root, id);
      if (hit) return hit;
    }
    return null;
  }, [forest, id]);

  const parentOfSource = useMemo(() => {
    if (!forest || !source) return null;
    for (const root of forest) {
      for (const n of flatten(root)) if (n.children.some((c) => c.id === id)) return n.id;
    }
    return null;
  }, [forest, source, id]);

  const target = useMemo(() => {
    if (!forest || !targetId) return null;
    for (const root of forest) {
      const hit = findNode(root, targetId);
      if (hit) return hit;
    }
    return null;
  }, [forest, targetId]);

  const check = useMemo(
    () => (source && target ? checkMove(source, levelNo(target.level), deleteIds) : null),
    [source, target, deleteIds]
  );

  // Items inside the moved subtree can't be targets (that would nest it in itself).
  const blocked = useMemo(() => new Set(source ? flatten(source).map((n) => n.id) : []), [source]);

  function pickTarget(node: MoveNode) {
    setTargetId(node.id);
    setDeleteIds(new Set());
    setStep("confirm");
  }

  function toggleDelete(nodeId: string) {
    setDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  async function handleConfirm() {
    if (!source || !target || !check?.ok) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          sourceLevel: source.level,
          targetId: target.id,
          targetLevel: target.level,
          deleteIds: [...deleteIds],
        }),
      });
      if (await mutate(res, { success: `${LEVEL_LABEL[level]} moved.`, failure: "Couldn't move this item." })) {
        onMoved?.();
        onClose();
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  const footer =
    step === "confirm" ? (
      <>
        <button
          onClick={() => setStep("pick")}
          disabled={saving}
          className="rounded-sm px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-slate-100 disabled:opacity-50"
        >
          Back
        </button>
        <button
          data-testid="move-confirm"
          onClick={handleConfirm}
          disabled={saving || !check?.ok}
          className={`flex items-center gap-2 rounded-sm px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-50 ${
            deleteIds.size > 0 ? "bg-danger hover:bg-red-600" : "bg-primary hover:bg-primary-hover"
          }`}
        >
          {saving && <Spinner className="h-3.5 w-3.5" />}
          {deleteIds.size > 0 ? `Move and remove ${deleteIds.size} item${deleteIds.size === 1 ? "" : "s"}` : "Confirm move"}
        </button>
      </>
    ) : undefined;

  return (
    <Modal
      onClose={onClose}
      title={`Move ${LEVEL_LABEL[level].toLowerCase()}`}
      subtitle={name}
      maxWidth="640px"
      closeDisabled={saving}
      footer={footer}
    >
      <div data-testid="move-modal">
        {loadError && <p className="text-[13px] text-danger">{loadError}</p>}
        {!loadError && !forest && (
          <div className="flex items-center gap-2 text-[13px] text-text-secondary">
            <Spinner className="h-4 w-4" /> Loading…
          </div>
        )}

        {forest && !source && <p className="text-[13px] text-danger">This item no longer exists.</p>}

        {forest && source && step === "pick" && (
          <div>
            <p className="mb-3 text-[13px] text-text-secondary">Choose the item it should go under. Tasks can only go under a project.</p>
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border py-1">
              {forest.map((root) => (
                <PickRow key={root.id} node={root} depth={0} blocked={blocked} currentParent={parentOfSource} onPick={pickTarget} />
              ))}
            </div>
          </div>
        )}

        {forest && source && step === "confirm" && target && check && (
          <div className="space-y-4 text-[13px]">
            <div className="rounded-md border border-border bg-slate-50 px-4 py-3">
              <div>
                Move <b>{source.name}</b> ({TAG(source.level)} {LEVEL_LABEL[source.level]})
              </div>
              <div className="mt-1">
                under <b data-testid="move-target-name">{target.name}</b> ({TAG(target.level)} {LEVEL_LABEL[target.level]})
              </div>
              <div className="mt-2 text-text-secondary">
                It becomes {TAG(levelFor(check.newRootLevel))} {LEVEL_LABEL[levelFor(check.newRootLevel)]}
                {check.shift !== 0 && deleteIds.size === 0 && `, and everything inside shifts ${check.shift > 0 ? "down" : "up"} ${Math.abs(check.shift)} level${Math.abs(check.shift) === 1 ? "" : "s"}`}
                . All {countTasks(source)} task{countTasks(source) === 1 ? "" : "s"} are kept.
              </div>
            </div>

            {check.needsRemoval && (
              <div data-testid="move-overflow" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
                <div className="font-semibold text-amber-800">Not enough levels - remove {Math.max(check.shift, 1)} level{Math.max(check.shift, 1) === 1 ? "" : "s"} from the moved items</div>
                <p className="mt-1 text-amber-800">
                  Tick the items to remove on <b>every branch</b>. Their children move up one level and take their place. Tasks are never removed.
                </p>
                <div className="mt-3 max-h-[34vh] overflow-y-auto rounded-md border border-amber-200 bg-white py-1">
                  <DeleteRow node={source} depth={0} deleteIds={deleteIds} onToggle={toggleDelete} />
                </div>
              </div>
            )}

            {check.deleted.length > 0 && (
              <div data-testid="move-delete-summary" className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-danger">
                Will be permanently deleted ({check.deleted.length}):{" "}
                {check.deleted.map((d) => `${d.name} (${LEVEL_LABEL[d.level]})`).join(", ")}. Role assignments scoped to them are dropped. Their children are kept.
              </div>
            )}

            {check.errors.length > 0 && (
              <ul data-testid="move-errors" className="list-disc space-y-1 pl-5 text-danger">
                {check.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}

            {check.ok && check.converted.some((c) => c.fromLevel === "workspace") && (
              <p className="text-text-secondary">A workspace logo isn&apos;t kept below the top level.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function levelFor(no: number): HierarchyLevel {
  return (["workspace", "initiative", "program", "project", "task"] as HierarchyLevel[])[Math.min(Math.max(no, 1), 5) - 1];
}

function PickRow({
  node,
  depth,
  blocked,
  currentParent,
  onPick,
}: {
  node: MoveNode;
  depth: number;
  blocked: Set<string>;
  currentParent: string | null;
  onPick: (n: MoveNode) => void;
}) {
  if (node.level === "task") return null;
  const isBlocked = blocked.has(node.id);
  const isCurrent = node.id === currentParent;
  return (
    <>
      <button
        type="button"
        data-testid={`move-target-${node.id}`}
        disabled={isBlocked || isCurrent}
        onClick={() => onPick(node)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{TAG(node.level)}</span>
        <span className="truncate">{node.name}</span>
        {isCurrent && <span className="ml-auto text-[11px] text-text-secondary">current parent</span>}
        {isBlocked && !isCurrent && <span className="ml-auto text-[11px] text-text-secondary">moving</span>}
      </button>
      {node.children.map((c) => (
        <PickRow key={c.id} node={c} depth={depth + 1} blocked={blocked} currentParent={currentParent} onPick={onPick} />
      ))}
    </>
  );
}

function DeleteRow({
  node,
  depth,
  deleteIds,
  onToggle,
}: {
  node: MoveNode;
  depth: number;
  deleteIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (node.level === "task") return null;
  const tasks = node.level === "project" ? node.children.length : 0;
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-slate-50" style={{ paddingLeft: 12 + depth * 20 }}>
        <input
          type="checkbox"
          data-testid={`move-del-${node.id}`}
          checked={deleteIds.has(node.id)}
          onChange={() => onToggle(node.id)}
        />
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{TAG(node.level)}</span>
        <span className={`truncate ${deleteIds.has(node.id) ? "text-danger line-through" : ""}`}>{node.name}</span>
        {tasks > 0 && <span className="ml-auto text-[11px] text-text-secondary">{tasks} task{tasks === 1 ? "" : "s"}</span>}
      </label>
      {node.children.map((c) => (
        <DeleteRow key={c.id} node={c} depth={depth + 1} deleteIds={deleteIds} onToggle={onToggle} />
      ))}
    </>
  );
}
