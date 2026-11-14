import { AlertTriangle, RotateCcw } from "lucide-react";

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="animate-rise rounded-2xl border border-red-400/30 bg-red-500/10 p-5 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400 [html[data-theme=light]_&]:text-red-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-red-300 [html[data-theme=light]_&]:text-red-700">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-fg/80">{message}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-ghost mt-4 !px-4 !py-2">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

