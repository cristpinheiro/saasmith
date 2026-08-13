import type { Field, FieldType, Module, Project, Role } from "../types"

const AUTO_FIELDS = new Set(["id", "createdAt", "updatedAt", "created_at", "updated_at"])

function domainFields(mod: Module) {
  return mod.fields.filter((f) => !AUTO_FIELDS.has(f.name))
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function drizzleType(type: FieldType, col?: string): string {
  const c = col ? `"${col}"` : ""
  if (typeof type === "string") {
    switch (type) {
      case "string":   return col ? `varchar(${c}, { length: 255 })` : `varchar({ length: 255 })`
      case "text":     return `text(${c})`
      case "integer":  return `integer(${c})`
      case "float":    return `doublePrecision(${c})`
      case "boolean":  return `boolean(${c})`
      case "date":     return `date(${c})`
      case "datetime": return `timestamp(${c})`
      case "uuid":     return `uuid(${c})`
      case "json":     return `jsonb(${c})`
    }
  }
  if (type.kind === "enum") return col ? `varchar(${c}, { length: 100 })` : `varchar({ length: 100 })`
  if (type.kind === "relation") return `uuid(${c})`
  return `text(${c})`
}

function fieldToColumn(field: Field): string {
  const snakeCol = camelToSnake(field.name)

  if (typeof field.type === "object" && field.type.kind === "relation") {
    const colName = snakeCol + "_id"
    let s = `  ${field.name}Id: ${drizzleType(field.type, colName)}`
    if (!field.nullable) s += `.notNull()`
    return s
  }

  const explicitCol = snakeCol !== field.name ? snakeCol : undefined
  let s = `  ${field.name}: ${drizzleType(field.type, explicitCol)}`
  if (!field.nullable) s += `.notNull()`
  if (field.unique) s += `.unique()`
  return s
}

// Returns roles that have a given scope for an operation type
function getRolesForScope(mod: Module, opType: string, scope: string): string[] {
  const op = mod.operations.find((o) => o.type === opType)
  if (!op) return []
  return (op.rules ?? []).filter((r) => r.scope === scope).flatMap((r) => r.roles)
}

// Returns the relation field that points to the tenant module
function getTenantRelField(mod: Module, tenantModule?: string): Field | undefined {
  if (!tenantModule) return undefined
  return domainFields(mod).find(
    (f) => typeof f.type === "object" && f.type.kind === "relation" && f.type.module === tenantModule
  )
}

// Returns the first relation field that is NOT the tenant module (used for "own" scope)
function getOwnRelField(mod: Module, tenantModule?: string): Field | undefined {
  return domainFields(mod).find(
    (f) =>
      typeof f.type === "object" &&
      f.type.kind === "relation" &&
      f.type.module !== tenantModule
  )
}

export function generateSchema(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const columns = [
    `  id: uuid().primaryKey().defaultRandom()`,
    ...domainFields(mod).map(fieldToColumn),
    `  createdAt: timestamp("created_at").notNull().defaultNow()`,
    `  updatedAt: timestamp("updated_at").notNull().defaultNow()`,
  ].join(",\n")

  return `import { pgTable, uuid, varchar, text, integer, doublePrecision, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core"

export const ${lower}Table = pgTable("${mod.tableName}", {
${columns}
})

export type ${capitalize(mod.name)} = typeof ${lower}Table.$inferSelect
export type New${name} = typeof ${lower}Table.$inferInsert
`
}

export function generateRepository(mod: Module, project?: Project): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const isTenantRoot = !!project?.tenantModule && project.tenantModule === mod.name
  const tenantRelField = getTenantRelField(mod, project?.tenantModule)
  const ownRelField = getOwnRelField(mod, project?.tenantModule)
  const tf = tenantRelField ? `${tenantRelField.name}Id` : undefined
  const of_ = ownRelField ? `${ownRelField.name}Id` : undefined

  const methods: string[] = []
  let needsAnd = false

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

  if (ops.includes("readMany")) {
    methods.push(`  async findAll(): Promise<${name}[]> {
    return db.select().from(${lower}Table)
  }`)

    const tenantRoles = getRolesForScope(mod, "readMany", "tenant")
    if (tenantRoles.length > 0) {
      const whereClause = isTenantRoot
        ? `eq(${lower}Table.id, tenantId)`
        : tf ? `eq(${lower}Table.${tf}, tenantId)` : null
      if (whereClause) {
        methods.push(`  async findByTenant(tenantId: string): Promise<${name}[]> {
    return db.select().from(${lower}Table).where(${whereClause})
  }`)
      }
    }

    const ownRoles = getRolesForScope(mod, "readMany", "own")
    if (ownRoles.length > 0 && of_) {
      methods.push(`  async findByOwner(userId: string): Promise<${name}[]> {
    return db.select().from(${lower}Table).where(eq(${lower}Table.${of_}, userId))
  }`)
    }
  }

  if (ops.includes("update")) {
    methods.push(`  async update(id: string, data: Partial<New${name}>): Promise<${name} | undefined> {
    const [row] = await db.update(${lower}Table).set({ ...data, updatedAt: new Date() }).where(eq(${lower}Table.id, id)).returning()
    return row
  }`)

    const tenantRoles = getRolesForScope(mod, "update", "tenant")
    if (tenantRoles.length > 0 && tf) {
      needsAnd = true
      methods.push(`  async updateForTenant(id: string, data: Partial<New${name}>, tenantId: string): Promise<${name} | undefined> {
    const [row] = await db.update(${lower}Table).set({ ...data, updatedAt: new Date() }).where(and(eq(${lower}Table.id, id), eq(${lower}Table.${tf}, tenantId))).returning()
    return row
  }`)
    }

    const ownRoles = getRolesForScope(mod, "update", "own")
    if (ownRoles.length > 0 && of_) {
      needsAnd = true
      methods.push(`  async updateForOwner(id: string, data: Partial<New${name}>, userId: string): Promise<${name} | undefined> {
    const [row] = await db.update(${lower}Table).set({ ...data, updatedAt: new Date() }).where(and(eq(${lower}Table.id, id), eq(${lower}Table.${of_}, userId))).returning()
    return row
  }`)
    }
  }

  if (ops.includes("delete")) {
    methods.push(`  async delete(id: string): Promise<void> {
    await db.delete(${lower}Table).where(eq(${lower}Table.id, id))
  }`)

    const tenantRoles = getRolesForScope(mod, "delete", "tenant")
    if (tenantRoles.length > 0 && tf) {
      needsAnd = true
      methods.push(`  async deleteForTenant(id: string, tenantId: string): Promise<void> {
    await db.delete(${lower}Table).where(and(eq(${lower}Table.id, id), eq(${lower}Table.${tf}, tenantId)))
  }`)
    }

    const ownRoles = getRolesForScope(mod, "delete", "own")
    if (ownRoles.length > 0 && of_) {
      needsAnd = true
      methods.push(`  async deleteForOwner(id: string, userId: string): Promise<void> {
    await db.delete(${lower}Table).where(and(eq(${lower}Table.id, id), eq(${lower}Table.${of_}, userId)))
  }`)
    }
  }

  return `import { db } from "../db"
import { eq${needsAnd ? ", and" : ""} } from "drizzle-orm"
import { ${lower}Table, type ${name}, type New${name} } from "../schema/${lower}.schema"

export class ${name}Repository {
${methods.join("\n\n")}
}

export const ${lower}Repository = new ${name}Repository()
`
}

