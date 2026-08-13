import type { Field, FieldType, Module, Project, Role } from "../types"

const AUTO_FIELDS = new Set(["id", "createdAt", "updatedAt", "created_at", "updated_at"])

function domainFields(mod: Module): Field[] {
  return mod.fields.filter((f) => !AUTO_FIELDS.has(f.name))
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fieldLabel(field: Field): string {
  const isRelation = typeof field.type === "object" && field.type.kind === "relation"
  const base = isRelation ? field.name : field.name
  return base.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim()
}

function enabledOps(mod: Module): string[] {
  return mod.operations.filter((o) => o.enabled).map((o) => o.type)
}

function fieldToInputJsx(field: Field, valueExpr?: string): string {
  const isRelation = typeof field.type === "object" && field.type.kind === "relation"
  const n = isRelation ? `${field.name}Id` : field.name
  const label = fieldLabel(field)
  const dv = valueExpr ? ` defaultValue={${valueExpr}}` : ""
  const base = `className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"`
  const wrap = (inner: string) =>
    `        <div>\n          <label htmlFor="${n}" className="block text-sm font-medium text-gray-700 mb-1">${label}</label>\n${inner}\n        </div>`

  if (typeof field.type === "string") {
    switch (field.type) {
      case "boolean":
        return `        <div className="flex items-center gap-2">
          <input type="checkbox" id="${n}" name="${n}"${valueExpr ? ` defaultChecked={${valueExpr}}` : ""} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <label htmlFor="${n}" className="text-sm font-medium text-gray-700">${label}</label>
        </div>`
      case "integer":
      case "float":
        return wrap(`          <input type="number" id="${n}" name="${n}"${dv} step="${field.type === "float" ? "0.01" : "1"}" ${base} />`)
      case "date":
        return wrap(`          <input type="date" id="${n}" name="${n}"${dv} ${base} />`)
      case "datetime":
        return wrap(`          <input type="datetime-local" id="${n}" name="${n}"${dv} ${base} />`)
      case "text":
        return wrap(`          <textarea id="${n}" name="${n}"${dv} rows={4} ${base} />`)
      case "json":
        return wrap(`          <textarea id="${n}" name="${n}"${dv} rows={4} placeholder='{}' className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />`)
      default:
        return wrap(`          <input type="text" id="${n}" name="${n}"${dv} ${base} />`)
    }
  }

  if (field.type.kind === "enum") {
    const options = field.type.values
      .map((v) => `            <option value="${v}">${capitalize(v)}</option>`)
      .join("\n")
    return wrap(
      `          <select id="${n}" name="${n}"${dv} ${base}>\n${options}\n          </select>`
    )
  }

  if (field.type.kind === "relation") {
    return wrap(
      `          <input type="text" id="${n}" name="${n}"${dv} placeholder="UUID" className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />`
    )
  }

  return wrap(`          <input type="text" id="${n}" name="${n}"${dv} ${base} />`)
}

function fieldToFormDataParser(field: Field): string {
  const isRelation = typeof field.type === "object" && field.type.kind === "relation"
  const n = isRelation ? `${field.name}Id` : field.name
  if (typeof field.type === "string") {
    switch (field.type) {
      case "integer":
        return `Number(formData.get("${n}"))`
      case "float":
        return `parseFloat(formData.get("${n}") as string)`
      case "boolean":
        return `formData.get("${n}") === "on"`
      case "json":
        return `JSON.parse((formData.get("${n}") as string) || "{}")`
      default:
        return `formData.get("${n}") as string`
    }
  }
  return `formData.get("${n}") as string`
}

function fieldToDisplayValue(field: Field): string {
  const isRelation = typeof field.type === "object" && field.type.kind === "relation"
  const n = isRelation ? `${field.name}Id` : field.name
  if (typeof field.type === "string" && field.type === "boolean") {
    return `item.${n} ? "Sim" : "Não"`
  }
  return `item.${n} !== undefined && item.${n} !== null ? String(item.${n}) : "—"`
}

// ─── Scaffold templates ────────────────────────────────────────────────────

export function generateFrontendPackageJson(projectName: string): string {
  const name = projectName.toLowerCase().replace(/\s+/g, "-")
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
      },
      dependencies: {
        next: "^16.0.0",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
        "@types/node": "^22.0.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        tailwindcss: "^4.0.0",
        "@tailwindcss/postcss": "^4.0.0",
      },
    },
    null,
    2
  )
}

