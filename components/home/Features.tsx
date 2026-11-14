import { FEATURES } from "@/lib/content/home";

const STATS = [
  { value: "8", label: "Platforms supported" },
  { value: "250 MB", label: "Max file processing cap" },
  { value: "15 min", label: "Temporary link expiry" },
  { value: "0", label: "Links or videos stored" },
];

export function Features() {
  return (
    <section aria-labelledby="features-heading" className="container-x pt-20">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left editorial column + studio specs */}
        <div className="lg:col-span-5">
          <h2 id="features-heading" className="text-3xl font-bold tracking-tight">
            Engineered for speed, clarity, and safety
          </h2>
          <p className="mt-3 leading-relaxed text-muted">
            Every download passes through DNS/IP SSRF validation, real resolution inspection, and faststart MP4 packaging without storing your history on our servers.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-fg/10 pt-6">
            {STATS.map((st) => (
              <div key={st.label}>
                <dt className="text-xs text-muted">{st.label}</dt>
                <dd className="mt-1 font-mono text-2xl font-bold tracking-tight text-fg tabular-nums">{st.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Right 2-column capability matrix */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {FEATURES.map((f, idx) => (
            <li key={f.title} className="card p-5">
              <span className="font-mono text-xs text-primary tabular-nums">0{idx + 1}</span>
              <h3 className="mt-2 text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