export function generateService(mod: Module, project?: Project): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const isTenantRoot = !!project?.tenantModule && project.tenantModule === mod.name
  const tenantRelField = getTenantRelField(mod, project?.tenantModule)
  const ownRelField = getOwnRelField(mod, project?.tenantModule)
  const tf = tenantRelField ? `${tenantRelField.name}Id` : undefined
  const of_ = ownRelField ? `${ownRelField.name}Id` : undefined

  const methods: string[] = []
  const extensionPoints: string[] = []

  if (ops.includes("create")) {
    methods.push(`  async create(data: New${name}) {
    await this.validateCreate(data)
    return ${lower}Repository.create(data)
  }`)
    extensionPoints.push(`  protected async validateCreate(_data: New${name}): Promise<void> {}`)
  }

  if (ops.includes("readOne"))
    methods.push(`  async findById(id: string) {
    return ${lower}Repository.findById(id)
  }`)

  if (ops.includes("readMany")) {
    methods.push(`  async findAll() {
    return ${lower}Repository.findAll()
  }`)

    const hasTenant = getRolesForScope(mod, "readMany", "tenant").length > 0
    if (isTenantRoot || (hasTenant && !!tf))
      methods.push(`  async findByTenant(tenantId: string) {
    return ${lower}Repository.findByTenant(tenantId)
  }`)

    const hasOwn = getRolesForScope(mod, "readMany", "own").length > 0
    if (hasOwn && of_)
      methods.push(`  async findByOwner(userId: string) {
    return ${lower}Repository.findByOwner(userId)
  }`)
  }

  if (ops.includes("update")) {
    methods.push(`  async update(id: string, data: Partial<New${name}>) {
    await this.validateUpdate(id, data)
    return ${lower}Repository.update(id, data)
  }`)

    if (getRolesForScope(mod, "update", "tenant").length > 0 && tf)
      methods.push(`  async updateForTenant(id: string, data: Partial<New${name}>, tenantId: string) {
    await this.validateUpdate(id, data)
    return ${lower}Repository.updateForTenant(id, data, tenantId)
  }`)

    if (getRolesForScope(mod, "update", "own").length > 0 && of_)
      methods.push(`  async updateForOwner(id: string, data: Partial<New${name}>, userId: string) {
    await this.validateUpdate(id, data)
    return ${lower}Repository.updateForOwner(id, data, userId)
  }`)

    extensionPoints.push(`  protected async validateUpdate(_id: string, _data: Partial<New${name}>): Promise<void> {}`)
  }

  if (ops.includes("delete")) {
    methods.push(`  async delete(id: string) {
    await this.validateDelete(id)
    return ${lower}Repository.delete(id)
  }`)

    if (getRolesForScope(mod, "delete", "tenant").length > 0 && tf)
      methods.push(`  async deleteForTenant(id: string, tenantId: string) {
    await this.validateDelete(id)
    return ${lower}Repository.deleteForTenant(id, tenantId)
  }`)

    if (getRolesForScope(mod, "delete", "own").length > 0 && of_)
      methods.push(`  async deleteForOwner(id: string, userId: string) {
    await this.validateDelete(id)
    return ${lower}Repository.deleteForOwner(id, userId)
  }`)

    extensionPoints.push(`  protected async validateDelete(_id: string): Promise<void> {}`)
  }

  const extensionBlock = extensionPoints.length > 0
    ? `\n  // Extension points — override to add domain validation\n${extensionPoints.join("\n")}`
    : ""

  return `import { ${lower}Repository } from "../repositories/${lower}.repository"
import type { New${name} } from "../schema/${lower}.schema"

export class ${name}Service {
${methods.join("\n\n")}${extensionBlock}
}

export const ${lower}Service = new ${name}Service()
`
}

