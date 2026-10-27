import { create } from "zustand"
import type { Project, Module, Role, Operation } from "../types"
import { isTauri } from "../env"

type ProjectStore = {
  project: Project | null
  projectPath: string | null
  isDirty: boolean

  openProject: () => Promise<void>
  saveProject: () => Promise<void>
  saveProjectAs: () => Promise<void>
  newProject: (name: string, roles?: Role[], modules?: Module[]) => void

  setOutputPath: () => Promise<void>
  setTenantModule: (name?: string) => void

  addModule: (module: Module) => void
  updateModule: (module: Module) => void
  removeModule: (moduleId: string) => void

  addRole: (role: Role) => void
  updateRole: (role: Role) => void
  removeRole: (roleId: string) => void
}

type LegacyOperation = {
  type: Operation["type"]
  enabled: boolean
  rules?: Operation["rules"]
  roles?: string[]
}

type StoredProject = Omit<Project, "modules"> & {
  modules?: Array<Omit<Module, "operations"> & { operations?: LegacyOperation[] }>
}

function migrateProject(raw: unknown): Project {
  const data = raw as StoredProject
  return {
    ...data,
    modules: (data.modules ?? []).map((mod) => ({
      ...mod,
      operations: (mod.operations ?? []).map((op): Operation => ({
        type: op.type,
        enabled: op.enabled,
        rules: op.rules ?? (op.roles?.length ? [{ roles: op.roles, scope: "all" as const }] : []),
      })),
    })),
  }
}

async function getTauriApis() {
  const [{ invoke }, { open, save }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/plugin-dialog"),
  ])
  return { invoke, open, save }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  projectPath: null,
  isDirty: false,

  newProject: (name, roles, modules) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      outputPath: null,
      roles: roles ?? [
        { id: crypto.randomUUID(), name: "admin" },
        { id: crypto.randomUUID(), name: "user" },
      ],
      modules: modules ?? [],
    }
    set({ project, projectPath: null, isDirty: true })
  },

  openProject: async () => {
    if (!isTauri()) return
    const { invoke, open } = await getTauriApis()
    const path = await open({
      filters: [{ name: "SaaSMith Project", extensions: ["saasmith.json", "json"] }],
    })
    if (!path) return
    const content = await invoke<string>("read_project", { path })
    const project: Project = migrateProject(JSON.parse(content))
    set({ project, projectPath: path as string, isDirty: false })
  },

  saveProject: async () => {
    const { project, projectPath } = get()
    if (!project) return
    if (!isTauri()) return
    if (!projectPath) return get().saveProjectAs()
    const { invoke } = await getTauriApis()
    await invoke("write_project", {
      path: projectPath,
      content: JSON.stringify(project, null, 2),
    })
    set({ isDirty: false })
  },

  saveProjectAs: async () => {
    const { project } = get()
    if (!project) return
    if (!isTauri()) return
    const { invoke, save } = await getTauriApis()
    const path = await save({
      defaultPath: `${project.name}.saasmith.json`,
      filters: [{ name: "SaaSMith Project", extensions: ["json"] }],
    })
    if (!path) return
    await invoke("write_project", {
      path,
      content: JSON.stringify(project, null, 2),
    })
    set({ projectPath: path, isDirty: false })
  },

  setOutputPath: async () => {
    if (!isTauri()) return
    const { invoke, open } = await getTauriApis()
    const dir = await open({ directory: true })
    if (!dir) return
    const { project } = get()
    if (!project) return
    const updatedProject = { ...project, outputPath: dir as string }
    const configPath = `${dir}/${project.name}.saasmith.json`
    await invoke("write_project", { path: configPath, content: JSON.stringify(updatedProject, null, 2) })
    set({ project: updatedProject, projectPath: configPath, isDirty: false })
  },

  setTenantModule: (name) =>
    set((s) => ({
      project: s.project ? { ...s.project, tenantModule: name } : null,
      isDirty: true,
    })),

  addModule: (module) =>
    set((s) => ({
      project: s.project ? { ...s.project, modules: [...s.project.modules, module] } : null,
      isDirty: true,
    })),

  updateModule: (module) =>
    set((s) => ({
      project: s.project
        ? { ...s.project, modules: s.project.modules.map((m) => (m.id === module.id ? module : m)) }
        : null,
      isDirty: true,
    })),

  removeModule: (moduleId) =>
    set((s) => ({
      project: s.project
        ? { ...s.project, modules: s.project.modules.filter((m) => m.id !== moduleId) }
        : null,
      isDirty: true,
    })),

  addRole: (role) =>
    set((s) => ({
      project: s.project ? { ...s.project, roles: [...s.project.roles, role] } : null,
      isDirty: true,
    })),

  updateRole: (role) =>
    set((s) => ({
      project: s.project
        ? { ...s.project, roles: s.project.roles.map((r) => (r.id === role.id ? role : r)) }
        : null,
      isDirty: true,
    })),

  removeRole: (roleId) =>
    set((s) => ({
      project: s.project
        ? { ...s.project, roles: s.project.roles.filter((r) => r.id !== roleId) }
        : null,
      isDirty: true,
    })),
}))
