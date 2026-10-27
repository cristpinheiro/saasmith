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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function relationModule(field: Field): string | undefined {
  return typeof field.type === "object" && field.type.kind === "relation" ? field.type.module : undefined
}

function roleList(roles: string[]): string {
  return `[${roles.map((r) => `"${r}"`).join(", ")}]`
}

/** URL path derived from the SQL table name (e.g. schedule_slots -> /schedule-slots). */
export function apiPath(mod: Module): string {
  return mod.tableName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
}

function tableRef(mod: Module): string {
  return `${mod.name.toLowerCase()}Table`
}

export function isTenantRoot(mod: Module, project?: Project): boolean {
  return !!project?.tenantModule && project.tenantModule.toLowerCase() === mod.name.toLowerCase()
}

// Returns roles that have a given scope for an operation type
function getRolesForScope(mod: Module, opType: string, scope: string): string[] {
  const op = mod.operations.find((o) => o.type === opType)
  if (!op) return []
  return (op.rules ?? []).filter((r) => r.scope === scope).flatMap((r) => r.roles)
}

type ScopeSets = { all: string[]; tenant: string[]; own: string[] }

function scopeRoles(mod: Module, opType: string): ScopeSets {
  return {
    all: unique(getRolesForScope(mod, opType, "all")),
    tenant: unique(getRolesForScope(mod, opType, "tenant")),
    own: unique(getRolesForScope(mod, opType, "own")),
  }
}

function roleUnion(sets: ScopeSets): string[] {
  return unique([...sets.all, ...sets.tenant, ...sets.own])
}

// Returns the relation field that points to User (used for "own" scope)
function getUserRelField(mod: Module, tenantModule?: string): Field | undefined {
  const tenant = tenantModule?.toLowerCase()
  return domainFields(mod).find((f) => {
    const target = relationModule(f)
    return !!target && target.toLowerCase() === "user" && target.toLowerCase() !== tenant
  })
}

export type TenantPath = { modules: Module[]; fields: Field[] }

function resolveProjectModule(project: Project | undefined, name: string): Module | undefined {
  return project?.modules.find((m) => m.name.toLowerCase() === name.toLowerCase())
}

/**
 * Finds the shortest relation path from a module to the project's tenant root.
 * A path with one module means `mod` itself is the tenant root; a path with two
 * modules means `mod` has a direct foreign key to the tenant root.
 */
export function getTenantPath(mod: Module, project?: Project): TenantPath | null {
  if (!project?.tenantModule) return null
  const target = resolveProjectModule(project, project.tenantModule)
  if (!target) return null
  if (mod.name.toLowerCase() === target.name.toLowerCase()) return { modules: [mod], fields: [] }

  const queue: TenantPath[] = [{ modules: [mod], fields: [] }]
  const seen = new Set([mod.name.toLowerCase()])

  while (queue.length > 0) {
    const current = queue.shift()!
    const tail = current.modules[current.modules.length - 1]
    for (const field of domainFields(tail)) {
      const next = resolveProjectModule(project, relationModule(field) ?? "")
      if (!next || seen.has(next.name.toLowerCase())) continue
      const nextPath: TenantPath = {
        modules: [...current.modules, next],
        fields: [...current.fields, field],
      }
      if (next.name.toLowerCase() === target.name.toLowerCase()) return nextPath
      seen.add(next.name.toLowerCase())
      queue.push(nextPath)
    }
  }

  return null
}

/**
 * Drizzle WHERE fragment that restricts a query to a tenant. The fragment
 * references a `tenantId` parameter and, for multi-hop paths, subqueries with `db`.
 */
function tenantWhere(path: TenantPath, ref?: string): { expression: string; usesInArray: boolean } {
  const root = ref ?? tableRef(path.modules[0])
  if (path.modules.length === 1) {
    return { expression: `eq(${root}.id, tenantId)`, usesInArray: false }
  }
  if (path.modules.length === 2) {
    return { expression: `eq(${root}.${path.fields[0].name}Id, tenantId)`, usesInArray: false }
  }

  let inner = `eq(${tableRef(path.modules[path.modules.length - 1])}.id, tenantId)`
  for (let i = path.fields.length - 1; i >= 0; i--) {
    const parent = tableRef(path.modules[i])
    const child = tableRef(path.modules[i + 1])
    inner = `inArray(${parent}.${path.fields[i].name}Id, db.select({ id: ${child}.id }).from(${child}).where(${inner}))`
  }
  return { expression: inner, usesInArray: true }
}

function tenantCreatePlan(mod: Module, project?: Project): {
  path: TenantPath | null
  directField?: string
  indirectField?: string
} {
  const path = getTenantPath(mod, project)
  if (!path) return { path: null }
  if (path.modules.length === 2) return { path, directField: `${path.fields[0].name}Id` }
  if (path.modules.length > 2) return { path, indirectField: `${path.fields[0].name}Id` }
  return { path }
}

