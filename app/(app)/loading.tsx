export default function AppGroupLoading() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <div className="text-sm text-muted-foreground">Loading…</div>
        <span className="sr-only">Content is loading</span>
      </div>
    </div>
  );
}


