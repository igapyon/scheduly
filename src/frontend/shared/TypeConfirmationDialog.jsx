import { useEffect, useState } from "react";
import PropTypes from "prop-types";

const normalizeWord = (value) => (typeof value === "string" ? value.trim().toUpperCase() : "");

function TypeConfirmationDialog({
  open,
  title,
  description,
  confirmWord,
  confirmLabel = "実行する",
  confirmKind = "danger",
  pending = false,
  onClose,
  onConfirm
}) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (open) {
      setInputValue("");
    }
  }, [open]);

  if (!open) return null;

  const normalizedTarget = normalizeWord(confirmWord);
  const normalizedValue = normalizeWord(inputValue);
  const canConfirm = normalizedValue === normalizedTarget && !pending;
  const confirmButtonClass =
    confirmKind === "danger"
      ? "rounded-lg border border-rose-200 bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
      : "rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canConfirm) return;
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
          <button
            type="button"
            className="text-xs text-zinc-500"
            onClick={onClose}
            disabled={pending}
          >
            閉じる
          </button>
        </div>
        <form className="space-y-3" onSubmit={handleSubmit}>
          {typeof description === "string" ? (
            <p className="text-xs text-zinc-500">{description}</p>
          ) : (
            description
          )}
          <label className="block text-xs text-zinc-500">
            確認ワード
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value.toUpperCase())}
              placeholder={confirmWord}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              autoFocus
              autoComplete="off"
              disabled={pending}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onClose}
              disabled={pending}
            >
              キャンセル
            </button>
            <button type="submit" className={confirmButtonClass} disabled={!canConfirm}>
              {pending ? "処理中…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

TypeConfirmationDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.oneOfType([PropTypes.node, PropTypes.string]).isRequired,
  confirmWord: PropTypes.string.isRequired,
  confirmLabel: PropTypes.string,
  confirmKind: PropTypes.oneOf(["danger", "primary"]),
  pending: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired
};

export default TypeConfirmationDialog;
