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
        "fastify-plugin": "^4.5.1",
        "drizzle-orm": "^0.40.0",
        pg: "^8.13.0",
        bcryptjs: "^2.4.3",
        dotenv: "^16.4.5",
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

export function generateEnvExample(): string {
  return `DATABASE_URL=postgresql://user:password@localhost:5432/dbname
JWT_SECRET=change-this-to-a-long-random-secret
PORT=3333
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

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(async (app: FastifyInstance) => {
  app.register(jwt, { secret: process.env.JWT_SECRET ?? "changeme-set-in-env" })

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.send(err)
    }
  })
})
`
}

export function generateAppEntrypoint(modules: Module[]): string {
  const imports = modules
    .map((m) => {
      const lower = m.name.toLowerCase()
      const cap = m.name.charAt(0).toUpperCase() + m.name.slice(1)
      return `import { ${lower}Routes } from "./routes/${lower}.routes"`
    })
    .join("\n")

  const registers = modules
    .map((m) => {
      const lower = m.name.toLowerCase()
      return `app.register(${lower}Routes, { prefix: "/api" })`
    })
    .join("\n")

  return `import Fastify from "fastify"
import "dotenv/config"
import authPlugin from "./plugins/auth.plugin"
import { authRoutes } from "./routes/auth.routes"
${imports}

const app = Fastify({ logger: true })

app.register(authPlugin)
app.register(authRoutes, { prefix: "/api/auth" })
${registers}

const port = Number(process.env.PORT) || 3333
app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) { app.log.error(err); process.exit(1) }
  console.log(\`Server running on http://localhost:\${port}\`)
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
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})

export type User = typeof usersTable.$inferSelect
export type NewUser = typeof usersTable.$inferInsert
`
}

export function generateUserMigration(): string {
  const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14)
  return `-- Migration: create_users
-- Generated: ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);
`
}

export function generateAuthRoutes(roles: Role[]): string {
  const roleEnum = roles.map((r) => `"${r.name}"`).join(" | ") || "string"
  return `import type { FastifyInstance } from "fastify"
import { authService } from "../services/auth.service"

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const { email, password, role } = req.body as { email: string; password: string; role: ${roleEnum} }
    const result = await authService.register(email, password, role)
    return reply.status(201).send(result)
  })

  app.post("/login", async (req, reply) => {
    const { email, password } = req.body as { email: string; password: string }
    const result = await authService.login(email, password, app)
    if (!result) return reply.status(401).send({ message: "Invalid credentials" })
    return reply.send(result)
  })

  app.get("/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    return reply.send((req as any).user)
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
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email))
    if (existing.length > 0) throw new Error("Email already in use")
    const hash = await bcrypt.hash(password, 10)
    const [user] = await db.insert(usersTable).values({ email, password: hash, role }).returning()
    const { password: _, ...safe } = user
    return safe
  }

  async login(email: string, password: string, app: FastifyInstance) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email))
    if (!user) return null
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return null
    const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role }, { expiresIn: "7d" })
    return { token, user: { id: user.id, email: user.email, role: user.role } }
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
