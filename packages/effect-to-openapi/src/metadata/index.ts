import type { Schema } from 'effect'

import type { AST as Ast } from '../ast/index.js'
import { annotationsOf, chain, identifierOf } from '../ast/index.js'
import type {
  DiscriminatorObject,
  FullMetadata,
  InternalMetadata,
  OpenAPIMetadata,
  ParameterMetadata,
  ReferenceObject,
  SchemaObject,
  SchemaObjectType,
  UnionPreferredType,
} from '../types/index.js'
import { isUndefined, omitBy } from '../utils/index.js'

// Effect's documented idiom for custom annotations: extending the `Annotations` interface, so
// OpenAPI metadata passed to `.annotate({ ... })` is type-checked. Keys Effect already declares
// (`title`, `description`, `format`, `default`, `examples`, ...) are not redeclared.
/* oxlint-disable no-shadow -- the names must match Effect's declaration to merge */
declare module 'effect/Schema' {
  namespace Annotations {
    // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging into Effect's interface only works with `interface`
    interface Annotations {
      readonly type?: SchemaObjectType | readonly SchemaObjectType[] | undefined
      readonly deprecated?: boolean | undefined
      readonly nullable?: boolean | undefined
      readonly minimum?: number | undefined
      readonly maximum?: number | undefined
      readonly exclusiveMinimum?: number | undefined
      readonly exclusiveMaximum?: number | undefined
      readonly multipleOf?: number | undefined
      readonly minLength?: number | undefined
      readonly maxLength?: number | undefined
      readonly pattern?: string | undefined
      readonly minItems?: number | undefined
      readonly maxItems?: number | undefined
      readonly uniqueItems?: boolean | undefined
      readonly minProperties?: number | undefined
      readonly maxProperties?: number | undefined
      readonly required?: readonly string[] | undefined
      readonly enum?: readonly unknown[] | undefined
      readonly const?: unknown
      readonly items?: SchemaObject | ReferenceObject | undefined
      readonly prefixItems?: readonly (SchemaObject | ReferenceObject)[] | undefined
      readonly properties?:
        | { readonly [propertyName: string]: SchemaObject | ReferenceObject }
        | undefined
      readonly additionalProperties?: SchemaObject | ReferenceObject | boolean | undefined
      readonly allOf?: readonly (SchemaObject | ReferenceObject)[] | undefined
      readonly oneOf?: readonly (SchemaObject | ReferenceObject)[] | undefined
      readonly anyOf?: readonly (SchemaObject | ReferenceObject)[] | undefined
      readonly not?: SchemaObject | ReferenceObject | undefined
      readonly discriminator?: DiscriminatorObject | undefined
      readonly xml?: SchemaObject['xml'] | undefined
      readonly externalDocs?: SchemaObject['externalDocs'] | undefined
      readonly example?: unknown
      readonly param?: (ParameterMetadata & { readonly example?: unknown }) | undefined
      readonly unionPreferredType?: UnionPreferredType | undefined
    }
  }
}
/* oxlint-enable no-shadow */

function isExtensionKey(key: string): key is `x-${string}` {
  return key.startsWith('x-')
}

function extensionEntries(annotations: Schema.Annotations.Annotations): {
  readonly [extension: `x-${string}`]: unknown
} {
  return Object.fromEntries(
    Object.entries(annotations).flatMap(([key, value]) =>
      isExtensionKey(key) ? [[key, value] as const] : [],
    ),
  )
}

