// Copyright (c) Toshiki Iga. All Rights Reserved.

import { useId, useRef, useState, useEffect } from "react";

const mergeClass = (...tokens) => tokens.filter(Boolean).join(" ");

function InfoBadge({ ariaLabel = "ヘルプ", title = "ヘルプ", message, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const tooltipId = useId();
  const [bubbleStyle, setBubbleStyle] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!bubbleRef.current || !triggerRef.current) return;
      if (bubbleRef.current.contains(event.target) || triggerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      if (!triggerRef.current || !bubbleRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const bubbleRect = bubbleRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      let left = triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2;
      left = Math.max(viewportPadding, left);
      left = Math.min(window.innerWidth - viewportPadding - bubbleRect.width, left);
      const top = Math.max(viewportPadding, triggerRect.bottom + 10);
      setBubbleStyle({ left, top });
    };

    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={mergeClass("relative inline-flex", className)}>
      <button
        type="button"
        ref={triggerRef}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? tooltipId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600 shadow-sm ring-1 ring-blue-200 transition hover:bg-blue-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
      >
        i
      </button>
      {open && (
        <div
          ref={bubbleRef}
          id={tooltipId}
          role="dialog"
          aria-label={title}
          className="fixed z-40 max-w-[calc(100vw-24px)] sm:w-64 rounded-xl border border-blue-100 bg-white p-3 text-xs text-zinc-600 shadow-lg"
          style={bubbleStyle}
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-600">
              i
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">{title}</p>
              {message && <p className="leading-relaxed">{message}</p>}
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InfoBadge;
