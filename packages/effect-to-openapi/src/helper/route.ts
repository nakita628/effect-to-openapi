import { SchemaAST } from 'effect'

import { astOf, isSchema, stringProperties, unwrapChained } from '../ast/index.js'
import { enhanceMissingParametersError } from '../errors/index.js'
import type {
  AnySchema,
  ContentConfig,
  GenerationContext,
  MediaTypeConfig,
  ReferenceObject,
  RequestBodyConfig,
  ResponseConfig,
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
  const headerResults = headerSchemas.map((header) =>
    generateInlineParameters(ctx, astOf(header), 'header'),
  )
  const failedHeader = headerResults.find((result) => !result.ok)
  if (failedHeader !== undefined && !failedHeader.ok) {
    return {
      ok: false,
      error: enhanceMissingParametersError(failedHeader.error, { location: 'header' }),
    } as const
  }
  const headerParameters = headerResults.flatMap((result) => (result.ok ? result.value : []))

  return {
    ok: true,
    value: [
      ...pathParameters.value,
      ...queryParameters.value,
      ...headerParameters,
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
  const entries = Object.entries(content).flatMap(([mediaType, config]) =>
    config === undefined ? [] : [{ mediaType, media: getMediaType(ctx, config) }],
  )
  const failed = entries.find(({ media }) => !media.ok)
  if (failed !== undefined && !failed.media.ok) {
    return failed.media
  }
  return {
    ok: true,
    value: Object.fromEntries(
      entries.flatMap(({ mediaType, media }) => (media.ok ? [[mediaType, media.value]] : [])),
    ),
  } as const
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
  const entries = stringProperties(base).map(({ name, property }) => ({
    name,
    parameter: generateSimpleParameter(ctx, property.type),
  }))
  const failed = entries.find(({ parameter }) => !parameter.ok)
  if (failed !== undefined && !failed.parameter.ok) {
    return failed.parameter
  }
  return {
    ok: true,
    value: Object.fromEntries(
      entries.flatMap(({ name, parameter }) => (parameter.ok ? [[name, parameter.value]] : [])),
    ),
  } as const
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
  const responseEntries = Object.entries(responses).map(([statusCode, response]) => ({
    statusCode,
    response: getResponse(ctx, response),
  }))
  const failedResponse = responseEntries.find(({ response }) => !response.ok)
  if (failedResponse !== undefined && !failedResponse.response.ok) {
    return failedResponse.response
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
        responses: Object.fromEntries(
          responseEntries.flatMap(({ statusCode, response }) =>
            response.ok ? [[statusCode, response.value]] : [],
          ),
        ),
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