function stringAnnotation(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function booleanAnnotation(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * The OpenAPI metadata declared through annotations. Effect's own machinery keys (`expected`,
 * `toCodecJson`, `arbitrary`, ...) are ignored; `x-*` extensions are copied through.
 */
function pickMetadata(annotations: Schema.Annotations.Annotations): FullMetadata {
  const examples = annotations.examples
  return omitBy(
    {
      type: annotations.type,
      format: stringAnnotation(annotations.format),
      title: stringAnnotation(annotations.title),
      description: stringAnnotation(annotations.description),
      deprecated: annotations.deprecated,
      nullable: annotations.nullable,
      readOnly: booleanAnnotation(annotations.readOnly),
      writeOnly: booleanAnnotation(annotations.writeOnly),
      minimum: annotations.minimum,
      maximum: annotations.maximum,
      exclusiveMinimum: annotations.exclusiveMinimum,
      exclusiveMaximum: annotations.exclusiveMaximum,
      multipleOf: annotations.multipleOf,
      minLength: annotations.minLength,
      maxLength: annotations.maxLength,
      pattern: annotations.pattern,
      minItems: annotations.minItems,
      maxItems: annotations.maxItems,
      uniqueItems: annotations.uniqueItems,
      minProperties: annotations.minProperties,
      maxProperties: annotations.maxProperties,
      required: annotations.required,
      enum: annotations.enum,
      const: annotations.const,
      items: annotations.items,
      prefixItems: annotations.prefixItems,
      properties: annotations.properties,
      additionalProperties: annotations.additionalProperties,
      allOf: annotations.allOf,
      oneOf: annotations.oneOf,
      anyOf: annotations.anyOf,
      not: annotations.not,
      discriminator: annotations.discriminator,
      xml: annotations.xml,
      externalDocs: annotations.externalDocs,
      contentMediaType: stringAnnotation(annotations.contentMediaType),
      contentEncoding: stringAnnotation(annotations.contentEncoding),
      example: annotations.example,
      examples: Array.isArray(examples) ? examples : undefined,
      default: annotations.default,
      param: annotations.param,
      ...extensionEntries(annotations),
    },
    isUndefined,
  )
}

export type CollectedMetadata = {
  readonly metadata: FullMetadata
  readonly internal: InternalMetadata
}

const EMPTY: CollectedMetadata = { metadata: {}, internal: {} }

function mergeCollected(base: CollectedMetadata, override: CollectedMetadata): CollectedMetadata {
  const param = { ...base.metadata.param, ...override.metadata.param }
  return {
    metadata: {
      ...base.metadata,
      ...override.metadata,
      ...(Object.keys(param).length > 0 ? { param } : {}),
    },
    internal: { ...base.internal, ...override.internal },
  }
}

/**
 * Metadata declared on one AST node: Effect's standard annotations (`title` / `description` /
 * `examples` / `default`) plus the OpenAPI keys attached through `.annotate({ ... })`. The
 * `identifier` annotation becomes the component `refId`.
 */
function ownMetadata(ast: Ast.AST): CollectedMetadata {
  const annotations = annotationsOf(ast)
  const refId = identifierOf(ast)
  const unionPreferredType = annotations.unionPreferredType
  return {
    metadata: pickMetadata(annotations),
    internal: {
      ...(unionPreferredType === undefined ? {} : { unionPreferredType }),
      ...(refId === undefined ? {} : { refId }),
    },
  }
}

/**
 * Collects the OpenAPI metadata of a schema, walking the chain of encodings, suspensions and
 * `null` / `undefined` wrapper unions. Outer nodes override inner ones.
 */
export function collectMetadata(ast: Ast.AST): CollectedMetadata {
  return chain(ast)
    .toReversed()
    .reduce((acc, node) => mergeCollected(acc, ownMetadata(node)), EMPTY)
}

/**
 * The OpenAPI metadata of a schema with `undefined` values dropped.
 */
export function getOpenApiMetadata(ast: Ast.AST): FullMetadata {
  return omitBy(collectMetadata(ast).metadata, isUndefined)
}

/**
 * The library-internal metadata (`refId`, `unionPreferredType`).
 */
export function getInternalMetadata(ast: Ast.AST): InternalMetadata {
  return collectMetadata(ast).internal
}

/**
 * The component name the schema was registered under (its `identifier` annotation), if any.
 */
export function getRefId(ast: Ast.AST) {
  return getInternalMetadata(ast).refId
}

/**
 * Metadata for parameter generation: a `description` from the schema is taken with lower
 * precedence than one from `param.description`.
 */
export function getParamMetadata(ast: Ast.AST): FullMetadata {
  const metadata = collectMetadata(ast).metadata
  return {
    ...metadata,
    param: {
      ...(metadata.description === undefined ? {} : { description: metadata.description }),
      ...metadata.param,
    },
  }
}

/**
 * Keeps only the keys that belong to a SchemaObject (drops `param` and `undefined` values).
 */
export function buildSchemaMetadata(metadata: FullMetadata) {
  return omitBy(metadata, (value, key) => key === 'param' || value === undefined)
}

/**
 * Drops `undefined` values from parameter metadata.
 */
export function buildParameterMetadata(metadata: NonNullable<OpenAPIMetadata['param']>) {
  return omitBy(metadata, isUndefined)
}

/**
 * Merges the user-provided metadata over a generated schema.
 */
export function applySchemaMetadata(
  initialData: SchemaObject | ReferenceObject,
  metadata: FullMetadata,
): SchemaObject {
  return omitBy({ ...initialData, ...buildSchemaMetadata(metadata) }, isUndefined)
}

/**
 * The default value declared on the schema (`default` annotation), outermost wins.
 */
export function getDefaultValue(ast: Ast.AST): unknown {
  return collectMetadata(ast).metadata.default
}