export function generateFrontendTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "react-jsx",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/dev/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  )
}

export function generateNextConfig(): string {
  return `import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default nextConfig
`
}

export function generatePostCssConfig(): string {
  return `module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
`
}

export function generateGlobalCss(): string {
  return `@import "tailwindcss";
`
}

export function generateFrontendEnvExample(): string {
  return `NEXT_PUBLIC_API_URL=http://localhost:3333
`
}

export function generateProxyTs(): string {
  return `import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const token = request.cookies.get("token")?.value
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
`
}

export function generateFetchLib(): string {
  return `import { cookies } from "next/headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value
  const res = await fetch(\`\${API_URL}\${path}\`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}
`
}

export function generateAuthActions(roles: Role[]): string {
  const roleOptions = roles.length > 0
    ? roles.map((r) => `"${r.name}"`).join(" | ")
    : "string"
  return `"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"

export async function loginAction(_prev: string | null, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const res = await fetch(\`\${API_URL}/api/auth/login\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) return "Email ou senha inválidos"

  const { token } = await res.json()
  const cookieStore = await cookies()
  cookieStore.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  redirect("/dashboard")
}

export async function registerAction(_prev: string | null, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const role = (formData.get("role") as ${roleOptions}) ?? "${roles[0]?.name ?? "user"}"

  const regRes = await fetch(\`\${API_URL}/api/auth/register\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  })

  if (!regRes.ok) return "Erro ao criar conta"

  const loginRes = await fetch(\`\${API_URL}/api/auth/login\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!loginRes.ok) redirect("/login")

  const { token } = await loginRes.json()
  const cookieStore = await cookies()
  cookieStore.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  redirect("/dashboard")
}

export async function logoutAction() {
  const cookieStore = await cookies()
  cookieStore.delete("token")
  redirect("/login")
}
`
}

export function generateRootLayout(project: Project): string {
  return `import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "${project.name}",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
`
}

export function generateRootPage(): string {
  return `import { redirect } from "next/navigation"

export default function Home() {
  redirect("/dashboard")
}
`
}

export function generateLoginPage(): string {
  return `"use client"

import { useActionState } from "react"
import Link from "next/link"
import { loginAction } from "@/app/actions/auth"

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, null)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Entrar</h1>
        <form action={formAction} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" id="email" name="email" required autoComplete="email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password" id="password" name="password" required autoComplete="current-password"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={pending}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="text-sm text-center mt-4 text-gray-600">
          Não tem conta?{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            Cadastrar
          </Link>
        </p>
      </div>
    </div>
  )
}
`
}

export function generateRegisterPage(roles: Role[]): string {
  const roleSelect =
    roles.length > 0
      ? `
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
            <select id="role" name="role" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
${roles.map((r) => `              <option value="${r.name}">${capitalize(r.name)}</option>`).join("\n")}
            </select>
          </div>`
      : ""
  return `"use client"

import { useActionState } from "react"
import Link from "next/link"
import { registerAction } from "@/app/actions/auth"

export default function RegisterPage() {
  const [error, formAction, pending] = useActionState(registerAction, null)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Criar conta</h1>
        <form action={formAction} className="space-y-4 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" id="email" name="email" required autoComplete="email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password" id="password" name="password" required autoComplete="new-password"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>${roleSelect}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={pending}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {pending ? "Criando…" : "Criar conta"}
          </button>
        </form>
        <p className="text-sm text-center mt-4 text-gray-600">
          Já tem conta?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
`
}

