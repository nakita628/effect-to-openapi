import { SchemaAST } from 'effect'

import type { AST } from '../ast/index.js'
import type { MapNullableType, MapSubSchema, VersionSpecifics } from '../types/index.js'
import { numberValue } from '../utils/index.js'

/**
 * `Schema.Array(item)` (an `Arrays` node with no fixed elements and one rest element) with the
 * `minItems` / `maxItems` keywords from its checks.
 */
export function arraySchema(
  ast: AST.Arrays,
  checks: { readonly [keyword: string]: unknown },
  mapNullableType: MapNullableType,
  mapItem: MapSubSchema,
) {
  const [rest] = ast.rest
  const items = rest === undefined ? ({ ok: true, value: {} } as const) : mapItem(rest)
  if (!items.ok) {
    return items
  }
  return {
    ok: true,
    value: {
      ...mapNullableType('array'),
      items: items.value,
      minItems: numberValue(checks, 'minItems'),
      maxItems: numberValue(checks, 'maxItems'),
    },
  } as const
}

/**
 * `Schema.Tuple([...])` / `Schema.NonEmptyArray(item)` — the per-version layout (`items` +
 * `minItems` / `maxItems` for 3.0, `prefixItems` for 3.1+) comes from the specifics. Optional
 * elements lower `minItems`.
 */
export function tupleSchema(
  ast: AST.Arrays,
  mapNullableType: MapNullableType,
  mapItem: MapSubSchema,
  mapTupleItems: VersionSpecifics['mapTupleItems'],
) {
  const [rest] = ast.rest
  const elements = ast.elements.map((element) => mapItem(element))
  const failed = elements.find((element) => !element.ok)
  if (failed !== undefined && !failed.ok) {
    return failed
  }
  const restSchema = rest === undefined ? undefined : mapItem(rest)
  if (restSchema !== undefined && !restSchema.ok) {
    return restSchema
  }
  const required = ast.elements.filter((element) => !SchemaAST.isOptional(element)).length
  return {
    ok: true,
    value: {
      ...mapNullableType('array'),
      ...mapTupleItems(
        elements.flatMap((element) => (element.ok ? [element.value] : [])),
        restSchema?.value,
        required,
      ),
    },
  } as const
}
