import type { Module, Role } from "../types"

export function generatePackageJson(projectName: string): string {
  const name = projectName.toLowerCase().replace(/\s+/g, "-")
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      scripts: {
        dev: "tsx watch src/index.ts",
        build: "tsc",
        start: "node dist/index.js",
        "db:migrate": "tsx src/migrate.ts",
      },
      dependencies: {
        fastify: "^5.0.0",
        "@fastify/jwt": "^9.0.0",
        "@fastify/cors": "^10.0.0",
        "fastify-plugin": "^4.5.1",
        "drizzle-orm": "^0.40.0",
        pg: "^8.13.0",
        bcryptjs: "^2.4.3",
        dotenv: "^16.4.5",
        zod: "^3.24.0",
      },
      devDependencies: {
        typescript: "^5.7.0",
        tsx: "^4.19.0",
        "@types/node": "^22.0.0",
        "@types/pg": "^8.11.0",
        "@types/bcryptjs": "^2.4.6",
        "drizzle-kit": "^0.30.0",
      },
    },
    null,
    2
  )
}

export function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        lib: ["ES2022"],
        outDir: "dist",
        rootDir: "src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
      },
      include: ["src"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2
  )
}

export function generateDrizzleConfig(): string {
  return `import type { Config } from "drizzle-kit"
import "dotenv/config"

export default {
  schema: "./src/schema/*",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
`
}

export function generateEnvExample(roles: Role[] = []): string {
  const candidates = roles.filter(
    (role) => !["admin", "superadmin", "root"].includes(role.name.toLowerCase())
  )
  const selfRegisterRoles =
    (candidates.length > 0 ? candidates : roles).map((role) => role.name).join(",") || "user"

  return `DATABASE_URL=postgresql://user:password@localhost:5432/dbname
JWT_SECRET=change-this-to-a-long-random-secret
PORT=3333
# Origens permitidas no CORS (separadas por vírgula)
CORS_ORIGIN=http://localhost:3000
APP_URL=http://localhost:3000
# Roles que podem se cadastrar sozinhas; remova roles privilegiadas desta lista
SELF_REGISTER_ROLES=${selfRegisterRoles}
`
}

export function generateDbTs(): string {
  return `import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import "dotenv/config"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool)
`
}

export function generateAuthPlugin(): string {
  return `import fp from "fastify-plugin"
import jwt from "@fastify/jwt"
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import "dotenv/config"

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string; tenantId?: string }
    user: { id: string; email: string; role: string; tenantId?: string }
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(async (app: FastifyInstance) => {
  const secret = process.env.JWT_SECRET
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production")
  }
  app.register(jwt, { secret: secret ?? "dev-only-insecure-secret" })

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ message: "Unauthorized" })
    }
  })
})
`
}

export function generateApp(modules: Module[]): string {
  const imports = modules
    .map((m) => {
      const lower = m.name.toLowerCase()
      return `import { ${lower}Routes } from "./routes/${lower}.routes"`
    })
    .join("\n")

  const registers = modules
    .map((m) => {
      const lower = m.name.toLowerCase()
      return `  app.register(${lower}Routes, { prefix: "/api" })`
    })
    .join("\n")

  return `import Fastify from "fastify"
import cors from "@fastify/cors"
import "dotenv/config"
import authPlugin from "./plugins/auth.plugin"
import { authRoutes } from "./routes/auth.routes"
${imports}

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" })

  const origins = (process.env.CORS_ORIGIN ?? process.env.APP_URL ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.register(cors, { origin: origins, credentials: true })
  app.get("/health", async () => ({ status: "ok" }))

  app.register(authPlugin)
  app.register(authRoutes, { prefix: "/api/auth" })
${registers}

  return app
}
`
}

export function generateIndexTs(): string {
  return `import "dotenv/config"
import { buildApp } from "./app"

const app = buildApp()
const port = Number(process.env.PORT) || 3333

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(\`Server running on http://localhost:\${port}\`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
`
}

