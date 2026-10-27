import Anthropic from "@anthropic-ai/sdk"
import type { Module, Field, Operation, FieldType, Role } from "./types"
import { isTauri } from "./env"

export type AiMessage = { role: "user" | "assistant"; content: string }

export type AiResult =
  | { type: "text"; content: string }
  | { type: "modules"; modules: Omit<Module, "id">[]; message: string }

export type SetupResult =
  | { type: "text"; content: string }
  | {
      type: "proposal"
      summary: string
      roles: Omit<Role, "id">[]
      modules: Omit<Module, "id">[]
      message: string
    }

type AiOperationInput = {
  type: string
  enabled: boolean
  roles?: string[]
  rules?: Operation["rules"]
}

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }

type AnthropicResponse = {
  content: AnthropicContent[]
  stop_reason: string
}

const CREATE_MODULE_TOOL: Anthropic.Tool = {
  name: "create_module",
  description:
    "Create a SaaSMith module from the user's description. Use this whenever the user describes an entity, resource, or data model they want to add to their project.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "PascalCase module name (e.g. UserProfile, BlogPost)" },
      tableName: { type: "string", description: "snake_case plural table name (e.g. user_profiles, blog_posts)" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "camelCase field name" },
            type: {
              type: "string",
              description:
                "Field type: one of string, text, integer, float, boolean, date, datetime, uuid, json, enum:val1:val2:val3, relation:ModuleName:one, relation:ModuleName:many",
            },
            nullable: { type: "boolean" },
            unique: { type: "boolean" },
          },
          required: ["name", "type", "nullable", "unique"],
        },
      },
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["create", "readOne", "readMany", "update", "delete"] },
            enabled: { type: "boolean" },
            roles: { type: "array", items: { type: "string" } },
          },
          required: ["type", "enabled", "roles"],
        },
      },
    },
    required: ["name", "tableName", "fields", "operations"],
  },
}

function parseFieldType(raw: string): FieldType {
  if (raw.startsWith("enum:")) {
    const values = raw.slice(5).split(":").filter(Boolean)
    return { kind: "enum", values }
  }
  if (raw.startsWith("relation:")) {
    const parts = raw.split(":")
    const mod = parts[1] ?? "Unknown"
    const cardinality = parts[2] === "many" ? "many" : "one"
    return { kind: "relation", module: mod, cardinality }
  }
  const simple = ["string", "text", "integer", "float", "boolean", "date", "datetime", "uuid", "json"]
  if (simple.includes(raw)) return raw as FieldType
  return "string"
}

function buildSystemContext(projectName: string, roles: string[], modules: string[]): string {
  return `You are an AI assistant embedded in SaaSMith, a desktop tool for designing SaaS backend projects.

Project: ${projectName}
Roles: ${roles.length ? roles.join(", ") : "none defined"}
Existing modules: ${modules.length ? modules.join(", ") : "none"}

When the user describes multiple data models or asks to create several entities at once, call create_module once per module — all in the same response.
When the user describes a single data model, entity, or module, call create_module once.
When answering questions or having a general conversation, reply with plain text.
Keep responses concise and helpful. Respond in the same language the user uses.`
}

function parseAnthropicResponse(response: AnthropicResponse): AiResult {
  const toolUses = response.content.filter(
    (c): c is AnthropicContent & { type: "tool_use" } =>
      c.type === "tool_use" && (c as { name?: string }).name === "create_module"
  )

  if (toolUses.length > 0) {
    const textBlock = response.content.find((c) => c.type === "text") as
      | (AnthropicContent & { type: "text" })
      | undefined

    const modules = toolUses.map((toolUse) => {
      const input = toolUse.input as {
        name: string
        tableName: string
        fields: { name: string; type: string; nullable: boolean; unique: boolean }[]
        operations: AiOperationInput[]
      }
      return {
        name: input.name,
        tableName: input.tableName,
        fields: (input.fields ?? []).map(
          (f): Field => ({
            id: crypto.randomUUID(),
            name: f.name,
            type: parseFieldType(f.type),
            nullable: f.nullable ?? false,
            unique: f.unique ?? false,
          })
        ),
        operations: (input.operations ?? []).map(
          (o): Operation => {
            return {
              type: o.type as Operation["type"],
              enabled: o.enabled,
              rules: o.rules ?? (o.roles?.length ? [{ roles: o.roles, scope: "all" as const }] : []),
            }
          }
        ),
      } satisfies Omit<Module, "id">
    })

    return {
      type: "modules",
      modules,
      message: textBlock?.text ?? `${modules.length} módulo${modules.length > 1 ? "s" : ""} criado${modules.length > 1 ? "s" : ""}:`,
    }
  }

  const textBlock = response.content.find((c) => c.type === "text") as
    | (AnthropicContent & { type: "text" })
    | undefined
  return { type: "text", content: textBlock?.text ?? "" }
}

