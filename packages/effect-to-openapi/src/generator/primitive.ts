import type { MapNullableType, NumberBounds, NumberCheck } from '../types/index.js'
import { numberValue, stringValue } from '../utils/index.js'

/**
 * `Schema.String` with the `minLength` / `maxLength` / `pattern` / `format` keywords collected
 * from its refinements.
 *
 * @example
 * stringSchema({ minLength: 1, format: 'uuid' }, mapNullableType)
 * // { type: 'string', minLength: 1, format: 'uuid' }
 */
export function stringSchema(
  checks: { readonly [keyword: string]: unknown },
  mapNullableType: MapNullableType,
) {
  return {
    ...mapNullableType('string'),
    minLength: numberValue(checks, 'minLength'),
    maxLength: numberValue(checks, 'maxLength'),
    format: stringValue(checks, 'format'),
    pattern: stringValue(checks, 'pattern'),
  }
}

function numberChecks(checks: { readonly [keyword: string]: unknown }): readonly NumberCheck[] {
  const minimum = numberValue(checks, 'minimum')
  const maximum = numberValue(checks, 'maximum')
  const exclusiveMinimum = numberValue(checks, 'exclusiveMinimum')
  const exclusiveMaximum = numberValue(checks, 'exclusiveMaximum')
  return [
    ...(minimum === undefined ? [] : [{ kind: 'min_value', value: minimum } as const]),
    ...(maximum === undefined ? [] : [{ kind: 'max_value', value: maximum } as const]),
    ...(exclusiveMinimum === undefined
      ? []
      : [{ kind: 'gt_value', value: exclusiveMinimum } as const]),
    ...(exclusiveMaximum === undefined
      ? []
      : [{ kind: 'lt_value', value: exclusiveMaximum } as const]),
  ]
}

/**
 * `Schema.Number` with `int` / bounds / `multipleOf` refinements. Effect's `int()` annotates
 * `type: 'integer'`, which is honoured here.
 *
 * @example
 * numberSchema({ type: 'integer', minimum: 1 }, mapNullableType, getNumberChecks)
 * // { type: 'integer', minimum: 1 }
 */
export function numberSchema(
  checks: { readonly [keyword: string]: unknown },
  mapNullableType: MapNullableType,
  getNumberChecks: (checks: readonly NumberCheck[]) => NumberBounds,
) {
  const multipleOf = numberValue(checks, 'multipleOf')
  return {
    ...mapNullableType(checks.type === 'integer' ? 'integer' : 'number'),
    ...getNumberChecks(numberChecks(checks)),
    ...(multipleOf === undefined ? {} : { multipleOf }),
  }
}

/**
 * `Schema.BigIntFromSelf` — represented as a decimal string, as JSON has no bigint.
 */
export function bigintSchema(mapNullableType: MapNullableType) {
  return {
    ...mapNullableType('string'),
    pattern: '^-?\\d+$',
  }
}
