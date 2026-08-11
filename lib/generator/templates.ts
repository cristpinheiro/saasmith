import type { Field, FieldType, Module, Role } from "../types"

const AUTO_FIELDS = new Set(["id", "createdAt", "updatedAt"])

function domainFields(mod: Module) {
  return mod.fields.filter((f) => !AUTO_FIELDS.has(f.name))
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function drizzleType(type: FieldType): string {
  if (typeof type === "string") {
    switch (type) {
      case "string": return "varchar({ length: 255 })"
      case "text": return "text()"
      case "integer": return "integer()"
      case "float": return "doublePrecision()"
      case "boolean": return "boolean()"
      case "date": return "date()"
      case "datetime": return "timestamp()"
      case "uuid": return "uuid()"
      case "json": return "jsonb()"
    }
  }
  if (type.kind === "enum") return `varchar({ length: 100 })`
  if (type.kind === "relation") return `uuid()`
  return "text()"
}

function fieldToColumn(field: Field): string {
  const col = drizzleType(field.type)
  const parts: string[] = [`  ${field.name}: ${col}`]
  if (!field.nullable) parts[0] += `.notNull()`
  if (field.unique) parts[0] += `.unique()`
  return parts[0]
}

export function generateSchema(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const columns = [
    `  id: uuid().primaryKey().defaultRandom()`,
    ...domainFields(mod).map(fieldToColumn),
    `  createdAt: timestamp().notNull().defaultNow()`,
    `  updatedAt: timestamp().notNull().defaultNow()`,
  ].join(",\n")

  return `import { pgTable, uuid, varchar, text, integer, doublePrecision, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core"

export const ${lower}Table = pgTable("${mod.tableName}", {
${columns}
})

export type ${name} = typeof ${lower}Table.$inferSelect
export type New${name} = typeof ${lower}Table.$inferInsert
`
}

export function generateRepository(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const methods: string[] = []

  if (ops.includes("create"))
    methods.push(`  async create(data: New${name}): Promise<${name}> {
    const [row] = await db.insert(${lower}Table).values(data).returning()
    return row
  }`)

  if (ops.includes("readOne"))
    methods.push(`  async findById(id: string): Promise<${name} | undefined> {
    const [row] = await db.select().from(${lower}Table).where(eq(${lower}Table.id, id))
    return row
  }`)

  if (ops.includes("readMany"))
    methods.push(`  async findAll(): Promise<${name}[]> {
    return db.select().from(${lower}Table)
  }`)

  if (ops.includes("update"))
    methods.push(`  async update(id: string, data: Partial<New${name}>): Promise<${name} | undefined> {
    const [row] = await db.update(${lower}Table).set({ ...data, updatedAt: new Date() }).where(eq(${lower}Table.id, id)).returning()
    return row
  }`)

  if (ops.includes("delete"))
    methods.push(`  async delete(id: string): Promise<void> {
    await db.delete(${lower}Table).where(eq(${lower}Table.id, id))
  }`)

  return `import { db } from "../db"
import { eq } from "drizzle-orm"
import { ${lower}Table, type ${name}, type New${name} } from "../schema/${lower}.schema"

export class ${name}Repository {
${methods.join("\n\n")}
}

export const ${lower}Repository = new ${name}Repository()
`
}

export function generateService(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const methods: string[] = []

  if (ops.includes("create"))
    methods.push(`  async create(data: New${name}) {
    return ${lower}Repository.create(data)
  }`)

  if (ops.includes("readOne"))
    methods.push(`  async findById(id: string) {
    return ${lower}Repository.findById(id)
  }`)

  if (ops.includes("readMany"))
    methods.push(`  async findAll() {
    return ${lower}Repository.findAll()
  }`)

  if (ops.includes("update"))
    methods.push(`  async update(id: string, data: Partial<New${name}>) {
    return ${lower}Repository.update(id, data)
  }`)

  if (ops.includes("delete"))
    methods.push(`  async delete(id: string) {
    return ${lower}Repository.delete(id)
  }`)

  return `import { ${lower}Repository } from "../repositories/${lower}.repository"
import type { New${name} } from "../schema/${lower}.schema"

export class ${name}Service {
${methods.join("\n\n")}
}

export const ${lower}Service = new ${name}Service()
`
}

export function generateController(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const routes: string[] = []

  if (ops.includes("create"))
    routes.push(`  app.post("/${lower}", { preHandler: [app.authenticate] }, async (req, reply) => {
    const data = req.body as any
    const result = await ${lower}Service.create(data)
    return reply.status(201).send(result)
  })`)

  if (ops.includes("readMany"))
    routes.push(`  app.get("/${lower}", { preHandler: [app.authenticate] }, async (_req, reply) => {
    const result = await ${lower}Service.findAll()
    return reply.send(result)
  })`)

  if (ops.includes("readOne"))
    routes.push(`  app.get("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = await ${lower}Service.findById(id)
    if (!result) return reply.status(404).send({ message: "${name} not found" })
    return reply.send(result)
  })`)

  if (ops.includes("update"))
    routes.push(`  app.put("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = req.body as any
    const result = await ${lower}Service.update(id, data)
    if (!result) return reply.status(404).send({ message: "${name} not found" })
    return reply.send(result)
  })`)

  if (ops.includes("delete"))
    routes.push(`  app.delete("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await ${lower}Service.delete(id)
    return reply.status(204).send()
  })`)

  return `import type { FastifyInstance } from "fastify"
import { ${lower}Service } from "../services/${lower}.service"

export async function ${lower}Routes(app: FastifyInstance) {
${routes.join("\n\n")}
}
`
}

export function generateApiClient(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const fns: string[] = []

  if (ops.includes("create"))
    fns.push(`export async function create${name}(data: New${name}): Promise<${name}> {
  const res = await fetch(\`\${API_URL}/${lower}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}`)

  if (ops.includes("readMany"))
    fns.push(`export async function getAll${name}s(): Promise<${name}[]> {
  const res = await fetch(\`\${API_URL}/${lower}\`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}`)

  if (ops.includes("readOne"))
    fns.push(`export async function get${name}(id: string): Promise<${name}> {
  const res = await fetch(\`\${API_URL}/${lower}/\${id}\`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}`)

  if (ops.includes("update"))
    fns.push(`export async function update${name}(id: string, data: Partial<New${name}>): Promise<${name}> {
  const res = await fetch(\`\${API_URL}/${lower}/\${id}\`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}`)

  if (ops.includes("delete"))
    fns.push(`export async function delete${name}(id: string): Promise<void> {
  const res = await fetch(\`\${API_URL}/${lower}/\${id}\`, { method: "DELETE" })
  if (!res.ok) throw new Error(await res.text())
}`)

  return `import type { ${name} } from "./${lower}.types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"

export type New${name} = Omit<${name}, "id" | "createdAt" | "updatedAt">

${fns.join("\n\n")}
`
}

export function generateMigration(mod: Module): string {
  const lower = mod.name.toLowerCase()

  const columns = [
    `  id UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
    ...domainFields(mod).map((f) => {
      let sqlType = "TEXT"
      let colName = f.name
      if (typeof f.type === "string") {
        switch (f.type) {
          case "string": sqlType = "VARCHAR(255)"; break
          case "text": sqlType = "TEXT"; break
          case "integer": sqlType = "INTEGER"; break
          case "float": sqlType = "DOUBLE PRECISION"; break
          case "boolean": sqlType = "BOOLEAN"; break
          case "date": sqlType = "DATE"; break
          case "datetime": sqlType = "TIMESTAMP"; break
          case "uuid": sqlType = "UUID"; break
          case "json": sqlType = "JSONB"; break
        }
      } else if (f.type.kind === "enum") {
        sqlType = "VARCHAR(100)"
      } else {
        sqlType = "UUID"
        colName = `${f.name}Id`
      }
      const notNull = !f.nullable ? " NOT NULL" : ""
      const unique = f.unique ? " UNIQUE" : ""
      return `  ${colName} ${sqlType}${notNull}${unique}`
    }),
    `  created_at TIMESTAMP NOT NULL DEFAULT NOW()`,
    `  updated_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  ].join(",\n")

  const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14)

  return `-- Migration: create_${mod.tableName}
-- Generated: ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS ${mod.tableName} (
${columns}
);

CREATE INDEX IF NOT EXISTS idx_${lower}_created_at ON ${mod.tableName} (created_at);
`
}

