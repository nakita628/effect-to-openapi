import { SchemaAST } from 'effect'

import type { AST } from '../ast/index.js'
import { checks, templateLiteralPattern } from '../ast/index.js'
import { unknownSchemaTypeError } from '../errors/index.js'
import { getRefId } from '../metadata/index.js'
import type {
  GeneratorOptions,
  MapSubSchema,
  ReferenceObject,
  SchemaObject,
  VersionSpecifics,
} from '../types/index.js'
import { enumSchema, literalSchema } from './literal.js'
import { objectSchema } from './object.js'
import { bigintSchema, numberSchema, stringSchema } from './primitive.js'
import { arraySchema, tupleSchema } from './tuple.js'
import { unionSchema } from './union.js'

export type TransformContext = {
  readonly specifics: VersionSpecifics
  readonly options: GeneratorOptions | undefined
  readonly mapItem: MapSubSchema
  readonly generateSchemaRef: (refId: string) => string
}

/**
 * Converts a schema to an OpenAPI SchemaObject. `ast` is the original node (its chain provides
 * the JSON Schema keywords), `base` the node the generator dispatches on (the result of
 * `unwrapChained`). Nullability and the default value are computed by the caller.
 */
export function transformSchema(
  ast: AST.AST,
  base: AST.AST,
  isNullable: boolean,
  defaultValue: unknown,
  ctx: TransformContext,
) {
  const { specifics, mapItem } = ctx
  if (SchemaAST.isNull(base)) {
    return { ok: true, value: specifics.nullType } as const
  }
  if (SchemaAST.isUnknown(base) || SchemaAST.isAny(base)) {
    return { ok: true, value: specifics.mapNullableType(undefined, isNullable) } as const
  }
  if (SchemaAST.isObjects(base)) {
    return objectSchema(
      base,
      defaultValue,
      (type) => specifics.mapNullableType(type, isNullable),
      mapItem,
    )
  }
  const result = transformWithoutDefault(ast, base, isNullable, ctx)
  if (!result.ok) {
    return result
  }
  return { ok: true, value: { ...result.value, default: defaultValue } } as const
}

function transformWithoutDefault(
  ast: AST.AST,
  base: AST.AST,
  isNullable: boolean,
  ctx: TransformContext,
) {
  const { specifics, options, mapItem, generateSchemaRef } = ctx
  const mapNullableType = (type: Parameters<VersionSpecifics['mapNullableType']>[0]) =>
    specifics.mapNullableType(type, isNullable)
  const mapNullableOfArray = (objects: (SchemaObject | ReferenceObject)[]) =>
    specifics.mapNullableOfArray(objects, isNullable)
  const keywords = checks(ast)

  if (SchemaAST.isString(base)) {
    return { ok: true, value: stringSchema(keywords, mapNullableType) } as const
  }
  if (SchemaAST.isNumber(base)) {
    return {
      ok: true,
      value: numberSchema(keywords, mapNullableType, specifics.getNumberChecks),
    } as const
  }
  if (SchemaAST.isBigInt(base)) {
    return { ok: true, value: bigintSchema(mapNullableType) } as const
  }
  if (SchemaAST.isBoolean(base)) {
    return { ok: true, value: mapNullableType('boolean') } as const
  }
  if (SchemaAST.isObjectKeyword(base)) {
    return { ok: true, value: mapNullableType('object') } as const
  }
  if (SchemaAST.isLiteral(base)) {
    return { ok: true, value: literalSchema(base, mapNullableType) } as const
  }
  if (SchemaAST.isEnum(base)) {
    return enumSchema(
      base.enums.map(([, value]) => value),
      isNullable,
      mapNullableType,
    )
  }
  if (SchemaAST.isTemplateLiteral(base)) {
    return {
      ok: true,
      value: { ...mapNullableType('string'), pattern: templateLiteralPattern(base) },
    } as const
  }
  if (SchemaAST.isArrays(base)) {
    return base.elements.length === 0 && base.rest.length === 1
      ? arraySchema(base, keywords, mapNullableType, mapItem)
      : tupleSchema(base, mapNullableType, mapItem, specifics.mapTupleItems)
  }
  if (SchemaAST.isUnion(base)) {
    return unionSchema(
      base,
      isNullable,
      mapNullableType,
      mapNullableOfArray,
      mapItem,
      generateSchemaRef,
      options?.unionPreferredType,
    )
  }
  return {
    ok: false,
    error: unknownSchemaTypeError({ currentSchema: base, schemaName: getRefId(ast) }),
  } as const
}
