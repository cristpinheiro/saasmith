"use client"

import { useState } from "react"
import { useProjectStore } from "../lib/store/project"
import type { Role } from "../lib/types"

type Step = "name" | "roles"

export default function WelcomeScreen() {
  const { newProject, openProject } = useProjectStore()
  const [showNewForm, setShowNewForm] = useState(false)
  const [step, setStep] = useState<Step>("name")
  const [projectName, setProjectName] = useState("")
  const [roles, setRoles] = useState<Role[]>([
    { id: crypto.randomUUID(), name: "admin" },
    { id: crypto.randomUUID(), name: "user" },
  ])
  const [newRole, setNewRole] = useState("")

  function handleAddRole() {
    const trimmed = newRole.trim().toLowerCase()
    if (!trimmed || roles.some((r) => r.name === trimmed)) return
    setRoles((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed }])
    setNewRole("")
  }

  function handleRemoveRole(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id))
  }

  function handleCreate() {
    if (!projectName.trim()) return
    newProject(projectName.trim(), roles)
  }

  function handleCancel() {
    setShowNewForm(false)
    setStep("name")
    setProjectName("")
    setRoles([
      { id: crypto.randomUUID(), name: "admin" },
      { id: crypto.randomUUID(), name: "user" },
    ])
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-100">SaaSMith</h1>
        <p className="mt-2 text-zinc-500">SaaS development harness</p>
      </div>

      {showNewForm ? (
        <div className="flex w-96 flex-col gap-4">
          <div className="flex gap-3 text-xs text-zinc-600">
            <span className={step === "name" ? "text-indigo-400 font-medium" : ""}>1. Name</span>
            <span className={step === "roles" ? "text-indigo-400 font-medium" : ""}>2. Roles</span>
          </div>

          {step === "name" && (
            <div className="flex flex-col gap-3">
              <input
                autoFocus
                type="text"
                placeholder="Project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && projectName.trim() && setStep("roles")}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => projectName.trim() && setStep("roles")}
                  disabled={!projectName.trim()}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  Next
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === "roles" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                {roles.map((role) => (
                  <div key={role.id} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-200">{role.name}</span>
                    <button
                      onClick={() => handleRemoveRole(role.id)}
                      className="text-xs text-zinc-600 hover:text-red-400"
                    >
                      remove
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 mt-1">
                  <input
                    autoFocus
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
                    placeholder="New role..."
                    className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleAddRole}
                    className="rounded bg-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-600"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("name")}
                  className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100"
                >
                  Back
                </button>
                <button
                  onClick={handleCreate}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Create Project
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => setShowNewForm(true)}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            New Project
          </button>
          <button
            onClick={openProject}
            className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Open Project
          </button>
        </div>
      )}
    </div>
  )
}
