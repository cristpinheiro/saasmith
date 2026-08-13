"use client"

import { useState } from "react"
import type { Field, FieldType, Module, Operation, OperationScope, OperationType } from "../lib/types"
import { useProjectStore } from "../lib/store/project"

const SIMPLE_TYPES = [
  "string", "text", "integer", "float",
  "boolean", "date", "datetime", "uuid", "json",
] as const

const ALL_OPERATIONS: OperationType[] = [
  "create", "readOne", "readMany", "update", "delete",
]

const OPERATION_LABELS: Record<OperationType, string> = {
  create: "Create",
  readOne: "Read One",
  readMany: "Read Many",
  update: "Update",
  delete: "Delete",
}

function toTableName(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "") + "s"
}

type Step = "info" | "fields" | "operations"

type Props = {
  onClose: () => void
  initialModule?: Module
}

export default function CreateModuleModal({ onClose, initialModule }: Props) {
  const { project, addModule, updateModule } = useProjectStore()
  const roles = project?.roles ?? []
  const isEditing = !!initialModule

  const existingNames = project?.modules
    .filter((m) => m.id !== initialModule?.id)
    .map((m) => m.name.toLowerCase()) ?? []

  const [step, setStep] = useState<Step>("info")

  // Step 1
  const [name, setName] = useState(initialModule?.name ?? "")
  const [tableName, setTableName] = useState(initialModule?.tableName ?? "")
  const [tableNameManual, setTableNameManual] = useState(!!initialModule)

  // Step 2
  const [fields, setFields] = useState<Field[]>(initialModule?.fields ?? [])
  const [newFieldName, setNewFieldName] = useState("")
  const [newFieldType, setNewFieldType] = useState<string>("string")
  const [newFieldNullable, setNewFieldNullable] = useState(false)
  const [newFieldUnique, setNewFieldUnique] = useState(false)
  const [enumValues, setEnumValues] = useState("")
  const [relationModule, setRelationModule] = useState("")
  const [relationCardinality, setRelationCardinality] = useState<"one" | "many">("one")

  // Step 3
  const [operations, setOperations] = useState<Operation[]>(
    initialModule?.operations ??
    ALL_OPERATIONS.map((type) => ({
      type,
      enabled: true,
      rules: roles.length > 0
        ? [{ roles: roles.map((r) => r.name), scope: "all" as OperationScope }]
        : [],
    }))
  )

  function handleNameChange(val: string) {
    setName(val)
    if (!tableNameManual) setTableName(toTableName(val))
  }

  function addField() {
    const trimmedName = newFieldName.trim()
    if (!trimmedName) return
    if (fields.some((f) => f.name === trimmedName)) return
    let type: FieldType = newFieldType as FieldType
    if (newFieldType === "enum") {
      type = { kind: "enum", values: enumValues.split(",").map((v) => v.trim()).filter(Boolean) }
    } else if (newFieldType === "relation") {
      type = { kind: "relation", module: relationModule, cardinality: relationCardinality }
    }
    setFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmedName, type, nullable: newFieldNullable, unique: newFieldUnique },
    ])
    setNewFieldName("")
    setNewFieldType("string")
    setNewFieldNullable(false)
    setNewFieldUnique(false)
    setEnumValues("")
    setRelationModule("")
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  function toggleOperation(type: OperationType) {
    setOperations((prev) =>
      prev.map((op) => (op.type === type ? { ...op, enabled: !op.enabled } : op))
    )
  }

  function getRoleScope(op: Operation, roleName: string): OperationScope | null {
    for (const rule of op.rules) {
      if (rule.roles.includes(roleName)) return rule.scope
    }
    return null
  }

  function toggleRoleInOp(opType: OperationType, roleName: string) {
    setOperations((prev) =>
      prev.map((op) => {
        if (op.type !== opType) return op
        const isEnabled = op.rules.some((r) => r.roles.includes(roleName))
        if (isEnabled) {
          const newRules = op.rules
            .map((r) => ({ ...r, roles: r.roles.filter((ro) => ro !== roleName) }))
            .filter((r) => r.roles.length > 0)
          return { ...op, rules: newRules }
        }
        const allRule = op.rules.find((r) => r.scope === "all")
        if (allRule) {
          return {
            ...op,
            rules: op.rules.map((r) =>
              r.scope === "all" ? { ...r, roles: [...r.roles, roleName] } : r
            ),
          }
        }
        return { ...op, rules: [...op.rules, { roles: [roleName], scope: "all" as OperationScope }] }
      })
    )
  }

  function setRoleScopeInOp(opType: OperationType, roleName: string, scope: OperationScope) {
    setOperations((prev) =>
      prev.map((op) => {
        if (op.type !== opType) return op
        const rulesWithout = op.rules
          .map((r) => ({ ...r, roles: r.roles.filter((ro) => ro !== roleName) }))
          .filter((r) => r.roles.length > 0)
        const targetRule = rulesWithout.find((r) => r.scope === scope)
        if (targetRule) {
          return {
            ...op,
            rules: rulesWithout.map((r) =>
              r.scope === scope ? { ...r, roles: [...r.roles, roleName] } : r
            ),
          }
        }
        return { ...op, rules: [...rulesWithout, { roles: [roleName], scope }] }
      })
    )
  }

  function handleSubmit() {
    if (!name.trim()) return
    const module: Module = {
      id: initialModule?.id ?? crypto.randomUUID(),
      name: name.trim(),
      tableName: tableName || toTableName(name),
      fields,
      operations,
    }
    if (isEditing) updateModule(module)
    else addModule(module)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex w-[600px] flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">{isEditing ? "Edit Module" : "New Module"}</h2>
          <div className="flex items-center gap-4">
            {(["info", "fields", "operations"] as Step[]).map((s, i) => (
              <span
                key={s}
                className={`text-xs ${step === s ? "text-indigo-400 font-medium" : "text-zinc-600"}`}
              >
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-[320px]">
          {step === "info" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">Module name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Customer"
                  className={`rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none ${
                    existingNames.includes(name.trim().toLowerCase()) && name.trim()
                      ? "border-red-700 focus:border-red-600"
                      : "border-zinc-700 focus:border-indigo-500"
                  }`}
                />
                {existingNames.includes(name.trim().toLowerCase()) && name.trim() && (
                  <p className="text-xs text-red-400">A module with this name already exists.</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">Table name</label>
                <input
                  value={tableName}
                  onChange={(e) => { setTableName(e.target.value); setTableNameManual(true) }}
                  placeholder="e.g. customers"
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {step === "fields" && (
            <div className="flex flex-col gap-4">
              {/* Add field form */}
              <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Name</label>
                    <input
                      autoFocus
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addField()}
                      placeholder="field_name"
                      className={`rounded border bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ${
                        fields.some((f) => f.name === newFieldName.trim()) && newFieldName.trim()
                          ? "border-red-700"
                          : "border-zinc-700 focus:border-indigo-500"
                      }`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Type</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value)}
                      className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                    >
                      {SIMPLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      <option value="enum">enum</option>
                      <option value="relation">relation</option>
                    </select>
                  </div>
                </div>

                {newFieldType === "enum" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Values (comma separated)</label>
                    <input
                      value={enumValues}
                      onChange={(e) => setEnumValues(e.target.value)}
                      placeholder="active, inactive, pending"
                      className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {newFieldType === "relation" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">Related module</label>
                      <input
                        value={relationModule}
                        onChange={(e) => setRelationModule(e.target.value)}
                        placeholder="User"
                        className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500">Cardinality</label>
                      <select
                        value={relationCardinality}
                        onChange={(e) => setRelationCardinality(e.target.value as "one" | "many")}
                        className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                      >
                        <option value="one">one</option>
                        <option value="many">many</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newFieldNullable}
                        onChange={(e) => setNewFieldNullable(e.target.checked)}
                        className="accent-indigo-500"
                      />
                      Nullable
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newFieldUnique}
                        onChange={(e) => setNewFieldUnique(e.target.checked)}
                        className="accent-indigo-500"
                      />
                      Unique
                    </label>
                  </div>
                  <button
                    onClick={addField}
                    className="rounded bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600"
                  >
                    Add field
                  </button>
                </div>
              </div>

              {/* Fields list */}
              {fields.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Null</th>
                      <th className="pb-2 font-medium">Unique</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.id} className="border-b border-zinc-800/50">
                        <td className="py-1.5 text-zinc-200">{f.name}</td>
                        <td className="py-1.5 text-zinc-400 text-xs">
                          {typeof f.type === "string"
                            ? f.type
                            : f.type.kind === "enum"
                            ? `enum(${f.type.values.join(", ")})`
                            : `→ ${f.type.module} (${f.type.cardinality})`}
                        </td>
                        <td className="py-1.5 text-zinc-600 text-xs">{f.nullable ? "yes" : "no"}</td>
                        <td className="py-1.5 text-zinc-600 text-xs">{f.unique ? "yes" : "no"}</td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => removeField(f.id)}
                            className="text-xs text-zinc-600 hover:text-red-400"
                          >
                            remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {step === "operations" && (
            <div className="flex flex-col gap-2">
              {roles.length > 0 && (
                <p className="text-xs text-zinc-600 mb-1">
                  For each enabled role, pick a scope:
                  <span className="text-zinc-500 ml-1">all</span> = no filter,
                  <span className="text-zinc-500 ml-1">tenant</span> = scoped to user&apos;s tenant,
                  <span className="text-zinc-500 ml-1">own</span> = scoped to user&apos;s id
                </p>
              )}
              {operations.map((op) => (
                <div key={op.type} className="rounded-lg border border-zinc-800 px-4 py-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={op.enabled}
                      onChange={() => toggleOperation(op.type)}
                      className="accent-indigo-500"
                    />
                    <span className="text-sm text-zinc-200">{OPERATION_LABELS[op.type]}</span>
                  </label>
                  {op.enabled && roles.length > 0 && (
                    <div className="mt-3 pl-6 flex flex-col gap-2">
                      {roles.map((role) => {
                        const scope = getRoleScope(op, role.name)
                        return (
                          <div key={role.id} className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer w-24 shrink-0">
                              <input
                                type="checkbox"
                                checked={scope !== null}
                                onChange={() => toggleRoleInOp(op.type, role.name)}
                                className="accent-indigo-500"
                              />
                              <span className="text-xs text-zinc-400 truncate">{role.name}</span>
                            </label>
                            {scope !== null && (
                              <div className="flex gap-1">
                                {(["all", "tenant", "own"] as OperationScope[]).map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => setRoleScopeInOp(op.type, role.name, s)}
                                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                                      scope === s
                                        ? "bg-indigo-600 text-white"
                                        : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                    }`}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-4">
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            {step !== "info" && (
              <button
                onClick={() => setStep(step === "operations" ? "fields" : "info")}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
              >
                Back
              </button>
            )}
            {step !== "operations" ? (
              <button
                onClick={() => setStep(step === "info" ? "fields" : "operations")}
                disabled={!name.trim() || existingNames.includes(name.trim().toLowerCase())}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                {isEditing ? "Save Changes" : "Create Module"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
