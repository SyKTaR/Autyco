export const BackendLoading = () => (
  <main className="flex min-h-dvh items-center justify-center bg-ink px-4 text-white">
    <div className="w-full max-w-lg border-2 border-white/25 bg-ink p-6 shadow-[7px_7px_0_rgb(var(--accent))] sm:p-9" role="status" aria-live="polite">
      <div className="flex items-center justify-between border-b border-white/25 pb-4">
        <p className="font-display text-sm font-bold uppercase tracking-[0.12em] text-white/55">AUTYCO</p>
        <span className="font-mono text-sm font-bold text-signal">01 / START</span>
      </div>
      <h1 className="mt-8 max-w-[10ch] font-display text-5xl font-extrabold uppercase leading-[0.88] tracking-[-0.04em]">Ouverture du garage</h1>
      <p className="mt-5 max-w-[38ch] text-base leading-7 text-white/65">Vérification de la session et chargement de ta partie.</p>
      <div className="mt-8 h-2 border border-white/40 bg-white/10" aria-hidden="true">
        <div className="h-full w-2/3 animate-pulse bg-signal" />
      </div>
    </div>
  </main>
)
