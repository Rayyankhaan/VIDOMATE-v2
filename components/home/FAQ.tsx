import { Plus } from "lucide-react";

/** Accessible accordion built on <details> with Lucide Plus icon. */
export function FAQ({ faqs, heading = "Frequently asked questions", id = "faq" }: { faqs: { q: string; a: string }[]; heading?: string; id?: string }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="container-x pt-20">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-4">
          <h2 id={`${id}-heading`} className="text-3xl font-bold tracking-tight">
            {heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Clear answers about supported platforms, formats, file privacy, and usage limits.
          </p>
        </div>
        <div className="space-y-3 lg:col-span-8">
          {faqs.map((f) => (
            <details key={f.q} className="card group p-5 open:border-primary/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <Plus className="h-4 w-4 shrink-0 text-primary transition duration-200 group-open:rotate-45" aria-hidden="true" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