/** Returns errors for scopes configured in the UI that generated code cannot enforce safely. */
export function getModuleScopeErrors(mod: Module, project?: Project): string[] {
  const issues: string[] = []
  for (const op of mod.operations.filter((o) => o.enabled)) {
    const sets = scopeRoles(mod, op.type)
    if (sets.tenant.length > 0 && !getTenantPath(mod, project)) {
      issues.push(
        `O módulo "${mod.name}" usa escopo "tenant" em "${op.type}", mas não foi possível encontrar uma relação (direta ou indireta) com o módulo tenant "${project?.tenantModule ?? "(não definido)"}". Defina o módulo de tenant nas configurações do projeto ou adicione a relação.`
      )
    }
    if (sets.own.length > 0 && !getUserRelField(mod, project?.tenantModule)) {
      issues.push(
        `O módulo "${mod.name}" usa escopo "own" em "${op.type}", mas não possui um campo de relação com "User". Adicione esse campo ou use outro escopo.`
      )
    }
  }
  return unique(issues)
}

/** Throws when scopes configured in the UI cannot be enforced safely by generated code. */
function assertScopeConfig(mod: Module, project?: Project) {
  const issues = getModuleScopeErrors(mod, project)
  if (issues.length > 0) throw new Error(issues.join("\n"))
}

/** Validates project-wide tenancy wiring before any files are written. */
export function getProjectTenancyErrors(project: Project): string[] {
  const errors: string[] = []
  if (project.tenantModule) {
    const exists = project.modules.some(
      (m) => m.name.toLowerCase() === project.tenantModule!.toLowerCase()
    )
    if (!exists)
      errors.push(`O módulo tenant "${project.tenantModule}" não existe entre os módulos do projeto.`)
  }
  for (const mod of project.modules) errors.push(...getModuleScopeErrors(mod, project))
  return unique(errors)
}

/**
 * Relation fields that are filled or overwritten by the server. They must not
 * be rendered as user-editable inputs (the API also ignores client values).
 */
