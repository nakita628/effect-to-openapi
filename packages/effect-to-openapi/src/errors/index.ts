/**
 * Errors are plain discriminated objects carried through `{ ok: true, value } | { ok: false,
 * error }` results, never thrown. `type` is the discriminant; `message` always contains the
 * next action.
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
