/** Shown instantly while the next page is being prepared, so navigation never feels frozen. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-7 w-48 rounded bg-neutral-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-neutral-200" />)}
      </div>
      <div className="h-24 rounded-xl bg-neutral-200" />
      <div className="h-24 rounded-xl bg-neutral-200" />
    </div>
  )
}
