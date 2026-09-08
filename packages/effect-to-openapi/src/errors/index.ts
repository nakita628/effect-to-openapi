/**
 * Errors are plain discriminated objects carried through `{ ok: true, value } | { ok: false,
 * error }` results, never thrown. `type` is the discriminant; `message` always contains the
 * next action. The two result helpers live here as well: they are the only things that need to
 * name the error type, and this module is a leaf. The `Result` alias that types them stays
 * module-local — it is plumbing, not API.
 */
export type EffectToOpenAPIError =
  | { readonly type: 'EffectToOpenAPIError'; readonly message: string }
  | {
      readonly type: 'ConflictError'
      readonly message: string
      readonly data: { readonly key: string; readonly values: readonly unknown[] }
    }
  | {
      readonly type: 'MissingParameterDataError'
      readonly message: string
      readonly data: {
        readonly paramName?: string
        readonly route?: string
        readonly location?: string
        readonly missingField: string
      }
    }
  | {
      readonly type: 'UnknownSchemaTypeError'
      readonly message: string
      readonly data: { readonly schemaName?: string; readonly currentSchema: unknown }
    }

export function effectToOpenAPIError(message: string): EffectToOpenAPIError {
  return { type: 'EffectToOpenAPIError', message } as const
}

export function conflictError(
  message: string,
  data: { readonly key: string; readonly values: readonly unknown[] },
): EffectToOpenAPIError {
  return { type: 'ConflictError', message, data } as const
}

export function missingParameterDataError(data: {
  readonly paramName?: string
  readonly route?: string
  readonly location?: string
  readonly missingField: string
}): EffectToOpenAPIError {
  return {
    type: 'MissingParameterDataError',
    message: `Missing parameter data, please specify \`${data.missingField}\` and other OpenAPI parameter props using the \`param\` key of \`.annotate()\``,
    data,
  } as const
}

export function unknownSchemaTypeError(data: {
  readonly schemaName?: string
  readonly currentSchema: unknown
}): EffectToOpenAPIError {
  return {
    type: 'UnknownSchemaTypeError',
    message: `Unknown Effect schema node${
      typeof data.currentSchema === 'object' &&
      data.currentSchema !== null &&
      '_tag' in data.currentSchema &&
      typeof data.currentSchema._tag === 'string'
        ? ` \`${data.currentSchema._tag}\``
        : ''
    }, please specify \`type\` and other OpenAPI props using \`.annotate()\`.`,
    data,
  } as const
}

/**
 * Merges extra context (route / location) into a `MissingParameterDataError`; other errors are
 * returned unchanged.
 */
export function enhanceMissingParametersError(
  error: EffectToOpenAPIError,
  paramsToAdd: {
    readonly paramName?: string
    readonly route?: string
    readonly location?: string
    readonly missingField?: string
  },
): EffectToOpenAPIError {
  return error.type === 'MissingParameterDataError'
    ? missingParameterDataError({ ...error.data, ...paramsToAdd })
    : error
}

/**
 * A generated value or the error that stopped its generation. Every generator returns one, so
 * a failure travels up as a value instead of being thrown.
 */
type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EffectToOpenAPIError }
/**
 * Collects results into an array, short-circuiting on the first failure.
 *
 * @example
 * collect([{ ok: true, value: 1 }, { ok: true, value: 2 }]) // { ok: true, value: [1, 2] }
 */
export function collect<T>(results: readonly Result<T>[]): Result<readonly T[]> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) {
      return result
    }
    values.push(result.value)
  }
  return { ok: true, value: values } as const
}

/**
 * Collects keyed results into a record, short-circuiting on the first failure.
 *
 * @example
 * collectEntries([['a', { ok: true, value: 1 }]]) // { ok: true, value: { a: 1 } }
 */
export function collectEntries<T>(
  entries: readonly (readonly [string, Result<T>])[],
): Result<{ readonly [key: string]: T }> {
  const record: { [key: string]: T } = {}
  for (const [key, result] of entries) {
    if (!result.ok) {
      return result
    }
    record[key] = result.value
  }
  return { ok: true, value: record } as const
}
