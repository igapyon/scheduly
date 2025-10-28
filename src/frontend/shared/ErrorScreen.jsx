import React from "react";

function ErrorScreen({ title, description, actions = [] }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-800">
      <div className="max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <span aria-hidden="true" className="text-2xl font-bold">
            !
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold">{title}</h1>
          {description && <p className="text-sm text-zinc-600">{description}</p>}
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {actions.map(({ label, href, variant = "primary" }) => {
              const baseClass = "rounded-lg px-4 py-2 text-sm font-semibold transition";
              const variantClass =
                variant === "ghost"
                  ? "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
                  : "bg-emerald-600 text-white hover:bg-emerald-700";
              if (href) {
                return (
                  <a key={label} href={href} className={`${baseClass} ${variantClass}`}>
                    {label}
                  </a>
                );
              }
              return (
                <button key={label} type="button" className={`${baseClass} ${variantClass}`}>
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ErrorScreen;

