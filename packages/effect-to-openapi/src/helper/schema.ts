import type { AST } from '../ast/index.js'
import { isNullableAst, unwrapChained } from '../ast/index.js'
import type { EffectToOpenAPIError } from '../errors/index.js'
import { transformSchema } from '../generator/index.js'
import { mapRecursive } from '../generator/lazy.js'
import {
  applySchemaMetadata,
  buildSchemaMetadata,
  getDefaultValue,
  getOpenApiMetadata,
  getRefId,
} from '../metadata/index.js'
import type { GenerationContext, ReferenceObject, SchemaObject } from '../types/index.js'
import { isEqual, omitBy, schemaRef } from '../utils/index.js'

function toOpenAPISchema(
  ctx: GenerationContext,
  ast: AST.AST,
  base: AST.AST,
  isNullable: boolean,
  defaultValue: unknown,
) {
  return transformSchema(ast, base, isNullable, defaultValue, {
    specifics: ctx.specifics,
    options: ctx.options,
    mapItem: (item) => generateSchemaWithRef(ctx, item),
    generateSchemaRef: schemaRef,
  })
}

function generateSchemaWithMetadata(ctx: GenerationContext, ast: AST.AST) {
  const innerSchema = unwrapChained(ast)
  const metadata = getOpenApiMetadata(ast)
  const defaultValue = getDefaultValue(ast)
  const refId = getRefId(ast)
  const existing = refId === undefined ? undefined : ctx.schemaRefs.get(refId)

  if (typeof existing === 'object') {
    return { ok: true, value: existing } as const
  }

  // A pending generation with this name means the schema is recursive: reference it directly.
  if (existing === 'pending' && refId !== undefined) {
    return {
      ok: true,
      value: ctx.specifics.mapNullableOfRef({ $ref: schemaRef(refId) }, isNullableAst(ast)),
    } as const
  }

  // Mark the ref as pending so recursive definitions can reference it. It is replaced by the
  // generated schema within `generateSchemaWithRef`.
  if (refId !== undefined && existing === undefined) {
    ctx.schemaRefs.set(refId, 'pending')
  }

  const result = metadata.type
    ? ({ ok: true, value: { type: metadata.type } } as const)
    : toOpenAPISchema(ctx, ast, innerSchema, isNullableAst(ast), defaultValue)

  if (!result.ok) {
    return result
  }
  return { ok: true, value: applySchemaMetadata(result.value, metadata) } as const
}

/**
 * Same as `generateSchemaWithMetadata` but applies nullability to an already referenced schema.
 */
function constructReferencedOpenAPISchema(ctx: GenerationContext, ast: AST.AST) {
  const metadata = getOpenApiMetadata(ast)
  const innerSchema = unwrapChained(ast)
  const defaultValue = getDefaultValue(ast)
  const isNullable = isNullableAst(ast)

  if (metadata.type) {
    return { ok: true, value: ctx.specifics.mapNullableType(metadata.type, isNullable) } as const
  }

  const refId = getRefId(ast)
  const existing = refId === undefined ? undefined : ctx.schemaRefs.get(refId)

  if (typeof existing === 'object') {
    return {
      ok: true,
      value: {
        ...mapRecursive(
          existing,
          (type) => ctx.specifics.mapNullableType(type, isNullable),
          (ref) => ctx.specifics.mapNullableOfRef(ref, isNullable),
        ),
        ...(defaultValue === undefined ? {} : { default: defaultValue }),
      },
    } as const
  }

  if (existing === 'pending' && refId !== undefined) {
    return {
      ok: true,
      value: ctx.specifics.mapNullableOfRef({ $ref: schemaRef(refId) }, isNullable),
    } as const
  }

  if (refId !== undefined && existing === undefined) {
    ctx.schemaRefs.set(refId, 'pending')
  }

  return toOpenAPISchema(ctx, ast, innerSchema, isNullable, defaultValue)
}

/**
 * Generates an OpenAPI SchemaObject or a ReferenceObject with all the provided metadata applied.
 */
function generateSimpleSchema(ctx: GenerationContext, ast: AST.AST) {
  const metadata = getOpenApiMetadata(ast)
  const refId = getRefId(ast)
  const existing = refId === undefined ? undefined : ctx.schemaRefs.get(refId)

  if (refId === undefined || existing === undefined) {
    return generateSchemaWithMetadata(ctx, ast)
  }

  const referenceObject: ReferenceObject = { $ref: schemaRef(refId) }

  // We are currently calculating this schema or there is nothing
  if (existing === 'pending') {
    return {
      ok: true,
      value: ctx.specifics.mapNullableOfRef(referenceObject, isNullableAst(ast)),
    } as const
  }

  const differsFromRegistered = (value: unknown, key: string) =>
    value === undefined || isEqual(value, Reflect.get(existing, key))

  // Metadata provided through `.annotate()` that is new to what we had already registered
  const newMetadata = omitBy(buildSchemaMetadata(metadata), differsFromRegistered)

  // Do not calculate schema metadata overrides if type is provided in `.annotate()`
  if (newMetadata.type) {
    return { ok: true, value: { allOf: [referenceObject, newMetadata] } } as const
  }

  // New metadata from the schema's own properties (nullable, default, ...)
  const referenced = constructReferencedOpenAPISchema(ctx, ast)
  if (!referenced.ok) {
    return referenced
  }
  const newSchemaMetadata = omitBy(referenced.value, differsFromRegistered)

  const appliedMetadata = applySchemaMetadata(newSchemaMetadata, newMetadata)

  return {
    ok: true,
    value:
      Object.keys(appliedMetadata).length > 0
        ? { allOf: [referenceObject, appliedMetadata] }
        : referenceObject,
  } as const
}

/**
 * Generates the schema and, when it carries a `refId`, registers it under
 * `components.schemas` and returns a `$ref` instead of the inline schema.
 */
// The return type breaks the inference cycle of the mutual recursion through `mapItem`.
export function generateSchemaWithRef(
  ctx: GenerationContext,
  ast: AST.AST,
):
  | { readonly ok: true; readonly value: SchemaObject | ReferenceObject }
  | { readonly ok: false; readonly error: EffectToOpenAPIError } {
  const refId = getRefId(ast)
  if (refId !== undefined && !ctx.schemaRefs.has(refId)) {
    const result = generateSimpleSchema(ctx, ast)
    if (!result.ok) {
      return result
    }
    ctx.schemaRefs.set(refId, result.value)
    return { ok: true, value: { $ref: schemaRef(refId) } } as const
  }
  return generateSimpleSchema(ctx, ast)
}

/**
 * Registered schemas, excluding any still marked as pending.
 */
export function filteredSchemaRefs(ctx: GenerationContext) {
  return Object.fromEntries(
    [...ctx.schemaRefs.entries()].flatMap(([refId, value]) =>
      value === 'pending' ? [] : [[refId, value] as const],
    ),
  )
}
