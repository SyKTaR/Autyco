export const BackendLoading = () => (
  <main className="entry-main">
    <div className="panel w-full max-w-md p-6 sm:p-8" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-signal-soft text-signal" aria-hidden="true">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-signal" />
        </span>
        <div>
          <p className="text-sm font-semibold text-signal-hover">AUTYCO</p>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.03em]">Ouverture du garage</h1>
        </div>
      </div>
      <p className="mt-5 text-base leading-7 text-muted">Chargement de ta partie…</p>
      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden="true">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-signal" />
      </div>
    </div>
  </main>
)
