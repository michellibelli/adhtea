export function PageLoading() {
  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-8 max-w-2xl mx-auto w-full">
        <div className="h-7 w-28 bg-ui-border rounded-lg animate-pulse mb-6" />
        <SkeletonCards />
      </div>
    </div>
  )
}

export function PageError({ onRetry }) {
  return (
    <div className="aria-page flex items-center justify-center">
      <div className="text-center px-8">
        <p className="text-sm font-medium text-ui-text mb-1">Something went wrong</p>
        <p className="text-xs text-ui-subtext mb-4">Couldn't load your data. Check your connection.</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-ui-accent hover:opacity-70 transition-opacity"
          >
            Try again →
          </button>
        )}
      </div>
    </div>
  )
}

function SkeletonCards({ count = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl bg-ui-surface border border-ui-border px-4 py-3 animate-pulse">
          <div className="h-4 bg-ui-border rounded w-3/4 mb-2" />
          <div className="h-3 bg-ui-border/60 rounded w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function InlineSkeletonCards({ count = 3 }) {
  return <SkeletonCards count={count} />
}