async function callViaTauri(
  requestBody: object,
  baseUrl: string,
  apiKey: string,
  authToken: string
): Promise<AnthropicResponse> {
  const { invoke } = await import("@tauri-apps/api/core")
  const base = baseUrl.replace(/\/$/, "") || "https://api.anthropic.com"
  const url = `${base}/v1/messages`
  const raw = await invoke<string>("call_ai", {
    url,
    apiKey: apiKey || null,
    authToken: authToken || null,
    body: JSON.stringify(requestBody),
  })
  return JSON.parse(raw) as AnthropicResponse
}

async function callViaSdk(
  requestBody: Parameters<Anthropic["messages"]["create"]>[0],
  apiKey: string,
  baseUrl: string,
  authToken: string
): Promise<AnthropicResponse> {
  const opts: ConstructorParameters<typeof Anthropic>[0] = { dangerouslyAllowBrowser: true }
  if (authToken) opts.authToken = authToken
  else opts.apiKey = apiKey
  if (baseUrl) opts.baseURL = baseUrl

  const client = new Anthropic(opts)
  const response = await client.messages.create(requestBody)
  return response as unknown as AnthropicResponse
}

export async function sendMessage(
  messages: AiMessage[],
  projectName: string,
  roles: string[],
  modules: string[],
  apiKey: string,
  baseUrl = "",
  authToken = "",
  model = ""
): Promise<AiResult> {
  const requestBody = {
    model: model || "claude-opus-5",
    max_tokens: 2048,
    system: buildSystemContext(projectName, roles, modules),
    messages,
    tools: [CREATE_MODULE_TOOL],
    tool_choice: { type: "auto" },
  }

  const response = isTauri()
    ? await callViaTauri(requestBody, baseUrl, apiKey, authToken)
    : await callViaSdk(
        requestBody as Parameters<Anthropic["messages"]["create"]>[0],
        apiKey,
        baseUrl,
        authToken
      )

  return parseAnthropicResponse(response)
}

const MODULE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "PascalCase module name" },
    tableName: { type: "string", description: "snake_case plural table name" },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", description: "string, text, integer, float, boolean, date, datetime, uuid, json, enum:v1:v2, relation:Module:one/many" },
          nullable: { type: "boolean" },
          unique: { type: "boolean" },
        },
        required: ["name", "type", "nullable", "unique"],
      },
    },
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["create", "readOne", "readMany", "update", "delete"] },
          enabled: { type: "boolean" },
          roles: { type: "array", items: { type: "string" } },
        },
        required: ["type", "enabled", "roles"],
      },
    },
  },
  required: ["name", "tableName", "fields", "operations"],
}

const PROPOSE_SETUP_TOOL: Anthropic.Tool = {
  name: "propose_project_setup",
  description: "Call this when you have gathered enough information to propose the complete project structure. You MUST include ALL identified roles AND ALL identified modules in this single call. Never submit with an empty modules array — if you have identified any entities or data models, they must all appear here.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One sentence describing what the system does" },
      roles: {
        type: "array",
        description: "User types that will access the system",
        items: {
          type: "object",
          properties: { name: { type: "string", description: "lowercase role name" } },
          required: ["name"],
        },
      },
      modules: {
        type: "array",
        description: "All data modules/entities the system needs",
        items: MODULE_ITEM_SCHEMA,
      },
    },
    required: ["summary", "roles", "modules"],
  },
}

