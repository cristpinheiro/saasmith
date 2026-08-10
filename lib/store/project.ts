import { create } from "zustand"
import type { Project, Module, Role } from "../types"
import { isTauri } from "../env"

type ProjectStore = {
  project: Project | null
  projectPath: string | null
  isDirty: boolean

  openProject: () => Promise<void>
  saveProject: () => Promise<void>
  saveProjectAs: () => Promise<void>
  newProject: (name: string, roles?: Role[]) => void

  setOutputPath: () => Promise<void>

  addModule: (module: Module) => void
  updateModule: (module: Module) => void
  removeModule: (moduleId: string) => void

  addRole: (role: Role) => void
  updateRole: (role: Role) => void
  removeRole: (roleId: string) => void
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

  newProject: (name, roles) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      outputPath: null,
      roles: roles ?? [
        { id: crypto.randomUUID(), name: "admin" },
        { id: crypto.randomUUID(), name: "user" },
      ],
      modules: [],
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
    const project: Project = JSON.parse(content)
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
    const { open } = await getTauriApis()
    const path = await open({ directory: true })
    if (!path) return
    set((s) => ({
      project: s.project ? { ...s.project, outputPath: path as string } : null,
      isDirty: true,
    }))
  },

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
