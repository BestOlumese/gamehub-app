export function SectionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-3 h-8 w-40 rounded-control bg-surface-2" />
      <div className="mb-8 h-5 w-72 max-w-full rounded-control bg-surface-2" />
      <div className="h-40 rounded-card bg-surface-2" />
    </div>
  );
}