export function generateLogoutButton(): string {
  return `"use client"

import { useTransition } from "react"
import { logoutAction } from "@/app/actions/auth"

export default function LogoutButton() {
  const [pending, startTransition] = useTransition()
  return (
    <button
      onClick={() => startTransition(() => logoutAction())}
      disabled={pending}
      className="w-full rounded px-3 py-2 text-sm text-left text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
    >
      {pending ? "Saindo…" : "Sair"}
    </button>
  )
}
`
}

export function generateDashboardLayout(modules: Module[]): string {
  const readManyModules = modules.filter((m) =>
    m.operations.some((o) => o.enabled && o.type === "readMany")
  )

  const mobileLinks = readManyModules
    .map((m) => {
      const lower = m.name.toLowerCase()
      return `          <Link href="/dashboard/${lower}" className="shrink-0 rounded px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">${m.name}</Link>`
    })
    .join("\n")

  const sidebarLinks = readManyModules
    .map((m) => {
      const lower = m.name.toLowerCase()
      return `          <Link href="/dashboard/${lower}" className="rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">${m.name}</Link>`
    })
    .join("\n")

  return `import Link from "next/link"
import type { ReactNode } from "react"
import LogoutButton from "@/components/LogoutButton"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile top nav */}
      <nav className="flex md:hidden items-center gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2">
        <Link href="/dashboard" className="shrink-0 font-semibold text-sm text-gray-900 mr-2 px-2 py-1.5">
          Dashboard
        </Link>
${mobileLinks}
        <div className="ml-auto shrink-0">
          <LogoutButton />
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-gray-200 bg-white">
        <div className="px-4 py-4 border-b border-gray-200">
          <Link href="/dashboard" className="font-semibold text-sm text-gray-900">
            Dashboard
          </Link>
        </div>
        <nav className="flex flex-col gap-1 p-2 flex-1">
${sidebarLinks}
        </nav>
        <div className="p-2 border-t border-gray-200">
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  )
}
`
}

export function generateDashboardPage(modules: Module[]): string {
  const cards = modules
    .map((m) => {
      const lower = m.name.toLowerCase()
      const hasReadMany = m.operations.some((o) => o.enabled && o.type === "readMany")
      const href = hasReadMany ? `/dashboard/${lower}` : `/dashboard/${lower}/new`
      return `      <Link
        href="${href}"
        className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
      >
        <span className="text-base font-semibold text-gray-900">${m.name}</span>
        <span className="text-sm text-gray-500">${m.operations.filter((o) => o.enabled).length} operações</span>
      </Link>`
    })
    .join("\n")

  return `import Link from "next/link"

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
${cards}
      </div>
    </div>
  )
}
`
}

// ─── Per-module templates ──────────────────────────────────────────────────

