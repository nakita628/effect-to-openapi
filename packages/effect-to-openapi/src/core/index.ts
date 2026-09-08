import type { Schema } from 'effect'

import { astOf } from '../ast/index.js'
import { generateDocumentData } from '../helper/index.js'
import { getOpenApiMetadata } from '../metadata/index.js'
import { specificsFor } from '../specifics/index.js'
import type {
  ComponentTypeKey,
  ComponentTypeOf,
  Definition,
  GenerationContext,
  GeneratorOptions,
  OpenAPIDefinition,
  OpenAPIObject,
  OpenApiVersion,
  RouteConfig,
  VersionSpecifics,
} from '../types/index.js'
import { componentRef } from '../utils/index.js'

export type OpenAPIObjectConfig = Omit<OpenAPIObject, 'paths' | 'components' | 'webhooks'> & {
  readonly openapi: OpenApiVersion
}

function createContext(
  specifics: VersionSpecifics,
  options: GeneratorOptions | undefined,
): GenerationContext {
  return {
    specifics,
    options,
    schemaRefs: new Map(),
    paramRefs: new Map(),
    pathRefs: new Map(),
    webhookRefs: new Map(),
    rawComponents: [],
  }
}

function isWebhook(definition: Definition) {
  return 'type' in definition && definition.type === 'webhook'
}

/**
 * Generates a full OpenAPI document. The OpenAPI version is taken from `config.openapi`:
 * 3.0.x emits `nullable: true`, 3.1+ emits `type: [..., 'null']` and `webhooks`.
 *
 * @example
 * const registry = OpenAPIRegistry()
 * registry.register('User', Schema.Struct({ name: Schema.String }))
 * generateDocument(registry.definitions, { openapi: '3.1.0', info: { title: 'API', version: '1.0.0' } })
 */
export function generateDocument(
  definitions: readonly Definition[],
  config: OpenAPIObjectConfig,
  options?: GeneratorOptions,
) {
  const isV30 = config.openapi.startsWith('3.0')
  const ctx = createContext(specificsFor(config.openapi), options)
  const data = generateDocumentData(
    ctx,
    isV30 ? definitions.filter((definition) => !isWebhook(definition)) : definitions,
  )
  if (!data.ok) {
    return data
  }
  const { components, paths, webhooks } = data.value
  const document: OpenAPIObject = {
    ...config,
    components,
    paths,
    ...(isV30 ? {} : { webhooks }),
  }
  return { ok: true, value: document } as const
}

/**
 * Generates only `components` (schemas, parameters and raw components). Like
 * `generateDocument`, the OpenAPI version is taken from `config.openapi`.
 *
 * @example
 * generateComponents([UserSchema], { openapi: '3.1.0' })
 */
export function generateComponents(
  definitions: readonly Definition[],
  config: Pick<OpenAPIObjectConfig, 'openapi'>,
  options?: GeneratorOptions,
) {
  const ctx = createContext(specificsFor(config.openapi), options)
  const data = generateDocumentData(ctx, definitions)
  if (!data.ok) {
    return data
  }
  return { ok: true, value: { components: data.value.components } } as const
}

export type Registry = {
  /** Own definitions preceded by the definitions of every parent registry. */
  readonly definitions: readonly OpenAPIDefinition[]
  /** Registers a component schema under `/components/schemas/${refId}`. */
  readonly register: <S extends Schema.Top>(refId: string, schema: S) => S['Rebuild']
  /** Registers a parameter under `/components/parameters/${refId}`. */
  readonly registerParameter: <S extends Schema.Top>(refId: string, schema: S) => S['Rebuild']
  /** Registers a route generated under `paths`. */
  readonly registerPath: (route: RouteConfig) => void
  /** Registers a webhook generated under `webhooks` (OpenAPI 3.1+). */
  readonly registerWebhook: (webhook: RouteConfig) => void
  /** Registers a raw OpenAPI component object. */
  readonly registerComponent: <K extends ComponentTypeKey>(
    type: K,
    name: string,
    component: ComponentTypeOf<K>,
  ) => { readonly name: string; readonly ref: { readonly $ref: string } }
}

/**
 * Creates a registry that collects schemas, parameters, routes, webhooks and raw components.
 *
 * @example
 * const registry = OpenAPIRegistry()
 * const User = registry.register('User', Schema.Struct({ name: Schema.String }))
 * registry.registerPath({ method: 'get', path: '/users', responses: { 200: { description: 'OK', content: { 'application/json': { schema: Schema.Array(User) } } } } })
 */
export function OpenAPIRegistry(parents?: readonly Registry[]): Registry {
  const own: OpenAPIDefinition[] = []
  return {
    get definitions() {
      return [...(parents?.flatMap((parent) => parent.definitions) ?? []), ...own]
    },
    register: (refId, schema) => {
      const schemaWithRefId = schema.annotate({ identifier: refId })
      own.push({ type: 'schema', schema: schemaWithRefId })
      return schemaWithRefId
    },
    registerParameter: (refId, schema) => {
      const currentParam = getOpenApiMetadata(astOf(schema)).param
      const schemaWithMetadata = schema.annotate({
        identifier: refId,
        param: { ...currentParam, name: currentParam?.name ?? refId },
      })
      own.push({ type: 'parameter', schema: schemaWithMetadata })
      return schemaWithMetadata
    },
    registerPath: (route) => {
      own.push({ type: 'route', route })
    },
    registerWebhook: (webhook) => {
      own.push({ type: 'webhook', webhook })
    },
    registerComponent: (type, name, component) => {
      own.push({ type: 'component', componentType: type, name, component })
      return { name, ref: { $ref: componentRef(type, name) } }
    },
  }
}
