"use client";

import { useState } from "react";
import { Modal } from "./Modal";

// Generic "are you sure" for non-delete-of-an-item actions (deactivate a
// teammate, remove them, revoke an invite code). Replaces the browser's native
// confirm(), which can't be styled, is blocked in some embedded contexts, and
// can't be driven by automated tests (EN_010). ConfirmDeleteModal stays for
// deleting a hierarchy item, where the item's name is part of the message.
export function ConfirmActionModal({
  title,
  message,
  confirmLabel,
  busyLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busyLabel?: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);

  async function handleConfirm() {
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      onClose={onCancel}
      title={title}
      tone="danger"
      maxWidth="420px"
      closeDisabled={working}
      icon={
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 004.18 21h15.64a2 2 0 001.87-2.96L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      }
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={working}
            className="rounded-sm px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={working}
            className="rounded-sm bg-danger px-5 py-2.5 text-[13px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {working ? busyLabel || "Working..." : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-text-secondary">{message}</p>
    </Modal>
  );
}
