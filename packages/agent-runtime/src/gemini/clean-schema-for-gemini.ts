// ============================================================================
// Gemini Schema Sanitization
// ============================================================================
// Gemini rejects a subset of JSON Schema keywords. This module scrubs/normalizes
// tool schemas to keep Gemini happy. Adapted from OpenClaw's clean-for-gemini.ts.
// ============================================================================

/** Keywords that Gemini API rejects */
export const GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "patternProperties",
  "additionalProperties",
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "definitions",
  "examples",
  // Constraint keywords that trigger 400s
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "multipleOf",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  // Conditional keywords
  "if",
  "then",
  "else",
  // Composition keywords handled separately
  "not",
  // Misc
  "dependentRequired",
  "dependentSchemas",
  "title",
  "default",
  "id",
  "const",
])

// ============================================================================
// Helpers
// ============================================================================

type SchemaDefs = Map<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Check if an anyOf/oneOf variant represents a null type.
 */
function isNullSchema(variant: unknown): boolean {
  if (!isRecord(variant)) return false
  if ("const" in variant && variant.const === null) return true
  if (Array.isArray(variant.enum) && variant.enum.length === 1 && variant.enum[0] === null) return true
  if (variant.type === "null") return true
  if (Array.isArray(variant.type) && variant.type.length === 1 && variant.type[0] === "null") return true
  return false
}

/**
 * Strip null variants from anyOf/oneOf (Gemini doesn't support nullable types).
 */
function stripNullVariants(variants: unknown[]): { variants: unknown[]; stripped: boolean } {
  const nonNull = variants.filter((v) => !isNullSchema(v))
  return { variants: nonNull, stripped: nonNull.length !== variants.length }
}

/**
 * Try to flatten anyOf/oneOf of literals into a single enum.
 * TypeBox Type.Literal generates { const: "value", type: "string" }.
 */
function tryFlattenLiteralAnyOf(variants: unknown[]): { type: string; enum: unknown[] } | null {
  if (variants.length === 0) return null

  const allValues: unknown[] = []
  let commonType: string | null = null

  for (const variant of variants) {
    if (!isRecord(variant)) return null

    let literalValue: unknown
    if ("const" in variant) {
      literalValue = variant.const
    } else if (Array.isArray(variant.enum) && variant.enum.length === 1) {
      literalValue = variant.enum[0]
    } else {
      return null
    }

    const variantType = typeof variant.type === "string" ? variant.type : null
    if (!variantType) return null
    if (commonType === null) {
      commonType = variantType
    } else if (commonType !== variantType) {
      return null
    }

    allValues.push(literalValue)
  }

  if (commonType && allValues.length > 0) {
    return { type: commonType, enum: allValues }
  }
  return null
}

/**
 * Collect $defs and definitions from a schema object.
 */
function extendSchemaDefs(
  defs: SchemaDefs | undefined,
  schema: Record<string, unknown>
): SchemaDefs | undefined {
  const defsEntry =
    isRecord(schema.$defs) ? (schema.$defs as Record<string, unknown>) : undefined
  const legacyDefsEntry =
    isRecord(schema.definitions) ? (schema.definitions as Record<string, unknown>) : undefined

  if (!defsEntry && !legacyDefsEntry) return defs

  const next = defs ? new Map(defs) : new Map<string, unknown>()
  if (defsEntry) {
    for (const [key, value] of Object.entries(defsEntry)) next.set(key, value)
  }
  if (legacyDefsEntry) {
    for (const [key, value] of Object.entries(legacyDefsEntry)) next.set(key, value)
  }
  return next
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~")
}

/**
 * Resolve a local $ref pointer (#/$defs/... or #/definitions/...).
 */
function tryResolveLocalRef(ref: string, defs: SchemaDefs | undefined): unknown {
  if (!defs) return undefined
  const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/)
  if (!match) return undefined
  const name = decodeJsonPointerSegment(match[1] ?? "")
  return name ? defs.get(name) : undefined
}

// ============================================================================
// Core Cleaner
// ============================================================================

