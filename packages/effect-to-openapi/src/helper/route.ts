import { SchemaAST } from 'effect'

import { astOf, isSchema, stringProperties, unwrapChained } from '../ast/index.js'
import { collect, collectEntries, enhanceMissingParametersError } from '../errors/index.js'
import type {
  AnySchema,
  ContentConfig,
  GenerationContext,
  MediaTypeConfig,
  MediaTypeObject,
  ParameterObject,
  ReferenceObject,
  RequestBodyConfig,
  ResponseConfig,
  ResponseObject,
  RouteConfig,
} from '../types/index.js'
import { isReferenceObject } from '../utils/index.js'
import { generateInlineParameters, generateSimpleParameter } from './parameter.js'
import { generateSchemaWithRef } from './schema.js'

function getParameters(ctx: GenerationContext, request: RouteConfig['request'] | undefined) {
  if (!request) {
    return { ok: true, value: [] } as const
  }
  const { headers, query, params, cookies } = request

  const queryParameters = query
    ? generateInlineParameters(ctx, astOf(query), 'query')
    : ({ ok: true, value: [] } as const)
  if (!queryParameters.ok) {
    return {
      ok: false,
      error: enhanceMissingParametersError(queryParameters.error, { location: 'query' }),
    } as const
  }
  const pathParameters = params
    ? generateInlineParameters(ctx, astOf(params), 'path')
    : ({ ok: true, value: [] } as const)
  if (!pathParameters.ok) {
    return {
      ok: false,
      error: enhanceMissingParametersError(pathParameters.error, { location: 'path' }),
    } as const
  }
  const cookieParameters = cookies
    ? generateInlineParameters(ctx, astOf(cookies), 'cookie')
    : ({ ok: true, value: [] } as const)
  if (!cookieParameters.ok) {
    return {
      ok: false,
      error: enhanceMissingParametersError(cookieParameters.error, { location: 'cookie' }),
    } as const
  }
  const headerSchemas = headers === undefined ? [] : isSchema(headers) ? [headers] : headers
  const headerResults = collect<readonly (ParameterObject | ReferenceObject)[]>(
    headerSchemas.map((header) => generateInlineParameters(ctx, astOf(header), 'header')),
  )
  if (!headerResults.ok) {
    return {
      ok: false,
      error: enhanceMissingParametersError(headerResults.error, { location: 'header' }),
    } as const
  }

  return {
    ok: true,
    value: [
      ...pathParameters.value,
      ...queryParameters.value,
      ...headerResults.value.flat(),
      ...cookieParameters.value,
    ],
  } as const
}

function getMediaType(ctx: GenerationContext, config: MediaTypeConfig | ReferenceObject) {
  if (isReferenceObject(config)) {
    return { ok: true, value: config } as const
  }
  const { schema: configSchema, itemSchema: configItemSchema, ...rest } = config
  // Both `schema` and the 3.2 `itemSchema` accept either an Effect schema (converted and
  // registered so it `$ref`s) or a raw SchemaObject / ReferenceObject (passed through).
  const schema = isSchema(configSchema)
    ? generateSchemaWithRef(ctx, astOf(configSchema))
    : ({ ok: true, value: configSchema } as const)
  if (!schema.ok) {
    return schema
  }
  const itemSchema = isSchema(configItemSchema)
    ? generateSchemaWithRef(ctx, astOf(configItemSchema))
    : ({ ok: true, value: configItemSchema } as const)
  if (!itemSchema.ok) {
    return itemSchema
  }
  return {
    ok: true,
    value: {
      ...rest,
      ...(schema.value === undefined ? {} : { schema: schema.value }),
      ...(itemSchema.value === undefined ? {} : { itemSchema: itemSchema.value }),
    },
  } as const
}

function getBodyContent(ctx: GenerationContext, content: ContentConfig) {
  return collectEntries<MediaTypeObject | ReferenceObject>(
    Object.entries(content).flatMap(([mediaType, config]) =>
      config === undefined ? [] : [[mediaType, getMediaType(ctx, config)] as const],
    ),
  )
}

function getRequestBody(ctx: GenerationContext, requestBody: RequestBodyConfig | undefined) {
  if (!requestBody) {
    return { ok: true, value: undefined } as const
  }
  const { content, ...rest } = requestBody
  const bodyContent = getBodyContent(ctx, content)
  if (!bodyContent.ok) {
    return bodyContent
  }
  return { ok: true, value: { ...rest, content: bodyContent.value } } as const
}

function getResponseHeaders(ctx: GenerationContext, headers: AnySchema) {
  const base = unwrapChained(astOf(headers))
  if (!SchemaAST.isObjects(base)) {
    return { ok: true, value: {} } as const
  }
  return collectEntries(
    stringProperties(base).map(
      ({ name, property }) => [name, generateSimpleParameter(ctx, property.type)] as const,
    ),
  )
}

function getResponse(ctx: GenerationContext, response: ResponseConfig | ReferenceObject) {
  if (isReferenceObject(response)) {
    return { ok: true, value: response } as const
  }
  const { content, headers, ...rest } = response
  const responseContent = content
    ? getBodyContent(ctx, content)
    : ({ ok: true, value: undefined } as const)
  if (!responseContent.ok) {
    return responseContent
  }
  const withContent = responseContent.value === undefined ? {} : { content: responseContent.value }
  if (!headers) {
    return { ok: true, value: { ...rest, ...withContent } } as const
  }
  const responseHeaders = isSchema(headers)
    ? getResponseHeaders(ctx, headers)
    : ({ ok: true, value: headers } as const)
  if (!responseHeaders.ok) {
    return responseHeaders
  }
  return { ok: true, value: { ...rest, headers: responseHeaders.value, ...withContent } } as const
}

/**
 * Generates the PathItemObject fragment (`{ [method]: operation }`) for one route.
 */
export function generatePath(ctx: GenerationContext, route: RouteConfig) {
  const { method, path, request, responses, ...pathItemConfig } = route
  const responseEntries = collectEntries<ResponseObject | ReferenceObject>(
    Object.entries(responses).map(
      ([statusCode, response]) => [statusCode, getResponse(ctx, response)] as const,
    ),
  )
  if (!responseEntries.ok) {
    return responseEntries
  }
  const parameters = getParameters(ctx, request)
  if (!parameters.ok) {
    return {
      ok: false,
      error: enhanceMissingParametersError(parameters.error, { route: `${method} ${path}` }),
    } as const
  }
  const requestBody = getRequestBody(ctx, request?.body)
  if (!requestBody.ok) {
    return requestBody
  }
  return {
    ok: true,
    value: {
      [method]: {
        ...pathItemConfig,
        ...(parameters.value.length > 0
          ? { parameters: [...(pathItemConfig.parameters ?? []), ...parameters.value] }
          : {}),
        ...(requestBody.value ? { requestBody: requestBody.value } : {}),
        responses: responseEntries.value,
      },
    },
  } as const
}

/**
 * Generates a route and merges it into the `paths` (or `webhooks`) map of the context.
 */
export function generateSingleRoute(
  ctx: GenerationContext,
  route: RouteConfig,
  target: 'paths' | 'webhooks',
) {
  const refs = target === 'paths' ? ctx.pathRefs : ctx.webhookRefs
  const routeDoc = generatePath(ctx, route)
  if (!routeDoc.ok) {
    return routeDoc
  }
  refs.set(route.path, { ...refs.get(route.path), ...routeDoc.value })
  return routeDoc
}