export function getServerManagedFields(mod: Module, project?: Project): string[] {
  const managed = new Set<string>()
  const userRel = getUserRelField(mod, project?.tenantModule)
  const ownField = userRel ? `${userRel.name}Id` : undefined
  const ownScoped =
    getRolesForScope(mod, "create", "own").length > 0 ||
    getRolesForScope(mod, "update", "own").length > 0

  if (ownField && (ownScoped || isTenantRoot(mod, project))) managed.add(ownField)

  const tenantScoped =
    getRolesForScope(mod, "create", "tenant").length > 0 ||
    getRolesForScope(mod, "update", "tenant").length > 0
  const path = getTenantPath(mod, project)
  if (path && path.modules.length === 2 && tenantScoped) {
    managed.add(`${path.fields[0].name}Id`)
  }

  return [...managed]
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
  assertScopeConfig(mod, project)

  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const table = `${lower}Table`
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)
  const tenantPath = getTenantPath(mod, project)
  const userRelField = getUserRelField(mod, project?.tenantModule)
  const ownField = userRelField ? `${userRelField.name}Id` : undefined
  const createPlan = tenantCreatePlan(mod, project)

  const tenantReadMany = getRolesForScope(mod, "readMany", "tenant").length > 0
  const ownReadMany = getRolesForScope(mod, "readMany", "own").length > 0
  const tenantReadOne = getRolesForScope(mod, "readOne", "tenant").length > 0
  const ownReadOne = getRolesForScope(mod, "readOne", "own").length > 0
  const tenantUpdate = getRolesForScope(mod, "update", "tenant").length > 0
  const ownUpdate = getRolesForScope(mod, "update", "own").length > 0
  const tenantDelete = getRolesForScope(mod, "delete", "tenant").length > 0
  const ownDelete = getRolesForScope(mod, "delete", "own").length > 0
  const tenantCreate = getRolesForScope(mod, "create", "tenant").length > 0
  const needsBelongsToTenant = ops.includes("create") && tenantCreate && !!createPlan.indirectField

  const methods: string[] = []
  let needsAnd = false
  let needsInArray = false

  if (ops.includes("create"))
    methods.push(`  async create(data: New${name}): Promise<${name}> {
    const [row] = await db.insert(${table}).values(data).returning()
    return row
  }`)

  if (ops.includes("readOne")) {
    methods.push(`  async findById(id: string): Promise<${name} | undefined> {
    const [row] = await db.select().from(${table}).where(eq(${table}.id, id))
    return row
  }`)

    if (tenantReadOne && tenantPath) {
      const where = tenantWhere(tenantPath)
      needsAnd = true
      needsInArray = needsInArray || where.usesInArray
      methods.push(`  async findByIdForTenant(id: string, tenantId: string): Promise<${name} | undefined> {
    const [row] = await db.select().from(${table}).where(and(eq(${table}.id, id), ${where.expression}))
    return row
  }`)
    }

    if (ownReadOne && ownField) {
      needsAnd = true
      methods.push(`  async findByIdForOwner(id: string, userId: string): Promise<${name} | undefined> {
    const [row] = await db.select().from(${table}).where(and(eq(${table}.id, id), eq(${table}.${ownField}, userId)))
    return row
  }`)
    }
  }

  if (ops.includes("readMany")) {
    methods.push(`  async findAll(): Promise<${name}[]> {
    return db.select().from(${table})
  }`)

    if (tenantReadMany && tenantPath) {
      const where = tenantWhere(tenantPath)
      needsInArray = needsInArray || where.usesInArray
      methods.push(`  async findByTenant(tenantId: string): Promise<${name}[]> {
    return db.select().from(${table}).where(${where.expression})
  }`)
    }

    if (ownReadMany && ownField) {
      methods.push(`  async findByOwner(userId: string): Promise<${name}[]> {
    return db.select().from(${table}).where(eq(${table}.${ownField}, userId))
  }`)
    }
  }

  if (ops.includes("update")) {
    methods.push(`  async update(id: string, data: Partial<New${name}>): Promise<${name} | undefined> {
    const [row] = await db.update(${table}).set({ ...data, updatedAt: new Date() }).where(eq(${table}.id, id)).returning()
    return row
  }`)

    if (tenantUpdate && tenantPath) {
      const where = tenantWhere(tenantPath)
      needsAnd = true
      needsInArray = needsInArray || where.usesInArray
      methods.push(`  async updateForTenant(id: string, data: Partial<New${name}>, tenantId: string): Promise<${name} | undefined> {
    const [row] = await db.update(${table}).set({ ...data, updatedAt: new Date() }).where(and(eq(${table}.id, id), ${where.expression})).returning()
    return row
  }`)
    }

    if (ownUpdate && ownField) {
      needsAnd = true
      methods.push(`  async updateForOwner(id: string, data: Partial<New${name}>, userId: string): Promise<${name} | undefined> {
    const [row] = await db.update(${table}).set({ ...data, updatedAt: new Date() }).where(and(eq(${table}.id, id), eq(${table}.${ownField}, userId))).returning()
    return row
  }`)
    }
  }

  if (ops.includes("delete")) {
    methods.push(`  async delete(id: string): Promise<boolean> {
    const rows = await db.delete(${table}).where(eq(${table}.id, id)).returning({ id: ${table}.id })
    return rows.length > 0
  }`)

    if (tenantDelete && tenantPath) {
      const where = tenantWhere(tenantPath)
      needsAnd = true
      needsInArray = needsInArray || where.usesInArray
      methods.push(`  async deleteForTenant(id: string, tenantId: string): Promise<boolean> {
    const rows = await db.delete(${table}).where(and(eq(${table}.id, id), ${where.expression})).returning({ id: ${table}.id })
    return rows.length > 0
  }`)
    }

    if (ownDelete && ownField) {
      needsAnd = true
      methods.push(`  async deleteForOwner(id: string, userId: string): Promise<boolean> {
    const rows = await db.delete(${table}).where(and(eq(${table}.id, id), eq(${table}.${ownField}, userId))).returning({ id: ${table}.id })
    return rows.length > 0
  }`)
    }
  }

  if (needsBelongsToTenant && createPlan.path) {
    const subPath: TenantPath = {
      modules: createPlan.path.modules.slice(1),
      fields: createPlan.path.fields.slice(1),
    }
    const related = tableRef(subPath.modules[0])
    const where = tenantWhere(subPath)
    needsAnd = true
    needsInArray = needsInArray || where.usesInArray
    methods.push(`  async belongsToTenant(relatedId: string, tenantId: string): Promise<boolean> {
    const [row] = await db.select({ id: ${related}.id }).from(${related}).where(and(eq(${related}.id, relatedId), ${where.expression}))
    return !!row
  }`)
  }

  const needsPathTables =
    !!tenantPath &&
    tenantPath.modules.length > 2 &&
    (tenantReadMany || tenantReadOne || tenantUpdate || tenantDelete || needsBelongsToTenant)

  const schemaImports = [
    `import { ${table}, type ${name}, type New${name} } from "../schema/${lower}.schema"`,
    ...(needsPathTables
      ? tenantPath!.modules.slice(1).map((m) => `import { ${tableRef(m)} } from "../schema/${m.name.toLowerCase()}.schema"`)
      : []),
  ].join("\n")

  const drizzleImports = ["eq"]
  if (needsAnd) drizzleImports.push("and")
  if (needsInArray) drizzleImports.push("inArray")

  return `import { db } from "../db"
import { ${drizzleImports.join(", ")} } from "drizzle-orm"
${schemaImports}

export class ${name}Repository {
${methods.join("\n\n")}
}

export const ${lower}Repository = new ${name}Repository()
`
}

