"use client"

import { useProjectStore } from "../lib/store/project"

type Props = {
  selectedModuleId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
}

export default function Sidebar({ selectedModuleId, onSelect, onAdd }: Props) {
  const project = useProjectStore((s) => s.project)
  if (!project) return null

  return (
    <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Modules</span>
        <button
          onClick={onAdd}
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
          title="Add module"
        >
          +
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {project.modules.length === 0 ? (
          <p className="px-4 py-3 text-xs text-zinc-600">No modules yet</p>
        ) : (
          project.modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => onSelect(mod.id)}
              className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                selectedModuleId === mod.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              {mod.name}
            </button>
          ))
        )}
      </nav>
    </aside>
  )
}
