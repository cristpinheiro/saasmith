"use client"

import { useState } from "react"
import type { OperationType } from "../lib/types"
import { useProjectStore } from "../lib/store/project"
import { generateModule, getGeneratedFiles } from "../lib/generator"
import { isTauri } from "../lib/env"

const OPERATION_LABELS: Record<OperationType, string> = {
  create: "Create",
  readOne: "Read One",
  readMany: "Read Many",
  update: "Update",
  delete: "Delete",
}

type Tab = "overview" | "preview"

type Props = {
  moduleId: string
  onEdit: () => void
  onDelete: () => void
}

export default function ModuleDetail({ moduleId, onEdit, onDelete }: Props) {
  const project = useProjectStore((s) => s.project)
  const removeModule = useProjectStore((s) => s.removeModule)
  const mod = project?.modules.find((m) => m.id === moduleId)

  const [tab, setTab] = useState<Tab>("overview")
  const [generating, setGenerating] = useState(false)
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedPreviewFile, setSelectedPreviewFile] = useState(0)

  if (!mod) return <div className="flex-1 p-6 text-sm text-zinc-500">Module not found.</div>

  const previewFiles = getGeneratedFiles(mod, "<output>", project ?? undefined)

  async function handleGenerate() {
    if (!project?.outputPath) {
      setError("Set an output path first (header → 'Set output path')")
      return
    }
    if (!isTauri()) {
      setError("Code generation only works in the desktop app.")
      return
    }
    setGenerating(true)
    setError(null)
    setGeneratedFiles([])
    try {
      const files = await generateModule(mod!, project.outputPath)
      setGeneratedFiles(files)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  function handleDelete() {
    removeModule(mod!.id)
    onDelete()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Module header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">{mod.name}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Table: {mod.tableName}</p>
        </div>
        <div className="flex gap-2">
          {confirmDelete ? (
            <>
              <span className="flex items-center text-xs text-zinc-400 mr-1">Delete?</span>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 hover:border-red-800 hover:text-red-400"
              >
                Delete
              </button>
              <button
                onClick={onEdit}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
              >
                Edit
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-6">
        {(["overview", "preview"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {tab === "overview" && (
          <div className="flex flex-1 flex-col overflow-y-auto p-6 gap-8">
            {error && (
              <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {generatedFiles.length > 0 && (
              <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3">
                <p className="text-xs font-medium text-emerald-400 mb-2">Generated {generatedFiles.length} files:</p>
                <ul className="flex flex-col gap-1">
                  {generatedFiles.map((f) => (
                    <li key={f} className="text-xs text-emerald-600 font-mono">{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Fields</h3>
              {mod.fields.length === 0 ? (
                <p className="text-sm text-zinc-600">No fields defined.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Nullable</th>
                      <th className="pb-2 font-medium">Unique</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mod.fields.map((field) => (
                      <tr key={field.id} className="border-b border-zinc-800/50">
                        <td className="py-2 text-zinc-200">{field.name}</td>
                        <td className="py-2 text-zinc-400 text-xs">
                          {typeof field.type === "string"
                            ? field.type
                            : field.type.kind === "enum"
                            ? `enum(${field.type.values.join(", ")})`
                            : `→ ${field.type.module} (${field.type.cardinality})`}
                        </td>
                        <td className="py-2 text-zinc-500">{field.nullable ? "yes" : "no"}</td>
                        <td className="py-2 text-zinc-500">{field.unique ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Operations</h3>
              <div className="flex flex-col gap-2">
                {mod.operations.map((op) => (
                  <div
                    key={op.type}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${op.enabled ? "bg-emerald-500" : "bg-zinc-700"}`} />
                      <span className="text-sm text-zinc-200">{OPERATION_LABELS[op.type]}</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {(!op.rules || op.rules.length === 0) ? (
                        <span className="text-xs text-zinc-600">no roles</span>
                      ) : (
                        op.rules.flatMap((rule) =>
                          rule.roles.map((role) => (
                            <span key={`${rule.scope}-${role}`} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                              {role}
                              {rule.scope !== "all" && (
                                <span className="text-zinc-600 ml-1">·{rule.scope}</span>
                              )}
                            </span>
                          ))
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "preview" && (
          <div className="flex flex-1 overflow-hidden">
            {/* File list */}
            <div className="flex w-48 flex-col border-r border-zinc-800 overflow-y-auto py-2">
              {previewFiles.map((f, i) => {
                const fileName = f.path.split(/[\\/]/).pop()!
                return (
                  <button
                    key={f.path}
                    onClick={() => setSelectedPreviewFile(i)}
                    className={`px-4 py-2 text-left text-xs font-mono truncate transition-colors ${
                      selectedPreviewFile === i
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                    }`}
                    title={fileName}
                  >
                    {fileName}
                  </button>
                )
              })}
            </div>
            {/* Code content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre font-mono">
                {previewFiles[selectedPreviewFile]?.content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
