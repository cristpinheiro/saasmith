"use client"

import { useProjectStore } from "../lib/store/project"

type Props = {
  onOpenSettings: () => void
}

export default function Header({ onOpenSettings }: Props) {
  const { project, isDirty, saveProject, setOutputPath } = useProjectStore()
  if (!project) return null

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-3">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-zinc-100">{project.name}</h1>
        {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" title="Unsaved changes" />}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={setOutputPath}
          className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          title={project.outputPath ?? "No output path set"}
        >
          {project.outputPath
            ? `→ ${project.outputPath.split(/[\\/]/).slice(-2).join("/")}`
            : "Set output path"}
        </button>
        <button
          onClick={onOpenSettings}
          className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          title="Project settings"
        >
          ⚙
        </button>
        <span className="text-xs text-zinc-600">{project.modules.length} modules</span>
        <button
          onClick={saveProject}
          disabled={!isDirty}
          className="rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:text-zinc-600 enabled:bg-indigo-600 enabled:text-white enabled:hover:bg-indigo-500"
        >
          Save
        </button>
      </div>
    </header>
  )
}
