"use client"

import { useState } from "react"
import type { Role } from "../lib/types"
import { useProjectStore } from "../lib/store/project"

type Props = {
  onClose: () => void
}

export default function ProjectSettingsModal({ onClose }: Props) {
  const { project, addRole, updateRole, removeRole } = useProjectStore()
  const [newRoleName, setNewRoleName] = useState("")

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

        <div className="px-6 py-5 flex flex-col gap-4">
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