export function generateFrontendTypes(mod: Module): string {
  const name = capitalize(mod.name)

  const fields = domainFields(mod).map((f) => {
    let tsType = "string"
    if (typeof f.type === "string") {
      switch (f.type) {
        case "integer":
        case "float": tsType = "number"; break
        case "boolean": tsType = "boolean"; break
        case "json": tsType = "Record<string, unknown>"; break
        default: tsType = "string"
      }
    } else if (f.type.kind === "enum") {
      tsType = f.type.values.map((v) => `"${v}"`).join(" | ")
    } else {
      tsType = "string"
    }
    return `  ${f.name}${f.nullable ? "?" : ""}: ${tsType}`
  })

  return `export type ${name} = {
  id: string
${fields.join("\n")}
  createdAt: string
  updatedAt: string
}
`
}

function fieldTypeLabel(type: FieldType): string {
  if (typeof type === "string") return type
  if (type.kind === "enum") return `enum(${type.values.join(", ")})`
  return `→ ${type.module} (${type.cardinality})`
}

const OP_LABELS: Record<string, string> = {
  create: "Create",
  readOne: "Read One",
  readMany: "Read Many",
  update: "Update",
  delete: "Delete",
}

export function generateReadme(project: { name: string; roles: Role[]; modules: Module[] }): string {
  const roleList = project.roles.map((r) => `- **${r.name}**`).join("\n")

  const moduleSections = project.modules.map((mod) => {
    const fieldRows = mod.fields.map((f) => {
      const nullable = f.nullable ? "yes" : "no"
      const unique = f.unique ? "yes" : "no"
      return `| \`${f.name}\` | ${fieldTypeLabel(f.type)} | ${nullable} | ${unique} |`
    })

    const opRows = mod.operations
      .filter((o) => o.enabled)
      .map((o) => `| ${OP_LABELS[o.type] ?? o.type} | ${o.roles.join(", ") || "—"} |`)

    return `### ${mod.name}

Table: \`${mod.tableName}\`

**Fields:**

| Name | Type | Nullable | Unique |
|------|------|----------|--------|
${fieldRows.join("\n")}

**Operations:**

| Operation | Roles |
|-----------|-------|
${opRows.join("\n")}`
  })

  return `# ${project.name}

> Generated by SaaSMith

## Getting started

### With Docker (recommended)

\`\`\`bash
docker compose up --build
\`\`\`

The API will be available at \`http://localhost:3333\`.
PostgreSQL will be available at \`localhost:5432\`.

### Manual setup

\`\`\`bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm run db:migrate
npm run dev
\`\`\`

## Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | \`/api/auth/register\` | Register a new user \`{ email, password, role }\` |
| POST | \`/api/auth/login\` | Login \`{ email, password }\` → returns \`{ token, user }\` |
| GET | \`/api/auth/me\` | Returns the authenticated user (requires Bearer token) |

All other routes require \`Authorization: Bearer <token>\` header.

## Roles

${roleList}

## Modules (${project.modules.length})

${moduleSections.join("\n\n---\n\n")}
`
}
