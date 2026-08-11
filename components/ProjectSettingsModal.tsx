"use client"

import { useState } from "react"
import type { Role } from "../lib/types"
import { useProjectStore } from "../lib/store/project"
import { useSettingsStore } from "../lib/store/settings"

type Props = {
  onClose: () => void
}

export default function ProjectSettingsModal({ onClose }: Props) {
  const { project, addRole, updateRole, removeRole } = useProjectStore()
  const { apiKey, setApiKey, baseUrl, setBaseUrl, authToken, setAuthToken, model, setModel } = useSettingsStore()
  const [newRoleName, setNewRoleName] = useState("")
  const [apiKeyInput, setApiKeyInput] = useState(apiKey)
  const [authTokenInput, setAuthTokenInput] = useState(authToken)
  const [baseUrlInput, setBaseUrlInput] = useState(baseUrl)
  const [modelInput, setModelInput] = useState(model)
  const [showKey, setShowKey] = useState(false)

  if (!project) return null

  function handleAdd() {
    const trimmed = newRoleName.trim().toLowerCase()
    if (!trimmed || project!.roles.some((r) => r.name === trimmed)) return
    addRole({ id: crypto.randomUUID(), name: trimmed })
    setNewRoleName("")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex w-[420px] flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Project Settings</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm">✕</button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">
          {/* API Key */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Claude API Key</h3>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="rounded border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                {showKey ? "hide" : "show"}
              </button>
              <button
                onClick={() => setApiKey(apiKeyInput.trim())}
                className="rounded bg-indigo-600 px-3 text-xs text-white hover:bg-indigo-500"
              >
                Save
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              Stored locally. Required for the AI chat feature.
            </p>
          </div>

          {/* Auth Token */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Auth Token <span className="normal-case text-zinc-600">(Authorization: Bearer)</span></h3>
            <div className="flex gap-2">
              <input
                type="password"
                value={authTokenInput}
                onChange={(e) => setAuthTokenInput(e.target.value)}
                placeholder="UUID ou token do proxy..."
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={() => setAuthToken(authTokenInput.trim())}
                className="rounded bg-indigo-600 px-3 text-xs text-white hover:bg-indigo-500"
              >
                Save
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              Se preenchido, substitui a API Key. Use para proxies com ANTHROPIC_AUTH_TOKEN.
            </p>
          </div>

          {/* Base URL */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Claude Base URL</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="https://api.anthropic.com (default)"
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={() => setBaseUrl(baseUrlInput.trim())}
                className="rounded bg-indigo-600 px-3 text-xs text-white hover:bg-indigo-500"
              >
                Save
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              Leave blank to use the default Anthropic API. Set a proxy URL if needed.
            </p>
          </div>

          {/* Model */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Model</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder="claude-opus-5 (default)"
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={() => setModel(modelInput.trim())}
                className="rounded bg-indigo-600 px-3 text-xs text-white hover:bg-indigo-500"
              >
                Save
              </button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              Model name expected by your proxy. Leave blank for claude-opus-5.
            </p>
          </div>

          {/* Roles */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Roles</h3>
            <div className="flex flex-col gap-2">
              {project.roles.map((role) => (
                <RoleRow key={role.id} role={role} onUpdate={updateRole} onRemove={removeRole} />
              ))}
              <div className="flex gap-2 mt-1">
                <input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="New role name..."
                  className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleAdd}
                  className="rounded bg-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-600"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-800 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function RoleRow({ role, onUpdate, onRemove }: {
  role: Role
  onUpdate: (r: Role) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(role.name)

  function handleBlur() {
    const trimmed = name.trim().toLowerCase()
    if (trimmed && trimmed !== role.name) onUpdate({ ...role, name: trimmed })
    else setName(role.name)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between rounded border border-zinc-800 px-3 py-2">
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Enter" && handleBlur()}
          className="flex-1 bg-transparent text-sm text-zinc-100 outline-none"
        />
      ) : (
        <span
          className="flex-1 text-sm text-zinc-200 cursor-pointer hover:text-zinc-100"
          onClick={() => setEditing(true)}
        >
          {role.name}
        </span>
      )}
      <button
        onClick={() => onRemove(role.id)}
        className="text-xs text-zinc-600 hover:text-red-400 ml-3"
      >
        remove
      </button>
    </div>
  )
}
