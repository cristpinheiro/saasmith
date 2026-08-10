# SaaSMith

Desktop app for SaaS development — define modules visually and generate standardized backend and frontend code.

## What it does

SaaSMith lets you describe your data model through a UI and generates production-ready code for each module:

**Backend (Fastify + Drizzle + PostgreSQL)**
- Drizzle schema + TypeScript types
- Repository (database queries)
- Service (business logic layer)
- Route handlers with authentication middleware
- SQL migration file

**Frontend (Next.js)**
- TypeScript types
- API client functions (fetch wrappers)

Role-based access control is defined per module and per operation — you choose which roles can `create`, `read`, `update`, or `delete` each resource.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust) |
| UI | Next.js 16 + React 19 + Tailwind CSS v4 |
| State | Zustand |
| Generated ORM | Drizzle ORM |
| Generated backend | Fastify |
| Generated DB | PostgreSQL |

## Requirements

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- Windows: WebView2 (ships with Windows 11, available for Windows 10)

## Development

```powershell
# Install dependencies
npm install

# Run in development mode (opens desktop window)
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri:dev
```

> First run compiles all Rust dependencies (~3-5 minutes). Subsequent runs are fast (~10-20 seconds).

## Build

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri:build
```

Produces a Windows installer at `src-tauri/target/release/bundle/`.

## Project structure

```
saasmith/
├── app/                  # Next.js pages and layout
├── components/           # UI components
│   ├── WelcomeScreen     # Project creation / open
│   ├── Header            # Project name, save, settings
│   ├── Sidebar           # Module list
│   ├── ModuleDetail      # Module overview + code preview
│   ├── CreateModuleModal # Create / edit module (3-step wizard)
│   └── ProjectSettingsModal # Manage roles
├── lib/
│   ├── types.ts          # Core data types (Project, Module, Field…)
│   ├── store/project.ts  # Zustand store + file I/O via Tauri
│   ├── env.ts            # Tauri environment detection
│   └── generator/        # Code generation templates
└── src-tauri/            # Rust/Tauri shell
    ├── src/commands.rs   # read_project / write_project commands
    └── capabilities/     # Tauri permission definitions
```

## How it works

1. **Create a project** — give it a name and define your roles (`admin`, `user`, etc.)
2. **Add modules** — name the entity, define fields with types, choose which CRUD operations to expose and which roles can access them
3. **Set output path** — point SaaSMith at your SaaS project folder
4. **Generate** — files are written directly into `backend/src/` and `frontend/src/api/`
5. **Preview** — inspect generated code inside the app before writing to disk

The project configuration is saved as a `.saasmith.json` file — this is the source of truth. Regenerating a module overwrites its files; manual edits to generated files will be lost.