export function generateService(mod: Module, project?: Project): string {
  assertScopeConfig(mod, project)

  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)
  const tenantPath = getTenantPath(mod, project)
  const userRelField = getUserRelField(mod, project?.tenantModule)
  const ownField = userRelField ? `${userRelField.name}Id` : undefined
  const createPlan = tenantCreatePlan(mod, project)

  const tenantReadMany = getRolesForScope(mod, "readMany", "tenant").length > 0
  const ownReadMany = getRolesForScope(mod, "readMany", "own").length > 0
  const tenantReadOne = getRolesForScope(mod, "readOne", "tenant").length > 0
  const ownReadOne = getRolesForScope(mod, "readOne", "own").length > 0
  const tenantUpdate = getRolesForScope(mod, "update", "tenant").length > 0
  const ownUpdate = getRolesForScope(mod, "update", "own").length > 0
  const tenantDelete = getRolesForScope(mod, "delete", "tenant").length > 0
  const ownDelete = getRolesForScope(mod, "delete", "own").length > 0
  const tenantCreate = getRolesForScope(mod, "create", "tenant").length > 0

  const methods: string[] = []
  const extensionPoints: string[] = []

  if (ops.includes("create")) {
    methods.push(`  async create(data: New${name}) {
    await this.validateCreate(data)
    return ${lower}Repository.create(data)
  }`)
    extensionPoints.push(`  protected async validateCreate(_data: New${name}): Promise<void> {}`)
  }

  if (ops.includes("readOne")) {
    methods.push(`  async findById(id: string) {
    return ${lower}Repository.findById(id)
  }`)

    if (tenantReadOne && tenantPath)
      methods.push(`  async findByIdForTenant(id: string, tenantId: string) {
    return ${lower}Repository.findByIdForTenant(id, tenantId)
  }`)

    if (ownReadOne && ownField)
      methods.push(`  async findByIdForOwner(id: string, userId: string) {
    return ${lower}Repository.findByIdForOwner(id, userId)
  }`)
  }

  if (ops.includes("readMany")) {
    methods.push(`  async findAll() {
    return ${lower}Repository.findAll()
  }`)

    if (tenantReadMany && tenantPath)
      methods.push(`  async findByTenant(tenantId: string) {
    return ${lower}Repository.findByTenant(tenantId)
  }`)

    if (ownReadMany && ownField)
      methods.push(`  async findByOwner(userId: string) {
    return ${lower}Repository.findByOwner(userId)
  }`)
  }

  if (ops.includes("update")) {
    methods.push(`  async update(id: string, data: Partial<New${name}>) {
    await this.validateUpdate(id, data)
    return ${lower}Repository.update(id, data)
  }`)

    if (tenantUpdate && tenantPath)
      methods.push(`  async updateForTenant(id: string, data: Partial<New${name}>, tenantId: string) {
    await this.validateUpdate(id, data)
    return ${lower}Repository.updateForTenant(id, data, tenantId)
  }`)

    if (ownUpdate && ownField)
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

    if (tenantDelete && tenantPath)
      methods.push(`  async deleteForTenant(id: string, tenantId: string) {
    await this.validateDelete(id)
    return ${lower}Repository.deleteForTenant(id, tenantId)
  }`)

    if (ownDelete && ownField)
      methods.push(`  async deleteForOwner(id: string, userId: string) {
    await this.validateDelete(id)
    return ${lower}Repository.deleteForOwner(id, userId)
  }`)

    extensionPoints.push(`  protected async validateDelete(_id: string): Promise<void> {}`)
  }

  if (tenantCreate && createPlan.indirectField)
    methods.push(`  async belongsToTenant(relatedId: string, tenantId: string) {
    return ${lower}Repository.belongsToTenant(relatedId, tenantId)
  }`)

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
  assertScopeConfig(mod, project)

  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const path = apiPath(mod)
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)
  const tenantRoot = isTenantRoot(mod, project)
  const tenantPath = getTenantPath(mod, project)
  const createPlan = tenantCreatePlan(mod, project)
  const userRelField = getUserRelField(mod, project?.tenantModule)
  const ownField = userRelField ? `${userRelField.name}Id` : undefined
  const usesValidation = ops.includes("create") || ops.includes("update")
  const usesNewType = ops.includes("create") || ops.includes("update")

  const routes: string[] = []
  const extraImports: string[] = []

  if (ops.includes("create")) {
    const sets = scopeRoles(mod, "create")
    const allowed = roleUnion(sets)
    const tenantScoped = sets.tenant.filter((r) => !sets.all.includes(r))
    const ownScoped = sets.own.filter((r) => !sets.all.includes(r))
    const lines: string[] = []

    if (allowed.length === 0) {
      lines.push(`    // Nenhuma regra de criação configurada: nega por padrão`)
      lines.push(`    return reply.status(403).send({ message: "Forbidden" })`)
    } else {
      lines.push(`    if (!${roleList(allowed)}.includes(user.role)) return reply.status(403).send({ message: "Forbidden" })`)
      lines.push(`    const body: Record<string, unknown> = { ...(req.body as Record<string, unknown>) }`)

      if (ownField && ownScoped.length > 0)
        lines.push(`    if (${roleList(ownScoped)}.includes(user.role)) body.${ownField} = user.id`)

      if (createPlan.directField && tenantScoped.length > 0) {
        lines.push(`    if (${roleList(tenantScoped)}.includes(user.role)) {`)
        lines.push(`      if (!user.tenantId) return reply.status(403).send({ message: "Forbidden" })`)
        lines.push(`      body.${createPlan.directField} = user.tenantId`)
        lines.push(`    }`)
      }

      if (tenantRoot && ownField) {
        lines.push(`    if (!body.${ownField}) body.${ownField} = user.id`)
        const creatorScoped = unique([...tenantScoped, ...ownScoped])
        if (creatorScoped.length > 0)
          lines.push(`    if (${roleList(creatorScoped)}.includes(user.role)) body.${ownField} = user.id`)
      }

      if (createPlan.indirectField && tenantScoped.length > 0) {
        lines.push(`    if (${roleList(tenantScoped)}.includes(user.role)) {`)
        lines.push(`      if (!user.tenantId) return reply.status(403).send({ message: "Forbidden" })`)
        lines.push(`      const relatedId = body.${createPlan.indirectField}`)
        lines.push(`      if (typeof relatedId !== "string" || !(await ${lower}Service.belongsToTenant(relatedId, user.tenantId)))`)
        lines.push(`        return reply.status(403).send({ message: "Forbidden" })`)
        lines.push(`    }`)
      }

      lines.push(`    const parsed = create${name}Schema.safeParse(body)`)
      lines.push(`    if (!parsed.success) return reply.status(422).send({ message: "Dados inválidos", issues: parsed.error.issues })`)
      lines.push(`    const result = await ${lower}Service.create(parsed.data as unknown as New${name})`)

      const creatorScoped = unique([...tenantScoped, ...ownScoped])
      if (tenantRoot && ownField) {
        extraImports.push(`import { authService } from "../services/auth.service"`)
        if (creatorScoped.length > 0) {
          lines.push(`    if (${roleList(creatorScoped)}.includes(user.role)) await authService.setTenant(user.id, result.id)`)
          lines.push(`    else if (typeof body.${ownField} === "string") await authService.setTenant(body.${ownField}, result.id)`)
        } else {
          lines.push(`    if (typeof body.${ownField} === "string") await authService.setTenant(body.${ownField}, result.id)`)
        }
      }

      lines.push(`    return reply.status(201).send(result)`)
    }

    routes.push(`  app.post("/${path}", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
${lines.join("\n")}
  })`)
  }

  if (ops.includes("readMany")) {
    const sets = scopeRoles(mod, "readMany")
    const tenantScoped = sets.tenant
    const ownScoped = sets.own
    const branchLines: string[] = []
    let branchCount = 0
    const pushBranch = (condition: string, body: string[]) => {
      branchLines.push(`    ${branchCount === 0 ? "if" : "else if"} (${condition}) {`)
      branchLines.push(...body.map((line) => `      ${line}`))
      branchLines.push(`    }`)
      branchCount++
    }

    if (sets.all.length > 0) pushBranch(`${roleList(sets.all)}.includes(user.role)`, [`result = await ${lower}Service.findAll()`])
    if (tenantScoped.length > 0 && tenantPath)
      pushBranch(`${roleList(tenantScoped)}.includes(user.role)`, [
        `result = user.tenantId ? await ${lower}Service.findByTenant(user.tenantId) : []`,
      ])
    if (ownScoped.length > 0 && ownField)
      pushBranch(`${roleList(ownScoped)}.includes(user.role)`, [`result = await ${lower}Service.findByOwner(user.id)`])

    if (branchCount === 0) {
      branchLines.push(`    // Nenhuma regra de leitura configurada: nega por padrão`)
      branchLines.push(`    return reply.status(403).send({ message: "Forbidden" })`)
    } else {
      branchLines.push(`    else {`)
      branchLines.push(`      return reply.status(403).send({ message: "Forbidden" })`)
      branchLines.push(`    }`)
    }

    routes.push(`  app.get("/${path}", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
    let result: ${name}[]
${branchLines.join("\n")}
    return reply.send(result)
  })`)
  }

  if (ops.includes("readOne")) {
    const sets = scopeRoles(mod, "readOne")
    const branchLines: string[] = []
    let branchCount = 0
    const pushBranch = (condition: string, body: string[]) => {
      branchLines.push(`    ${branchCount === 0 ? "if" : "else if"} (${condition}) {`)
      branchLines.push(...body.map((line) => `      ${line}`))
      branchLines.push(`    }`)
      branchCount++
    }

    if (sets.all.length > 0) pushBranch(`${roleList(sets.all)}.includes(user.role)`, [`result = await ${lower}Service.findById(id)`])
    if (sets.tenant.length > 0 && tenantPath)
      pushBranch(`${roleList(sets.tenant)}.includes(user.role)`, [
        `if (!user.tenantId) return reply.status(403).send({ message: "Forbidden" })`,
        `result = await ${lower}Service.findByIdForTenant(id, user.tenantId)`,
      ])
    if (sets.own.length > 0 && ownField)
      pushBranch(`${roleList(sets.own)}.includes(user.role)`, [`result = await ${lower}Service.findByIdForOwner(id, user.id)`])

    if (branchCount === 0) {
      branchLines.push(`    // Nenhuma regra de leitura configurada: nega por padrão`)
      branchLines.push(`    return reply.status(403).send({ message: "Forbidden" })`)
    } else {
      branchLines.push(`    else {`)
      branchLines.push(`      return reply.status(403).send({ message: "Forbidden" })`)
      branchLines.push(`    }`)
    }

    routes.push(`  app.get("/${path}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
    const { id } = req.params as { id: string }
    let result: ${name} | undefined
${branchLines.join("\n")}
    if (!result) return reply.status(404).send({ message: "${name} not found" })
    return reply.send(result)
  })`)
  }

  if (ops.includes("update")) {
    const sets = scopeRoles(mod, "update")
    const tenantScoped = sets.tenant.filter((r) => !sets.all.includes(r))
    const ownScoped = sets.own.filter((r) => !sets.all.includes(r))
    const lines: string[] = [
      `    const { id } = req.params as { id: string }`,
      `    const body: Record<string, unknown> = { ...(req.body as Record<string, unknown>) }`,
    ]

    const scopeField = tenantPath && tenantPath.fields.length > 0 ? `${tenantPath.fields[0].name}Id` : undefined
    if (scopeField && tenantScoped.length > 0)
      lines.push(`    if (${roleList(tenantScoped)}.includes(user.role)) delete body.${scopeField}`)
    if (tenantRoot && ownField && tenantScoped.length > 0)
      lines.push(`    if (${roleList(tenantScoped)}.includes(user.role)) delete body.${ownField}`)
    if (ownField && ownScoped.length > 0)
      lines.push(`    if (${roleList(ownScoped)}.includes(user.role)) delete body.${ownField}`)

    const branchLines: string[] = []
    let branchCount = 0
    const pushBranch = (condition: string, body: string[]) => {
      branchLines.push(`    ${branchCount === 0 ? "if" : "else if"} (${condition}) {`)
      branchLines.push(...body.map((line) => `      ${line}`))
      branchLines.push(`    }`)
      branchCount++
    }

    if (sets.all.length > 0) pushBranch(`${roleList(sets.all)}.includes(user.role)`, [`result = await ${lower}Service.update(id, data)`])
    if (tenantScoped.length > 0 && tenantPath)
      pushBranch(`${roleList(tenantScoped)}.includes(user.role)`, [
        `if (!user.tenantId) return reply.status(403).send({ message: "Forbidden" })`,
        `result = await ${lower}Service.updateForTenant(id, data, user.tenantId)`,
      ])
    if (ownScoped.length > 0 && ownField)
      pushBranch(`${roleList(ownScoped)}.includes(user.role)`, [`result = await ${lower}Service.updateForOwner(id, data, user.id)`])

    if (branchCount === 0) {
      lines.push(`    // Nenhuma regra de atualização configurada: nega por padrão`)
      lines.push(`    return reply.status(403).send({ message: "Forbidden" })`)
    } else {
      lines.push(`    const parsed = update${name}Schema.safeParse(body)`)
      lines.push(`    if (!parsed.success) return reply.status(422).send({ message: "Dados inválidos", issues: parsed.error.issues })`)
      lines.push(`    const data = parsed.data as unknown as Partial<New${name}>`)
      lines.push(`    let result: ${name} | undefined`)
      lines.push(...branchLines)
      lines.push(`    else {`)
      lines.push(`      return reply.status(403).send({ message: "Forbidden" })`)
      lines.push(`    }`)
      lines.push(`    if (!result) return reply.status(404).send({ message: "${name} not found" })`)
      lines.push(`    return reply.send(result)`)
    }

    routes.push(`  app.put("/${path}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
${lines.join("\n")}
  })`)
  }

  if (ops.includes("delete")) {
    const sets = scopeRoles(mod, "delete")
    const tenantScoped = sets.tenant.filter((r) => !sets.all.includes(r))
    const ownScoped = sets.own.filter((r) => !sets.all.includes(r))
    const lines: string[] = [`    const { id } = req.params as { id: string }`]
    const branchLines: string[] = []
    let branchCount = 0
    const pushBranch = (condition: string, body: string[]) => {
      branchLines.push(`    ${branchCount === 0 ? "if" : "else if"} (${condition}) {`)
      branchLines.push(...body.map((line) => `      ${line}`))
      branchLines.push(`    }`)
      branchCount++
    }

    if (sets.all.length > 0) pushBranch(`${roleList(sets.all)}.includes(user.role)`, [`deleted = await ${lower}Service.delete(id)`])
    if (tenantScoped.length > 0 && tenantPath)
      pushBranch(`${roleList(tenantScoped)}.includes(user.role)`, [
        `if (!user.tenantId) return reply.status(403).send({ message: "Forbidden" })`,
        `deleted = await ${lower}Service.deleteForTenant(id, user.tenantId)`,
      ])
    if (ownScoped.length > 0 && ownField)
      pushBranch(`${roleList(ownScoped)}.includes(user.role)`, [`deleted = await ${lower}Service.deleteForOwner(id, user.id)`])

    if (branchCount === 0) {
      lines.push(`    // Nenhuma regra de exclusão configurada: nega por padrão`)
      lines.push(`    return reply.status(403).send({ message: "Forbidden" })`)
    } else {
      lines.push(`    let deleted = false`)
      lines.push(...branchLines)
      lines.push(`    else {`)
      lines.push(`      return reply.status(403).send({ message: "Forbidden" })`)
      lines.push(`    }`)
      lines.push(`    if (!deleted) return reply.status(404).send({ message: "${name} not found" })`)
      lines.push(`    return reply.status(204).send()`)
    }

    routes.push(`  app.delete("/${path}/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.user
${lines.join("\n")}
  })`)
  }

  const validationImport = usesValidation
    ? `import { create${name}Schema, update${name}Schema } from "../validation/${lower}.validation"\n`
    : ""
  const extraImportSection = extraImports.length > 0 ? `${[...new Set(extraImports)].join("\n")}\n` : ""

  return `import type { FastifyInstance } from "fastify"
import { ${lower}Service } from "../services/${lower}.service"
import type { ${name}${usesNewType ? `, New${name}` : ""} } from "../schema/${lower}.schema"
${validationImport}${extraImportSection}
export async function ${lower}Routes(app: FastifyInstance) {
${routes.join("\n\n")}
}
`
}

