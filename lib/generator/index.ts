import type { Module } from "../types"
import {
  generateSchema,
  generateRepository,
  generateService,
  generateController,
  generateApiClient,
  generateFrontendTypes,
  generateMigration,
} from "./templates"

type GeneratedFile = {
  path: string
  content: string
}

export function getGeneratedFiles(mod: Module, outputPath: string): GeneratedFile[] {
  const lower = mod.name.toLowerCase()
  const backendBase = `${outputPath}/backend/src`
  const frontendBase = `${outputPath}/frontend/src/api`
  const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14)

  return [
    { path: `${backendBase}/schema/${lower}.schema.ts`, content: generateSchema(mod) },
    { path: `${backendBase}/repositories/${lower}.repository.ts`, content: generateRepository(mod) },
    { path: `${backendBase}/services/${lower}.service.ts`, content: generateService(mod) },
    { path: `${backendBase}/routes/${lower}.routes.ts`, content: generateController(mod) },
    { path: `${backendBase}/migrations/${ts}_create_${mod.tableName}.sql`, content: generateMigration(mod) },
    { path: `${frontendBase}/${lower}.types.ts`, content: generateFrontendTypes(mod) },
    { path: `${frontendBase}/${lower}.api.ts`, content: generateApiClient(mod) },
  ]
}

export async function generateModule(mod: Module, outputPath: string): Promise<string[]> {
  const { invoke } = await import("@tauri-apps/api/core")
  const files = getGeneratedFiles(mod, outputPath)

  for (const file of files) {
    await invoke("write_project", { path: file.path, content: file.content })
  }

  return files.map((f) => f.path)
}
