import { SchemaAST } from 'effect'

import { templateLiteralPattern } from '../ast/index.js'
import { unknownSchemaTypeError } from '../errors/index.js'
import type {
  GeneratorOptions,
  MapSubSchema,
  ReferenceObject,
  SchemaInfo,
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
 * Converts a schema to an OpenAPI SchemaObject from the facts `info` resolved for it.
 */
export function transformSchema(info: SchemaInfo, ctx: TransformContext) {
  const { base, isNullable, defaultValue } = info
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
  const result = transformWithoutDefault(info, ctx)
  if (!result.ok) {
    return result
  }
  return { ok: true, value: { ...result.value, default: defaultValue } } as const
}

function transformWithoutDefault(info: SchemaInfo, ctx: TransformContext) {
  const { base, keywords, isNullable, refId } = info
  const { specifics, options, mapItem, generateSchemaRef } = ctx
  const mapNullableType = (type: Parameters<VersionSpecifics['mapNullableType']>[0]) =>
    specifics.mapNullableType(type, isNullable)
  const mapNullableOfArray = (objects: (SchemaObject | ReferenceObject)[]) =>
    specifics.mapNullableOfArray(objects, isNullable)
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
    error: unknownSchemaTypeError({ currentSchema: base, schemaName: refId }),
  } as const
}
