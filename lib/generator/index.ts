import type { Module, Project } from "../types"
import {
  generateSchema,
  generateRepository,
  generateService,
  generateController,
  generateApiClient,
  generateFrontendTypes,
  generateMigration,
  generateReadme,
} from "./templates"
import {
  generatePackageJson,
  generateTsConfig,
  generateDrizzleConfig,
  generateEnvExample,
  generateDbTs,
  generateAuthPlugin,
  generateAppEntrypoint,
  generateUserSchema,
  generateUserMigration,
  generateAuthRoutes,
  generateAuthService,
  generateMigrateScript,
  generateDockerfile,
  generateDockerIgnore,
  generateDockerCompose,
} from "./templates-project"
import {
  generateFrontendPackageJson,
  generateFrontendTsConfig,
  generateNextConfig,
  generatePostCssConfig,
  generateGlobalCss,
  generateFrontendEnvExample,
  generateProxyTs,
  generateFetchLib,
  generateAuthActions,
  generateRootLayout,
  generateRootPage,
  generateLoginPage,
  generateRegisterPage,
  generateLogoutButton,
  generateDashboardLayout,
  generateDashboardPage,
  generateModuleListPage,
  generateModuleDetailPage,
  generateModuleFormComponent,
  generateModuleNewPage,
  generateModuleEditPage,
} from "./templates-frontend"

type GeneratedFile = {
  path: string
  content: string
}

export function getGeneratedFiles(mod: Module, outputPath: string): GeneratedFile[] {
  const lower = mod.name.toLowerCase()
  const backendBase = `${outputPath}/backend/src`
  const frontendBase = `${outputPath}/frontend/src/api`

  return [
    { path: `${backendBase}/schema/${lower}.schema.ts`, content: generateSchema(mod) },
    { path: `${backendBase}/repositories/${lower}.repository.ts`, content: generateRepository(mod) },
    { path: `${backendBase}/services/${lower}.service.ts`, content: generateService(mod) },
    { path: `${backendBase}/routes/${lower}.routes.ts`, content: generateController(mod) },
    { path: `${backendBase}/migrations/create_${mod.tableName}.sql`, content: generateMigration(mod) },
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

export async function generateProjectFiles(project: Project, outputPath: string): Promise<string[]> {
  const { invoke } = await import("@tauri-apps/api/core")
  const b = `${outputPath}/backend`

  const files: { path: string; content: string }[] = [
    // README
    { path: `${outputPath}/README.md`, content: generateReadme(project) },
    // Backend scaffold
    { path: `${b}/package.json`, content: generatePackageJson(project.name) },
    { path: `${b}/tsconfig.json`, content: generateTsConfig() },
    { path: `${b}/drizzle.config.ts`, content: generateDrizzleConfig() },
    { path: `${b}/.env.example`, content: generateEnvExample() },
    { path: `${b}/src/db.ts`, content: generateDbTs() },
    { path: `${b}/src/index.ts`, content: generateAppEntrypoint(project.modules) },
    { path: `${b}/src/plugins/auth.plugin.ts`, content: generateAuthPlugin() },
    // Auth module
    { path: `${b}/src/schema/user.schema.ts`, content: generateUserSchema() },
    { path: `${b}/src/migrations/create_users.sql`, content: generateUserMigration() },
    { path: `${b}/src/routes/auth.routes.ts`, content: generateAuthRoutes(project.roles) },
    { path: `${b}/src/services/auth.service.ts`, content: generateAuthService() },
    { path: `${b}/src/migrate.ts`, content: generateMigrateScript() },
    // Docker
    { path: `${outputPath}/docker-compose.yml`, content: generateDockerCompose(project.name) },
    { path: `${b}/Dockerfile`, content: generateDockerfile() },
    { path: `${b}/.dockerignore`, content: generateDockerIgnore() },
  ]

  for (const file of files) {
    await invoke("write_project", { path: file.path, content: file.content })
  }

  return files.map((f) => f.path)
}

export async function generateFrontendFiles(project: Project, outputPath: string): Promise<string[]> {
  const { invoke } = await import("@tauri-apps/api/core")
  const f = `${outputPath}/frontend`
  const s = `${f}/src`

  const files: GeneratedFile[] = [
    { path: `${f}/package.json`, content: generateFrontendPackageJson(project.name) },
    { path: `${f}/tsconfig.json`, content: generateFrontendTsConfig() },
    { path: `${f}/next.config.ts`, content: generateNextConfig() },
    { path: `${f}/postcss.config.js`, content: generatePostCssConfig() },
    { path: `${f}/.env.local.example`, content: generateFrontendEnvExample() },
    { path: `${f}/.env.local`, content: generateFrontendEnvExample() },
    { path: `${s}/app/globals.css`, content: generateGlobalCss() },
    { path: `${s}/proxy.ts`, content: generateProxyTs() },
    { path: `${s}/lib/fetch.ts`, content: generateFetchLib() },
    { path: `${s}/app/actions/auth.ts`, content: generateAuthActions(project.roles) },
    { path: `${s}/app/layout.tsx`, content: generateRootLayout(project) },
    { path: `${s}/app/page.tsx`, content: generateRootPage() },
    { path: `${s}/app/login/page.tsx`, content: generateLoginPage() },
    { path: `${s}/app/register/page.tsx`, content: generateRegisterPage(project.roles) },
    { path: `${s}/components/LogoutButton.tsx`, content: generateLogoutButton() },
    { path: `${s}/app/dashboard/layout.tsx`, content: generateDashboardLayout(project.modules) },
    { path: `${s}/app/dashboard/page.tsx`, content: generateDashboardPage(project.modules) },
  ]

  for (const mod of project.modules) {
    const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)
    const lower = mod.name.toLowerCase()
    const Name = mod.name.charAt(0).toUpperCase() + mod.name.slice(1)
    const base = `${s}/app/dashboard/${lower}`
    if (ops.includes("readMany")) files.push({ path: `${base}/page.tsx`, content: generateModuleListPage(mod) })
    if (ops.includes("readOne"))  files.push({ path: `${base}/[id]/page.tsx`, content: generateModuleDetailPage(mod) })
    if (ops.includes("create"))   files.push({ path: `${base}/new/page.tsx`, content: generateModuleNewPage(mod) })
    if (ops.includes("update"))   files.push({ path: `${base}/[id]/edit/page.tsx`, content: generateModuleEditPage(mod) })
    if (ops.includes("create") || ops.includes("update"))
      files.push({ path: `${s}/components/${Name}Form.tsx`, content: generateModuleFormComponent(mod) })
  }

  for (const file of files) {
    await invoke("write_project", { path: file.path, content: file.content })
  }

  return files.map((fe) => fe.path)
}