export function generateController(mod: Module, project?: Project): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const isTenantRoot = !!project?.tenantModule && project.tenantModule === mod.name
  const tenantRelField = getTenantRelField(mod, project?.tenantModule)
  const ownRelField = getOwnRelField(mod, project?.tenantModule)
  const tf = tenantRelField ? `${tenantRelField.name}Id` : undefined
  const of_ = ownRelField ? `${ownRelField.name}Id` : undefined

  const routes: string[] = []
  const extraImports: string[] = []

  if (ops.includes("create")) {
    const tenantRoles = getRolesForScope(mod, "create", "tenant")
    const ownRoles = getRolesForScope(mod, "create", "own")

    const injectLines: string[] = []
    if (tf && tenantRoles.length > 0)
      injectLines.push(`    if ([${tenantRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role) && user.tenantId) data.${tf} = user.tenantId`)
    if (of_ && ownRoles.length > 0)
      injectLines.push(`    if ([${ownRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role)) data.${of_} = user.id`)

    const injectStr = injectLines.length > 0 ? `\n${injectLines.join("\n")}` : ""
    const postCreate = isTenantRoot
      ? `\n    // Link user to this ${name} as tenant\n    await authService.setTenant(user.id, result.id)`
      : ""
    if (isTenantRoot) extraImports.push(`import { authService } from "../services/auth.service"`)

    routes.push(`  app.post("/${lower}", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
    const data: any = { ...(req.body as any) }${injectStr}
    const result = await ${lower}Service.create(data)${postCreate}
    return reply.status(201).send(result)
  })`)
  }

  if (ops.includes("readMany")) {
    const tenantRoles = getRolesForScope(mod, "readMany", "tenant")
    const ownRoles = getRolesForScope(mod, "readMany", "own")
    const hasScoping = isTenantRoot || (tenantRoles.length > 0 && !!tf) || (ownRoles.length > 0 && !!of_)

    if (!hasScoping) {
      routes.push(`  app.get("/${lower}", { preHandler: [app.authenticate] }, async (_req, reply) => {
    const result = await ${lower}Service.findAll()
    return reply.send(result)
  })`)
    } else {
      const branches: string[] = []

      if (isTenantRoot) {
        branches.push(`    if (user.tenantId) result = await ${lower}Service.findByTenant(user.tenantId)`)
        branches.push(`    else result = await ${lower}Service.findAll()`)
      } else {
        if (tenantRoles.length > 0 && !!tf) {
          branches.push(`    if ([${tenantRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role) && user.tenantId)`)
          branches.push(`      result = await ${lower}Service.findByTenant(user.tenantId)`)
        }
        if (ownRoles.length > 0 && !!of_) {
          const kw = branches.length > 0 ? "else if" : "if"
          branches.push(`    ${kw} ([${ownRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role))`)
          branches.push(`      result = await ${lower}Service.findByOwner(user.id)`)
        }
        const kw = branches.length > 0 ? "else " : ""
        branches.push(`    ${kw}result = await ${lower}Service.findAll()`)
      }

      routes.push(`  app.get("/${lower}", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
    let result: ${name}[]
${branches.join("\n")}
    return reply.send(result)
  })`)
    }
  }

  if (ops.includes("readOne"))
    routes.push(`  app.get("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = await ${lower}Service.findById(id)
    if (!result) return reply.status(404).send({ message: "${name} not found" })
    return reply.send(result)
  })`)

  if (ops.includes("update")) {
    const tenantRoles = getRolesForScope(mod, "update", "tenant")
    const ownRoles = getRolesForScope(mod, "update", "own")
    const hasScoping = (tenantRoles.length > 0 && !!tf) || (ownRoles.length > 0 && !!of_)

    if (!hasScoping) {
      routes.push(`  app.put("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = req.body as any
    const result = await ${lower}Service.update(id, data)
    if (!result) return reply.status(404).send({ message: "${name} not found" })
    return reply.send(result)
  })`)
    } else {
      const branches: string[] = []
      if (tenantRoles.length > 0 && !!tf) {
        branches.push(`    if ([${tenantRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role) && user.tenantId)`)
        branches.push(`      result = await ${lower}Service.updateForTenant(id, data, user.tenantId)`)
      }
      if (ownRoles.length > 0 && !!of_) {
        const kw = branches.length > 0 ? "else if" : "if"
        branches.push(`    ${kw} ([${ownRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role))`)
        branches.push(`      result = await ${lower}Service.updateForOwner(id, data, user.id)`)
      }
      const kw = branches.length > 0 ? "else " : ""
      branches.push(`    ${kw}result = await ${lower}Service.update(id, data)`)

      routes.push(`  app.put("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
    const { id } = req.params as { id: string }
    const data = req.body as any
    let result: ${name} | undefined
${branches.join("\n")}
    if (!result) return reply.status(404).send({ message: "${name} not found" })
    return reply.send(result)
  })`)
    }
  }

  if (ops.includes("delete")) {
    const tenantRoles = getRolesForScope(mod, "delete", "tenant")
    const ownRoles = getRolesForScope(mod, "delete", "own")
    const hasScoping = (tenantRoles.length > 0 && !!tf) || (ownRoles.length > 0 && !!of_)

    if (!hasScoping) {
      routes.push(`  app.delete("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await ${lower}Service.delete(id)
    return reply.status(204).send()
  })`)
    } else {
      const branches: string[] = []
      if (tenantRoles.length > 0 && !!tf) {
        branches.push(`    if ([${tenantRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role) && user.tenantId)`)
        branches.push(`      await ${lower}Service.deleteForTenant(id, user.tenantId)`)
      }
      if (ownRoles.length > 0 && !!of_) {
        const kw = branches.length > 0 ? "else if" : "if"
        branches.push(`    ${kw} ([${ownRoles.map((r) => `"${r}"`).join(", ")}].includes(user.role))`)
        branches.push(`      await ${lower}Service.deleteForOwner(id, user.id)`)
      }
      const kw = branches.length > 0 ? "else " : ""
      branches.push(`    ${kw}await ${lower}Service.delete(id)`)

      routes.push(`  app.delete("/${lower}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
    const { id } = req.params as { id: string }
${branches.join("\n")}
    return reply.status(204).send()
  })`)
    }
  }

  const importSection = extraImports.length > 0 ? `\n${[...new Set(extraImports)].join("\n")}` : ""

  return `import type { FastifyInstance } from "fastify"
import { ${lower}Service } from "../services/${lower}.service"
import type { ${name} } from "../schema/${lower}.schema"${importSection}

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
      let colName = camelToSnake(f.name)
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
        colName = camelToSnake(f.name) + "_id"
      }
      const notNull = !f.nullable ? " NOT NULL" : ""
      const unique = f.unique ? " UNIQUE" : ""
      return `  ${colName} ${sqlType}${notNull}${unique}`
    }),
    `  created_at TIMESTAMP NOT NULL DEFAULT NOW()`,
    `  updated_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  ].join(",\n")

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
    let fieldName = f.name
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
      fieldName = `${f.name}Id`
    }
    return `  ${fieldName}${f.nullable ? "?" : ""}: ${tsType}`
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
      .map((o) => {
        const rulesStr = (o.rules ?? [])
          .map((r) => `${r.roles.join(", ")} (${r.scope})`)
          .join("; ") || "—"
        return `| ${OP_LABELS[o.type] ?? o.type} | ${rulesStr} |`
      })

    return `### ${mod.name}

Table: \`${mod.tableName}\`

**Fields:**

| Name | Type | Nullable | Unique |
|------|------|----------|--------|
${fieldRows.join("\n")}

**Operations:**

| Operation | Roles & Scope |
|-----------|---------------|
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
| PATCH | \`/api/auth/tenant\` | Set tenant for current user \`{ tenantId }\` |

All other routes require \`Authorization: Bearer <token>\` header.

## Roles

${roleList}

## Modules (${project.modules.length})

${moduleSections.join("\n\n---\n\n")}
`
}