export function generateApiClient(mod: Module): string {
  const name = capitalize(mod.name)
  const lower = mod.name.toLowerCase()
  const path = apiPath(mod)
  const ops = mod.operations.filter((o) => o.enabled).map((o) => o.type)

  const fns: string[] = []

  if (ops.includes("create"))
    fns.push(`export async function create${name}(data: New${name}): Promise<${name}> {
  return request<${name}>("/${path}", { method: "POST", body: JSON.stringify(data) })
}`)

  if (ops.includes("readMany"))
    fns.push(`export async function getAll${name}s(): Promise<${name}[]> {
  return request<${name}[]>("/${path}")
}`)

  if (ops.includes("readOne"))
    fns.push(`export async function get${name}(id: string): Promise<${name}> {
  return request<${name}>(\`/${path}/\${id}\`)
}`)

  if (ops.includes("update"))
    fns.push(`export async function update${name}(id: string, data: Partial<New${name}>): Promise<${name}> {
  return request<${name}>(\`/${path}/\${id}\`, { method: "PUT", body: JSON.stringify(data) })
}`)

  if (ops.includes("delete"))
    fns.push(`export async function delete${name}(id: string): Promise<void> {
  await request<void>(\`/${path}/\${id}\`, { method: "DELETE" })
}`)

  return `import type { ${name} } from "./${lower}.types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"

export type New${name} = Omit<${name}, "id" | "createdAt" | "updatedAt">

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(\`\${API_URL}\${path}\`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

${fns.join("\n\n")}
`
}