export function generateModuleListPage(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = enabledOps(mod)
  const fields = domainFields(mod)

  const parsers = fields
    .map((f) => `      ${typeof f.type === "object" && f.type.kind === "relation" ? `${f.name}Id` : f.name}: ${fieldToFormDataParser(f)},`)
    .join("\n")

  const thCells = fields
    .map((f) => {
      const label = fieldLabel(f)
      return `              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${label}</th>`
    })
    .join("\n")

  const tdCells = fields
    .map((f) => `                <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{${fieldToDisplayValue(f)}}</td>`)
    .join("\n")

  const createAction = ops.includes("create") ? `
  async function create${name}(formData: FormData) {
    "use server"
    await apiFetch("/api/${lower}", {
      method: "POST",
      body: JSON.stringify({
${parsers}
      }),
    })
    revalidatePath("/dashboard/${lower}")
    redirect("/dashboard/${lower}")
  }` : ""

  const updateAction = ops.includes("update") ? `
  async function update${name}(formData: FormData) {
    "use server"
    await apiFetch(\`/api/${lower}/\${params.edit}\`, {
      method: "PUT",
      body: JSON.stringify({
${parsers}
      }),
    })
    revalidatePath("/dashboard/${lower}")
    redirect("/dashboard/${lower}")
  }` : ""

  const deleteAction = ops.includes("delete") ? `
  async function delete${name}(formData: FormData) {
    "use server"
    const id = formData.get("id") as string
    await apiFetch(\`/api/${lower}/\${id}\`, { method: "DELETE" })
    revalidatePath("/dashboard/${lower}")
  }` : ""

  const newButton = ops.includes("create")
    ? `<Link href="?action=new" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">Novo ${name}</Link>`
    : ""

  const newModal = ops.includes("create") ? `
      {params.action === "new" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Link href="/dashboard/${lower}" className="absolute inset-0 bg-black/50" aria-label="Fechar" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Novo ${name}</h2>
              <Link href="/dashboard/${lower}" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</Link>
            </div>
            <${name}Form action={create${name}} submitLabel="Criar ${name}" />
          </div>
        </div>
      )}` : ""

  const editModal = ops.includes("update") ? `
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Link href="/dashboard/${lower}" className="absolute inset-0 bg-black/50" aria-label="Fechar" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Editar ${name}</h2>
              <Link href="/dashboard/${lower}" className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</Link>
            </div>
            <${name}Form action={update${name}} defaultValues={editingItem} submitLabel="Salvar alterações" />
          </div>
        </div>
      )}` : ""

  const editLink = ops.includes("update")
    ? `\n                  <Link href={\`?edit=\${item.id}\`} className="text-xs text-blue-600 hover:underline">Editar</Link>`
    : ""

  const detailLink = ops.includes("readOne")
    ? `\n                  <Link href={\`/dashboard/${lower}/\${item.id}\`} className="text-xs text-blue-600 hover:underline">Ver</Link>`
    : ""

  const deleteButton = ops.includes("delete") ? `
                  <form action={delete${name}} className="inline">
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-xs text-red-600 hover:text-red-800 hover:underline">Excluir</button>
                  </form>` : ""

  const editingItemFetch = ops.includes("update")
    ? `\n  const editingItem = params.edit ? await apiFetch<${name}>(\`/api/${lower}/\${params.edit}\`).catch(() => null) : null`
    : ""

  const formImport = (ops.includes("create") || ops.includes("update"))
    ? `\nimport ${name}Form from "@/components/${name}Form"`
    : ""

  return `import Link from "next/link"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/fetch"
import type { ${name} } from "@/api/${lower}.types"${formImport}

export default async function ${name}ListPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; edit?: string }>
}) {
  const params = await searchParams
  const items = await apiFetch<${name}[]>("/api/${lower}")${editingItemFetch}
${createAction}${updateAction}${deleteAction}
  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">${name}s</h1>
          ${newButton}
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
${thCells}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
${tdCells}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">${detailLink}${editLink}${deleteButton}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={${fields.length + 1}} className="px-4 py-8 text-center text-sm text-gray-500">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>${newModal}${editModal}
    </>
  )
}
`
}

