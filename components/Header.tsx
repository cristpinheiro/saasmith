"use client"

import { useState } from "react"
import { useProjectStore } from "../lib/store/project"
import { generateModule, generateProjectFiles, generateFrontendFiles } from "../lib/generator"
import { isTauri } from "../lib/env"

type Props = {
  onOpenSettings: () => void
  onToggleChat: () => void
  showChat: boolean
  showDiagram: boolean
  onToggleDiagram: () => void
}

export default function Header({ onOpenSettings, onToggleChat, showChat, showDiagram, onToggleDiagram }: Props) {
  const { project, isDirty, saveProject, setOutputPath } = useProjectStore()
  const [genCurrent, setGenCurrent] = useState(0)
  const [genTotal, setGenTotal] = useState(0)
  const [genDone, setGenDone] = useState<number | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [feGenerating, setFeGenerating] = useState(false)
  const [feDone, setFeDone] = useState(false)
  const [feError, setFeError] = useState<string | null>(null)
  const [allStep, setAllStep] = useState("")
  const [allRunning, setAllRunning] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)

  if (!project) return null

  const isGeneratingBackend = genCurrent > 0 && genCurrent <= genTotal
  const anyRunning = isGeneratingBackend || feGenerating || allRunning

  async function handleGenerateBackend() {
    if (!project?.outputPath) {
      setGenError("Defina um output path primeiro (→ Set directory)")
      return
    }
    if (!isTauri()) {
      setGenError("Code generation only works in the desktop app.")
      return
    }
    if (project.modules.length === 0) return

    setGenError(null)
    setGenDone(null)
    setGenTotal(project.modules.length)
    setGenCurrent(1)

    try {
      for (let i = 0; i < project.modules.length; i++) {
        setGenCurrent(i + 1)
        await generateModule(project.modules[i], project.outputPath, project)
      }
      await generateProjectFiles(project, project.outputPath)
      setGenDone(project.modules.length)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenCurrent(0)
      setGenTotal(0)
      setTimeout(() => setGenDone(null), 4000)
    }
  }

  async function handleGenerateFrontend() {
    if (!project?.outputPath) {
      setFeError("Defina um output path primeiro (→ Set directory)")
      return
    }
    if (!isTauri()) {
      setFeError("Code generation only works in the desktop app.")
      return
    }
    setFeError(null)
    setFeDone(false)
    setFeGenerating(true)
    try {
      await generateFrontendFiles(project, project.outputPath)
      setFeDone(true)
    } catch (e) {
      setFeError(e instanceof Error ? e.message : String(e))
    } finally {
      setFeGenerating(false)
      setTimeout(() => setFeDone(false), 4000)
    }
  }

  async function handleGenerateAll() {
    if (!project?.outputPath) {
      setAllError("Defina um output path primeiro (→ Set directory)")
      return
    }
    if (!isTauri()) {
      setAllError("Code generation only works in the desktop app.")
      return
    }

    setAllError(null)
    setAllDone(false)
    setAllRunning(true)

    try {
      const total = project.modules.length + 2
      for (let i = 0; i < project.modules.length; i++) {
        setAllStep(`Backend ${i + 1}/${total}`)
        await generateModule(project.modules[i], project.outputPath, project)
      }
      setAllStep(`Backend ${project.modules.length + 1}/${total}`)
      await generateProjectFiles(project, project.outputPath)
      setAllStep(`Frontend ${total}/${total}`)
      await generateFrontendFiles(project, project.outputPath)
      setAllDone(true)
    } catch (e) {
      setAllError(e instanceof Error ? e.message : String(e))
    } finally {
      setAllRunning(false)
      setAllStep("")
      setTimeout(() => setAllDone(false), 4000)
    }
  }

  return (
    <header className="flex flex-col border-b border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-zinc-100">{project.name}</h1>
          {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" title="Unsaved changes" />}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={setOutputPath}
            className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            title={project.outputPath ? `Diretório: ${project.outputPath}` : "Definir diretório do projeto"}
          >
            {project.outputPath
              ? `📁 ${project.outputPath.split(/[\\/]/).pop()}`
              : "Set directory"}
          </button>
          <button
            onClick={onToggleDiagram}
            className={`rounded px-2 py-1.5 text-xs transition-colors ${
              showDiagram ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="ER Diagram"
          >
            ⬡
          </button>
          <button
            onClick={onToggleChat}
            className={`rounded px-2 py-1.5 text-xs transition-colors ${
              showChat ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="AI Assistant"
          >
            ✦
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
            onClick={handleGenerateBackend}
            disabled={anyRunning || project.modules.length === 0}
            className="rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed"
            title="Generate backend only"
          >
            {isGeneratingBackend
              ? `Backend ${genCurrent}/${genTotal}…`
              : genDone !== null
              ? `✓ Backend`
              : "Generate Backend"}
          </button>
          <button
            onClick={handleGenerateFrontend}
            disabled={anyRunning || !project.outputPath}
            className="rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed"
            title="Generate Next.js frontend scaffold"
          >
            {feGenerating ? "Frontend…" : feDone ? "✓ Frontend" : "Generate Frontend"}
          </button>
          <button
            onClick={handleGenerateAll}
            disabled={anyRunning || project.modules.length === 0}
            className="rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed"
            title="Generate backend + frontend"
          >
            {allRunning ? allStep || "Gerando…" : allDone ? "✓ Tudo" : "Generate All"}
          </button>
          <button
            onClick={saveProject}
            disabled={!isDirty}
            className="rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:text-zinc-600 enabled:bg-indigo-600 enabled:text-white enabled:hover:bg-indigo-500"
          >
            Save
          </button>
        </div>
      </div>

      {genError && (
        <div className="border-t border-red-900 bg-red-950/20 px-6 py-2 text-xs text-red-400">
          {genError}
          <button
            onClick={() => setGenError(null)}
            className="ml-3 text-red-600 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      )}
      {feError && (
        <div className="border-t border-red-900 bg-red-950/20 px-6 py-2 text-xs text-red-400">
          {feError}
          <button onClick={() => setFeError(null)} className="ml-3 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}
      {allError && (
        <div className="border-t border-red-900 bg-red-950/20 px-6 py-2 text-xs text-red-400">
          {allError}
          <button onClick={() => setAllError(null)} className="ml-3 text-red-600 hover:text-red-400">✕</button>
        </div>
      )}
    </header>
  )
}
