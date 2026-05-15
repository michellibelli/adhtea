/**
 * Small pill badge that shows a task's parent project. Renders nothing when
 * the task has no project. Drop into any place a task is displayed.
 *
 *   <ProjectBadge name={task.project_name} size="sm" />
 *
 * Sizes:
 *   xs  — micro, used inline in lists
 *   sm  — default, used on cards
 */
export default function ProjectBadge({ name, size = 'sm', className = '' }) {
  if (!name) return null
  const dims = size === 'xs'
    ? 'text-[9px] px-1.5 py-0 rounded-sm'
    : 'text-[10px] px-1.5 py-0.5 rounded'
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30 ${dims} ${className}`}
      title={`Project: ${name}`}
    >
      <span aria-hidden="true">🌱</span>
      <span className="truncate max-w-[140px]">{name}</span>
    </span>
  )
}
