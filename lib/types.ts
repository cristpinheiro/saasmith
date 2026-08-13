export type FieldType =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "uuid"
  | "json"
  | { kind: "enum"; values: string[] }
  | { kind: "relation"; module: string; cardinality: "one" | "many" }

export type Field = {
  id: string
  name: string
  type: FieldType
  nullable: boolean
  unique: boolean
  default?: string
}

export type OperationType = "create" | "readOne" | "readMany" | "update" | "delete"

export type OperationScope = "all" | "tenant" | "own"

export type OperationRule = {
  roles: string[]
  scope: OperationScope
}

export type Operation = {
  type: OperationType
  enabled: boolean
  rules: OperationRule[]
}

export type Module = {
  id: string
  name: string
  tableName: string
  fields: Field[]
  operations: Operation[]
}

export type Role = {
  id: string
  name: string
}

export type Project = {
  id: string
  name: string
  outputPath: string | null
  roles: Role[]
  modules: Module[]
  tenantModule?: string
}
