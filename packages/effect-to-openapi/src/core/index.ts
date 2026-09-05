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
  RouteConfig,
  VersionSpecifics,
} from '../types/index.js'
import { componentRef } from '../utils/index.js'

export type OpenAPIObjectConfig = Omit<OpenAPIObject, 'paths' | 'components' | 'webhooks'>
export type OpenAPIObjectConfigV30 = OpenAPIObjectConfig & {
  readonly openapi: '3.0.0' | '3.0.1' | '3.0.2' | '3.0.3' | '3.0.4'
}
export type OpenAPIObjectConfigV31 = OpenAPIObjectConfig & {
  readonly openapi: '3.1.0' | '3.1.1'
}
export type OpenAPIObjectConfigV32 = OpenAPIObjectConfig & {
  readonly openapi: '3.2.0'
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
 * const registry = createRegistry()
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
 * const registry = createRegistry()
 * const User = registry.register('User', Schema.Struct({ name: Schema.String }))
 * registry.registerPath({ method: 'get', path: '/users', responses: { 200: { description: 'OK', content: { 'application/json': { schema: Schema.Array(User) } } } } })
 */
export function createRegistry(parents?: readonly Registry[]): Registry {
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

/**
 * Class form of `createRegistry()`, mirroring zod-to-openapi's `OpenAPIRegistry`. Both forms
 * share the registry shape, so instances and `createRegistry()` results can be mixed as parents.
 */
export class OpenAPIRegistry implements Registry {
  private readonly registry: Registry

  constructor(parents?: readonly Registry[]) {
    this.registry = createRegistry(parents)
  }

  get definitions() {
    return this.registry.definitions
  }

  register<S extends Schema.Top>(refId: string, schema: S) {
    return this.registry.register(refId, schema)
  }

  registerParameter<S extends Schema.Top>(refId: string, schema: S) {
    return this.registry.registerParameter(refId, schema)
  }

  registerPath(route: RouteConfig) {
    this.registry.registerPath(route)
  }

  registerWebhook(webhook: RouteConfig) {
    this.registry.registerWebhook(webhook)
  }

  registerComponent<K extends ComponentTypeKey>(
    type: K,
    name: string,
    component: ComponentTypeOf<K>,
  ) {
    return this.registry.registerComponent(type, name, component)
  }
}

/**
 * Class forms of `generateDocument()` / `generateComponents()` pinned to one OpenAPI version,
 * mirroring zod-to-openapi's `OpenApiGeneratorV3` / `V31`. `OpenApiGeneratorV32` covers 3.2.
 */
export class OpenApiGeneratorV3 {
  constructor(
    private readonly definitions: readonly Definition[],
    private readonly options?: GeneratorOptions,
  ) {}

  generateDocument(config: OpenAPIObjectConfigV30) {
    return generateDocument(this.definitions, config, this.options)
  }

  generateComponents() {
    return generateComponents(this.definitions, { openapi: '3.0.0' }, this.options)
  }
}

export class OpenApiGeneratorV31 {
  constructor(
    private readonly definitions: readonly Definition[],
    private readonly options?: GeneratorOptions,
  ) {}

  generateDocument(config: OpenAPIObjectConfigV31) {
    return generateDocument(this.definitions, config, this.options)
  }

  generateComponents() {
    return generateComponents(this.definitions, { openapi: '3.1.0' }, this.options)
  }
}

export class OpenApiGeneratorV32 {
  constructor(
    private readonly definitions: readonly Definition[],
    private readonly options?: GeneratorOptions,
  ) {}

  generateDocument(config: OpenAPIObjectConfigV32) {
    return generateDocument(this.definitions, config, this.options)
  }

  generateComponents() {
    return generateComponents(this.definitions, { openapi: '3.2.0' }, this.options)
  }
}
