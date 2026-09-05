import type { AST } from '../ast/index.js'
import { effectToOpenAPIError } from '../errors/index.js'
import type { MapNullableType } from '../types/index.js'
import { enumInfo } from '../utils/index.js'
import { bigintSchema } from './primitive.js'

/**
 * `Schema.Literal(value)` → single-value `enum`.
 *
 * @example
 * literalSchema(Schema.Literal('a').ast, mapNullableType) // { type: 'string', enum: ['a'] }
 */
export function literalSchema(ast: AST.Literal, mapNullableType: MapNullableType) {
  const value = ast.literal
  const type = typeof value
  if (type === 'boolean' || type === 'number' || type === 'string') {
    return { ...mapNullableType(type), enum: [value] }
  }
  return bigintSchema(mapNullableType)
}

/**
 * `Schema.Literals([...])` / `Schema.Enum(Enum)` → `enum`. Mixed string / number values
 * cannot be described by a single JSON Schema `type`, so they must be typed manually.
 *
 * @example
 * enumSchema(['a', 'b'], false, mapNullableType)
 * // { ok: true, value: { type: 'string', enum: ['a', 'b'] } }
 */
export function enumSchema(
  values: readonly unknown[],
  isNullable: boolean,
  mapNullableType: MapNullableType,
) {
  const info = enumInfo(values)
  if (info.type === 'mixed') {
    return {
      ok: false,
      error: effectToOpenAPIError(
        'Enum has mixed string and number values, please specify the OpenAPI type manually using `.annotate({ type })`',
      ),
    } as const
  }
  return {
    ok: true,
    value: {
      ...mapNullableType(info.type === 'numeric' ? 'integer' : 'string'),
      enum: isNullable ? [...info.values, null] : info.values,
    },
  } as const
}
