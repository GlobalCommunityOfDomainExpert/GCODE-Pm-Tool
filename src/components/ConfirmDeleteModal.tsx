"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export function ConfirmDeleteModal({
  label,
  itemName,
  onCancel,
  onConfirm,
}: {
  label: string;
  itemName: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      onClose={onCancel}
      title={`Delete ${label}?`}
      tone="danger"
      maxWidth="420px"
      closeDisabled={deleting}
      icon={
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 004.18 21h15.64a2 2 0 001.87-2.96L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      }
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-sm px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded-sm bg-danger px-5 py-2.5 text-[13px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Are you sure you want to delete <span className="font-medium text-text-primary">&quot;{itemName}&quot;</span>? This action cannot be undone.
      </p>
    </Modal>
  );
}