function parseSetupResponse(response: AnthropicResponse): SetupResult {
  const toolUse = response.content.find(
    (c): c is AnthropicContent & { type: "tool_use" } =>
      c.type === "tool_use" && (c as { name?: string }).name === "propose_project_setup"
  )

  if (toolUse) {
    const input = toolUse.input as {
      summary: string
      roles: { name: string }[]
      modules: {
        name: string
        tableName: string
        fields: { name: string; type: string; nullable: boolean; unique: boolean }[]
        operations: AiOperationInput[]
      }[]
    }
    const textBlock = response.content.find((c) => c.type === "text") as
      | (AnthropicContent & { type: "text" })
      | undefined

    const modules: Omit<Module, "id">[] = (input.modules ?? []).map((m) => ({
      name: m.name,
      tableName: m.tableName,
      fields: (m.fields ?? []).map((f): Field => ({
        id: crypto.randomUUID(),
        name: f.name,
        type: parseFieldType(f.type),
        nullable: f.nullable ?? false,
        unique: f.unique ?? false,
      })),
      operations: (m.operations ?? []).map((o): Operation => ({
        type: o.type as Operation["type"],
        enabled: o.enabled,
        rules: o.rules ?? (o.roles?.length ? [{ roles: o.roles, scope: "all" as const }] : []),
      })),
    }))

    return {
      type: "proposal",
      summary: input.summary ?? "",
      roles: (input.roles ?? []).map((r) => ({ name: r.name })),
      modules,
      message: textBlock?.text ?? "Aqui está minha proposta para o projeto:",
    }
  }

  const textBlock = response.content.find((c) => c.type === "text") as
    | (AnthropicContent & { type: "text" })
    | undefined
  return { type: "text", content: textBlock?.text ?? "" }
}

export async function sendSetupMessage(
  messages: AiMessage[],
  projectName: string,
  apiKey: string,
  baseUrl = "",
  authToken = "",
  model = ""
): Promise<SetupResult> {
  const system = `You are a SaaS project consultant helping define the initial structure of "${projectName}".

Your goal: gather enough information to propose roles and data modules for the project.

Process:
1. If this is the first message, greet the user and ask them to describe what the system does
2. Ask 1-2 focused follow-up questions — one at a time — about user types and main entities
3. After 2-4 exchanges, when you have a clear picture, call propose_project_setup

CRITICAL rules when calling propose_project_setup:
- The modules array MUST NOT be empty — include every entity/module you have identified
- Include ALL roles AND ALL modules in the SAME single tool call
- Do NOT describe module details in text — put everything in the tool call parameters
- Each module needs domain-specific fields only — do NOT include id, createdAt, or updatedAt (those are added automatically)

Keep responses short and conversational. Ask one question at a time. Respond in the same language the user uses.`

  const callApi = (body: object): Promise<AnthropicResponse> =>
    isTauri()
      ? callViaTauri(body, baseUrl, apiKey, authToken)
      : callViaSdk(body as Parameters<Anthropic["messages"]["create"]>[0], apiKey, baseUrl, authToken)

  const baseMessages =
    messages.length === 0 ? [{ role: "user" as const, content: `Project name: ${projectName}` }] : messages

  const requestBody = {
    model: model || "claude-opus-5",
    max_tokens: 4096,
    system,
    messages: baseMessages,
    tools: [PROPOSE_SETUP_TOOL],
    tool_choice: { type: "auto" },
  }

  let response = await callApi(requestBody)
  let result = parseSetupResponse(response)

  // Auto-retry when the tool was called but modules array came back empty
  if (result.type === "proposal" && result.modules.length === 0) {
    const failedToolUse = response.content.find(
      (c): c is AnthropicContent & { type: "tool_use" } =>
        c.type === "tool_use" && (c as { name?: string }).name === "propose_project_setup"
    )
    if (failedToolUse) {
      const retryMessages = [
        ...baseMessages,
        { role: "assistant" as const, content: response.content },
        {
          role: "user" as const,
          content: [
            {
              type: "tool_result",
              tool_use_id: failedToolUse.id,
              content:
                "Error: modules array is empty. You must call propose_project_setup again and include ALL the modules/entities you identified. Do not leave modules empty.",
            },
          ],
        },
      ]
      response = await callApi({
        ...requestBody,
        messages: retryMessages,
        tool_choice: { type: "tool", name: "propose_project_setup" },
      })
      result = parseSetupResponse(response)
    }
  }

  return result
}