export function generateModuleDetailPage(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = enabledOps(mod)
  const fields = domainFields(mod)

  const rows = fields
    .map(
      (f) =>
        `      <div className="flex flex-col sm:flex-row sm:gap-4 py-3 border-b border-gray-100 last:border-0">
        <dt className="text-sm font-medium text-gray-500 sm:w-40 shrink-0">${capitalize(f.name)}</dt>
        <dd className="text-sm text-gray-900 mt-1 sm:mt-0">{${fieldToDisplayValue(f)}}</dd>
      </div>`
    )
    .join("\n")

  const editLink = ops.includes("update")
    ? `\n          <Link href={\`/dashboard/${lower}?edit=\${item.id}\`} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">Editar</Link>`
    : ""

  return `import Link from "next/link"
import { apiFetch } from "@/lib/fetch"
import type { ${name} } from "@/api/${lower}.types"

export default async function ${name}DetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = await apiFetch<${name}>(\`/api/${lower}/\${id}\`)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">${name}</h1>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/${lower}" className="rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors">← Voltar</Link>${editLink}
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <dl>
          <div className="flex flex-col sm:flex-row sm:gap-4 py-3 border-b border-gray-100">
            <dt className="text-sm font-medium text-gray-500 sm:w-40 shrink-0">ID</dt>
            <dd className="text-sm text-gray-900 font-mono mt-1 sm:mt-0">{item.id}</dd>
          </div>
${rows}
          <div className="flex flex-col sm:flex-row sm:gap-4 py-3 border-b border-gray-100 last:border-0">
            <dt className="text-sm font-medium text-gray-500 sm:w-40 shrink-0">Criado em</dt>
            <dd className="text-sm text-gray-900 mt-1 sm:mt-0">{new Date(item.createdAt).toLocaleString("pt-BR")}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
`
}

export function generateModuleFormComponent(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const fields = domainFields(mod)

  const inputs = fields
    .map((f) => {
      const isRelation = typeof f.type === "object" && f.type.kind === "relation"
      const isBool = typeof f.type === "string" && f.type === "boolean"
      const key = isRelation ? `${f.name}Id` : f.name
      const ve = isBool
        ? `defaultValues?.${key} ?? false`
        : `defaultValues?.${key} !== undefined ? String(defaultValues.${key}) : undefined`
      return fieldToInputJsx(f, ve)
    })
    .join("\n")

  return `import type { ${name} } from "@/api/${lower}.types"

type Props = {
  action: (formData: FormData) => Promise<void> | void
  defaultValues?: Partial<${name}>
  submitLabel?: string
}

export default function ${name}Form({ action, defaultValues, submitLabel = "Salvar" }: Props) {
  return (
    <form action={action} className="space-y-4 w-full">
${inputs}
      <button
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  )
}
`
}

export function generateModuleNewPage(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const fields = domainFields(mod)

  const parsers = fields
    .map((f) => `    ${f.name}: ${fieldToFormDataParser(f)},`)
    .join("\n")

  return `import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/fetch"
import ${name}Form from "@/components/${name}Form"

export default function New${name}Page() {
  async function create${name}(formData: FormData) {
    "use server"
    await apiFetch("/api/${lower}", {
      method: "POST",
      body: JSON.stringify({
${parsers}
      }),
    })
    revalidatePath("/dashboard/${lower}")
    redirect("/dashboard/${lower}")
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dashboard/${lower}" className="text-sm text-gray-500 hover:text-gray-700">← Voltar</a>
        <h1 className="text-2xl font-bold text-gray-900">Novo ${name}</h1>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <${name}Form action={create${name}} submitLabel="Criar ${name}" />
      </div>
    </div>
  )
}
`
}

export function generateModuleEditPage(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const fields = domainFields(mod)

  const parsers = fields
    .map((f) => `    ${f.name}: ${fieldToFormDataParser(f)},`)
    .join("\n")

  return `import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { apiFetch } from "@/lib/fetch"
import type { ${name} } from "@/api/${lower}.types"
import ${name}Form from "@/components/${name}Form"

export default async function Edit${name}Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = await apiFetch<${name}>(\`/api/${lower}/\${id}\`)

  async function update${name}(formData: FormData) {
    "use server"
    await apiFetch(\`/api/${lower}/\${id}\`, {
      method: "PUT",
      body: JSON.stringify({
${parsers}
      }),
    })
    revalidatePath("/dashboard/${lower}")
    redirect("/dashboard/${lower}")
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dashboard/${lower}" className="text-sm text-gray-500 hover:text-gray-700">← Voltar</a>
        <h1 className="text-2xl font-bold text-gray-900">Editar ${name}</h1>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <${name}Form action={update${name}} defaultValues={item} submitLabel="Salvar alterações" />
      </div>
    </div>
  )
}
`
}