function orderedModules(project?: Project): Module[] {
  if (!project) return []
  const modules = project.modules
  const emitted = new Set<string>()
  const ordered: Module[] = []
  const pending = [...modules]

  while (pending.length > 0) {
    let index = pending.findIndex((mod) =>
      domainFields(mod).every((field) => {
        const target = relationModule(field)
        if (!target) return true
        const dep = modules.find((m) => m.name.toLowerCase() === target.toLowerCase())
        return (
          !dep ||
          dep.name.toLowerCase() === mod.name.toLowerCase() ||
          emitted.has(dep.name.toLowerCase())
        )
      })
    )
    if (index === -1) index = 0
    const [next] = pending.splice(index, 1)
    if (!next) break
    ordered.push(next)
    emitted.add(next.name.toLowerCase())
  }

  return ordered
}

/** Deterministic migration filename: 001 is reserved for users, modules start at 002. */
export function migrationFileName(mod: Module, project?: Project): string {
  const ordered = orderedModules(project)
  const index = ordered.findIndex((m) => m.name.toLowerCase() === mod.name.toLowerCase())
  const rank = String((index === -1 ? ordered.length : index) + 2).padStart(3, "0")
  return `${rank}_create_${mod.tableName}.sql`
}

function pluralizeTable(name: string): string {
  const snake = camelToSnake(name)
  if (snake.endsWith("y")) return `${snake.slice(0, -1)}ies`
  if (snake.endsWith("s")) return `${snake}es`
  return `${snake}s`
}