export function generateUserSchema(): string {
  return `import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core"

export const usersTable = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
  role: varchar({ length: 100 }).notNull().default("user"),
  tenantId: uuid("tenant_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export type User = typeof usersTable.$inferSelect
export type NewUser = typeof usersTable.$inferInsert
`
}

export function generateUserMigration(): string {
  return `-- Migration: create_users
-- Generated: ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'user',
  tenant_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);
`
}

export function generateAuthRoutes(roles: Role[]): string {
  const roleValues = roles.map((role) => JSON.stringify(role.name)).join(", ")
  const roleSchema = roleValues ? `z.enum([${roleValues}])` : "z.string().min(1)"
  const candidates = roles.filter(
    (role) => !["admin", "superadmin", "root"].includes(role.name.toLowerCase())
  )
  const defaultSelfRegister =
    (candidates.length > 0 ? candidates : roles).map((role) => role.name).join(",") || "user"

  return `import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authService } from "../services/auth.service"

const SELF_REGISTER_ROLES = (process.env.SELF_REGISTER_ROLES ?? "${defaultSelfRegister}")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean)

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
  role: ${roleSchema},
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(422).send({ message: "Dados inválidos", issues: parsed.error.issues })
    if (!SELF_REGISTER_ROLES.includes(parsed.data.role))
      return reply.status(403).send({ message: "Role não permitida para cadastro" })

    try {
      const result = await authService.register(parsed.data.email, parsed.data.password, parsed.data.role)
      return reply.status(201).send(result)
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_IN_USE")
        return reply.status(409).send({ message: "E-mail já cadastrado" })
      throw err
    }
  })

  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(422).send({ message: "Dados inválidos", issues: parsed.error.issues })

    const result = await authService.login(parsed.data.email, parsed.data.password, app)
    if (!result) return reply.status(401).send({ message: "Invalid credentials" })
    return reply.send(result)
  })

  app.get("/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    return reply.send(req.user)
  })
}
`
}

export function generateAuthService(): string {
  return `import bcrypt from "bcryptjs"
import { db } from "../db"
import { usersTable } from "../schema/user.schema"
import { eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"

export class AuthService {
  async register(email: string, password: string, role: string) {
    const normalizedEmail = email.trim().toLowerCase()
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
    if (existing.length > 0) throw new Error("EMAIL_IN_USE")

    const hash = await bcrypt.hash(password, 10)
    const [user] = await db
      .insert(usersTable)
      .values({ email: normalizedEmail, password: hash, role })
      .returning()
    const { password: _, ...safe } = user
    return safe
  }

  async login(email: string, password: string, app: FastifyInstance) {
    const normalizedEmail = email.trim().toLowerCase()
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail))
    if (!user) return null
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return null
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    }
    const token = app.jwt.sign(payload, { expiresIn: "7d" })
    return { token, user: payload }
  }

  async setTenant(userId: string, tenantId: string) {
    await db.update(usersTable).set({ tenantId }).where(eq(usersTable.id, userId))
  }
}

export const authService = new AuthService()
`
}

export function generateMigrateScript(): string {
  return `import { Pool } from "pg"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import "dotenv/config"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(\`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    \`)

    const dir = join(process.cwd(), "src", "migrations")
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()

    for (const file of files) {
      const { rows } = await client.query("SELECT id FROM _migrations WHERE name = $1", [file])
      if (rows.length > 0) { console.log(\`Skip \${file}\`); continue }
      const sql = await readFile(join(dir, file), "utf-8")
      console.log(\`Apply \${file}...\`)
      await client.query(sql)
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file])
    }

    console.log("Migrations done")
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => { console.error(err); process.exit(1) })
`
}

export function generateDockerfile(): string {
  return `FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3333

CMD ["sh", "-c", "npm run db:migrate && node dist/index.js"]
`
}

export function generateDockerIgnore(): string {
  return `node_modules
dist
.env
`
}

export function generateDockerCompose(projectName: string): string {
  const db = projectName.toLowerCase().replace(/\s+/g, "_")
  return `services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${db}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: ./backend
    restart: always
    ports:
      - "3333:3333"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/${db}
      JWT_SECRET: change-this-to-a-long-random-secret
      PORT: 3333
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
`
}