function cleanSchemaWithDefs(
  schema: unknown,
  defs: SchemaDefs | undefined,
  refStack: Set<string> | undefined
): unknown {
  if (!schema || typeof schema !== "object") return schema
  if (Array.isArray(schema)) {
    return schema.map((item) => cleanSchemaWithDefs(item, defs, refStack))
  }

  const obj = schema as Record<string, unknown>
  const nextDefs = extendSchemaDefs(defs, obj)

  // Handle $ref resolution
  const refValue = typeof obj.$ref === "string" ? obj.$ref : undefined
  if (refValue) {
    // Cycle detection
    if (refStack?.has(refValue)) return {}

    const resolved = tryResolveLocalRef(refValue, nextDefs)
    if (resolved) {
      const nextRefStack = refStack ? new Set(refStack) : new Set<string>()
      nextRefStack.add(refValue)

      const cleaned = cleanSchemaWithDefs(resolved, nextDefs, nextRefStack)
      if (!isRecord(cleaned)) return cleaned

      // Preserve description/title from the $ref site
      const result: Record<string, unknown> = { ...cleaned }
      for (const key of ["description"]) {
        if (key in obj && obj[key] !== undefined) result[key] = obj[key]
      }
      return result
    }

    // Unresolvable ref — return empty with metadata
    const result: Record<string, unknown> = {}
    if ("description" in obj) result.description = obj.description
    return result
  }

  // Pre-process anyOf/oneOf
  const hasAnyOf = "anyOf" in obj && Array.isArray(obj.anyOf)
  const hasOneOf = "oneOf" in obj && Array.isArray(obj.oneOf)

  let cleanedAnyOf = hasAnyOf
    ? (obj.anyOf as unknown[]).map((v) => cleanSchemaWithDefs(v, nextDefs, refStack))
    : undefined
  let cleanedOneOf = hasOneOf
    ? (obj.oneOf as unknown[]).map((v) => cleanSchemaWithDefs(v, nextDefs, refStack))
    : undefined

  // Process anyOf: strip nulls, flatten literals
  if (hasAnyOf && cleanedAnyOf) {
    const { variants: nonNull, stripped } = stripNullVariants(cleanedAnyOf)
    if (stripped) cleanedAnyOf = nonNull

    const flattened = tryFlattenLiteralAnyOf(nonNull)
    if (flattened) {
      const result: Record<string, unknown> = { type: flattened.type, enum: flattened.enum }
      if ("description" in obj) result.description = obj.description
      return result
    }
    // Single non-null variant → unwrap
    if (stripped && nonNull.length === 1) {
      const lone = nonNull[0]
      if (isRecord(lone)) {
        const result: Record<string, unknown> = { ...lone }
        if ("description" in obj) result.description = obj.description
        return result
      }
      return lone
    }
  }

  // Process oneOf: same logic
  if (hasOneOf && cleanedOneOf) {
    const { variants: nonNull, stripped } = stripNullVariants(cleanedOneOf)
    if (stripped) cleanedOneOf = nonNull

    const flattened = tryFlattenLiteralAnyOf(nonNull)
    if (flattened) {
      const result: Record<string, unknown> = { type: flattened.type, enum: flattened.enum }
      if ("description" in obj) result.description = obj.description
      return result
    }
    if (stripped && nonNull.length === 1) {
      const lone = nonNull[0]
      if (isRecord(lone)) {
        const result: Record<string, unknown> = { ...lone }
        if ("description" in obj) result.description = obj.description
        return result
      }
      return lone
    }
  }

  // Build cleaned object
  const cleaned: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    // Skip unsupported keywords
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      // Convert const to enum
      if (key === "const") {
        cleaned.enum = [value]
      }
      continue
    }

    // Skip `type` if we have anyOf/oneOf (Gemini rejects type + anyOf together)
    if (key === "type" && (hasAnyOf || hasOneOf)) continue

    // Normalize type arrays: ["string", "null"] → "string"
    if (key === "type" && Array.isArray(value) && value.every((e) => typeof e === "string")) {
      const types = value.filter((e) => e !== "null")
      cleaned.type = types.length === 1 ? types[0] : types
      continue
    }

    // Recursively clean nested schemas
    if (key === "properties" && isRecord(value)) {
      cleaned[key] = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, cleanSchemaWithDefs(v, nextDefs, refStack)])
      )
    } else if (key === "items" && value) {
      if (Array.isArray(value)) {
        cleaned[key] = value.map((entry) => cleanSchemaWithDefs(entry, nextDefs, refStack))
      } else if (typeof value === "object") {
        cleaned[key] = cleanSchemaWithDefs(value, nextDefs, refStack)
      } else {
        cleaned[key] = value
      }
    } else if (key === "anyOf" && Array.isArray(value)) {
      cleaned[key] =
        cleanedAnyOf ?? value.map((v) => cleanSchemaWithDefs(v, nextDefs, refStack))
    } else if (key === "oneOf" && Array.isArray(value)) {
      cleaned[key] =
        cleanedOneOf ?? value.map((v) => cleanSchemaWithDefs(v, nextDefs, refStack))
    } else if (key === "allOf" && Array.isArray(value)) {
      cleaned[key] = value.map((v) => cleanSchemaWithDefs(v, nextDefs, refStack))
    } else {
      cleaned[key] = value
    }
  }

  return cleaned
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Clean a JSON Schema for Gemini compatibility.
 * - Strips unsupported keywords
 * - Resolves local $refs inline (with cycle detection)
 * - Converts const → enum
 * - Strips null from anyOf/oneOf (nullable types)
 * - Flattens literal unions to enum
 * - Normalizes type arrays
 */