function relationTable(project: Project | undefined, field: Field): string | undefined {
  const target = relationModule(field)
  if (!target) return undefined
  const mod = project?.modules.find((m) => m.name.toLowerCase() === target.toLowerCase())
  if (mod) return mod.tableName
  if (target.toLowerCase() === "user" || target.toLowerCase() === "users") return "users"
  return pluralizeTable(target)
}

export function generateMigration(mod: Module, project?: Project): string {
  const columns = [
    `  id UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
    ...domainFields(mod).map((f) => {
      let sqlType = "TEXT"
      let colName = camelToSnake(f.name)
      let references = ""
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
        const target = relationTable(project, f)
        if (target) references = ` REFERENCES ${target}(id) ON DELETE ${f.nullable ? "SET NULL" : "CASCADE"}`
      }
      const notNull = !f.nullable ? " NOT NULL" : ""
      const unique = f.unique ? " UNIQUE" : ""
      return `  ${colName} ${sqlType}${notNull}${unique}${references}`
    }),
    `  created_at TIMESTAMP NOT NULL DEFAULT NOW()`,
    `  updated_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  ].join(",\n")

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_${mod.tableName}_created_at ON ${mod.tableName} (created_at);`,
    ...domainFields(mod)
      .filter((f) => typeof f.type === "object" && f.type.kind === "relation")
      .map((f) => {
        const colName = `${camelToSnake(f.name)}_id`
        return `CREATE INDEX IF NOT EXISTS idx_${mod.tableName}_${colName} ON ${mod.tableName} (${colName});`
      }),
  ].join("\n")

  return `-- Migration: create_${mod.tableName}
-- Generated: ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS ${mod.tableName} (
${columns}
);

${indexes}
`
}

export function generateValidationSchema(mod: Module): string {
  const name = capitalize(mod.name)

  const entries = domainFields(mod).map((field) => {
    let schema = "z.unknown()"
    if (typeof field.type === "string") {
      switch (field.type) {
        case "string": schema = "z.string()"; break
        case "text": schema = "z.string()"; break
        case "integer": schema = "z.number().int()"; break
        case "float": schema = "z.number()"; break
        case "boolean": schema = "z.boolean()"; break
        case "date": schema = 'z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, "Use YYYY-MM-DD")'; break
        case "datetime": schema = "z.string().min(1)"; break
        case "uuid": schema = "z.string().uuid()"; break
        case "json": schema = "z.unknown()"; break
      }
    } else if (field.type.kind === "enum") {
      schema = field.type.values.length > 0
        ? `z.enum([${field.type.values.map((value) => JSON.stringify(value)).join(", ")}])`
        : "z.string()"
    } else {
      schema = "z.string().uuid()"
    }
    if (field.nullable) schema += ".nullable().optional()"
    const key =
      typeof field.type === "object" && field.type.kind === "relation"
        ? `${field.name}Id`
        : field.name
    return `  ${key}: ${schema},`
  })

  return `import { z } from "zod"

export const create${name}Schema = z.object({
${entries.join("\n")}
})

export const update${name}Schema = create${name}Schema.partial()

export type Create${name}Input = z.infer<typeof create${name}Schema>
export type Update${name}Input = z.infer<typeof update${name}Schema>
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
      tsType = f.type.values.length > 0
        ? f.type.values.map((v) => `"${v}"`).join(" | ")
        : "string"
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

    const endpoints = mod.operations
      .filter((o) => o.enabled)
      .map((o) => {
        const base = `/api/${apiPath(mod)}`
        switch (o.type) {
          case "create": return `- \`POST ${base}\``
          case "readMany": return `- \`GET ${base}\``
          case "readOne": return `- \`GET ${base}/:id\``
          case "update": return `- \`PUT ${base}/:id\``
          case "delete": return `- \`DELETE ${base}/:id\``
          default: return ""
        }
      })
      .filter(Boolean)

    return `### ${mod.name}

Table: \`${mod.tableName}\`

**API:**

${endpoints.join("\n") || "—"}

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
| POST | \`/api/auth/register\` | Register a new user \`{ email, password, role }\` (role must be allowed by \`SELF_REGISTER_ROLES\`) |
| POST | \`/api/auth/login\` | Login \`{ email, password }\` → returns \`{ token, user }\` |
| GET | \`/api/auth/me\` | Returns the authenticated user (requires a Bearer token) |

All other routes require \`Authorization: Bearer <token>\` (the generated frontend forwards its auth cookie as a Bearer header).

## Roles

${roleList}

## Modules (${project.modules.length})

${moduleSections.join("\n\n---\n\n")}
`
}