export function cleanSchemaForGemini(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema
  if (Array.isArray(schema)) return schema.map(cleanSchemaForGemini)

  const defs = extendSchemaDefs(undefined, schema as Record<string, unknown>)
  return cleanSchemaWithDefs(schema, defs, undefined)
}

/**
 * Normalize a tool's parameter schema for cross-provider compatibility.
 * Handles union schemas (anyOf/oneOf) by merging into a single object schema.
 *
 * - Gemini doesn't allow top-level `type` together with `anyOf`
 * - OpenAI rejects function tool schemas without top-level `type: "object"`
 */
export function normalizeToolParameters<T extends { parameters?: unknown }>(tool: T): T {
  const schema = isRecord(tool.parameters) ? tool.parameters : undefined
  if (!schema) return tool

  // Standard object schema — just clean
  if ("type" in schema && "properties" in schema && !Array.isArray(schema.anyOf)) {
    return { ...tool, parameters: cleanSchemaForGemini(schema) }
  }

  // Missing type but has object-like fields — force type: "object"
  if (
    !("type" in schema) &&
    (isRecord(schema.properties) || Array.isArray(schema.required)) &&
    !Array.isArray(schema.anyOf) &&
    !Array.isArray(schema.oneOf)
  ) {
    return { ...tool, parameters: cleanSchemaForGemini({ ...schema, type: "object" }) }
  }

  // Union schema — merge variants into single object
  const variantKey = Array.isArray(schema.anyOf)
    ? "anyOf"
    : Array.isArray(schema.oneOf)
      ? "oneOf"
      : null
  if (!variantKey) return tool

  const variants = schema[variantKey] as unknown[]
  const mergedProperties: Record<string, unknown> = {}
  const requiredCounts = new Map<string, number>()
  let objectVariants = 0

  for (const entry of variants) {
    if (!isRecord(entry)) continue
    const props = isRecord(entry.properties) ? entry.properties : undefined
    if (!props) continue
    objectVariants++

    for (const [key, value] of Object.entries(props)) {
      if (!(key in mergedProperties)) {
        mergedProperties[key] = value
      } else {
        mergedProperties[key] = mergePropertySchemas(mergedProperties[key], value)
      }
    }

    const required = Array.isArray(entry.required) ? entry.required : []
    for (const key of required) {
      if (typeof key === "string") {
        requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1)
      }
    }
  }

  const baseRequired = Array.isArray(schema.required)
    ? schema.required.filter((k: unknown) => typeof k === "string")
    : undefined
  const mergedRequired =
    baseRequired && baseRequired.length > 0
      ? baseRequired
      : objectVariants > 0
        ? Array.from(requiredCounts.entries())
            .filter(([, count]) => count === objectVariants)
            .map(([key]) => key)
        : undefined

  return {
    ...tool,
    parameters: cleanSchemaForGemini({
      type: "object",
      ...(isRecord(schema.properties) ? {} : { properties: mergedProperties }),
      ...(Object.keys(mergedProperties).length > 0
        ? { properties: mergedProperties }
        : isRecord(schema.properties)
          ? { properties: schema.properties }
          : {}),
      ...(mergedRequired && mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    }),
  }
}

// ============================================================================
// Property Schema Merging
// ============================================================================

function extractEnumValues(schema: unknown): unknown[] | undefined {
  if (!isRecord(schema)) return undefined
  if (Array.isArray(schema.enum)) return schema.enum
  if ("const" in schema) return [schema.const]
  const variants = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : null
  if (variants) {
    const values = variants.flatMap((v) => extractEnumValues(v) ?? [])
    return values.length > 0 ? values : undefined
  }
  return undefined
}

function mergePropertySchemas(existing: unknown, incoming: unknown): unknown {
  if (!existing) return incoming
  if (!incoming) return existing

  const existingEnum = extractEnumValues(existing)
  const incomingEnum = extractEnumValues(incoming)
  if (existingEnum || incomingEnum) {
    const values = Array.from(new Set([...(existingEnum ?? []), ...(incomingEnum ?? [])]))
    const merged: Record<string, unknown> = {}
    for (const source of [existing, incoming]) {
      if (!isRecord(source)) continue
      for (const key of ["description"]) {
        if (!(key in merged) && key in source) merged[key] = source[key]
      }
    }
    const types = new Set(values.map((v) => typeof v))
    if (types.size === 1) merged.type = Array.from(types)[0]
    merged.enum = values
    return merged
  }

  return existing
}
