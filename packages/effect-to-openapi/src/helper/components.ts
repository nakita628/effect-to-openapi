import { astOf, isSchema } from '../ast/index.js'
import type {
  ComponentsObject,
  ComponentTypeKey,
  Definition,
  GenerationContext,
  OpenAPIComponentObject,
  OpenAPIDefinition,
  ParameterObject,
  ReferenceObject,
  SchemaObject,
} from '../types/index.js'
import { isReferenceObject, sortObjectByKeys } from '../utils/index.js'
import { generateParameterDefinition } from './parameter.js'
import { generateSingleRoute } from './route.js'
import { filteredSchemaRefs, generateSchemaWithRef } from './schema.js'

const GENERATION_ORDER: readonly OpenAPIDefinition['type'][] = [
  'schema',
  'parameter',
  'component',
  'route',
  'webhook',
]

function generationIndex(definition: Definition) {
  // A plain Effect schema has no `type: 'schema' | ...` tag => highest priority.
  return isSchema(definition) ? -1 : GENERATION_ORDER.indexOf(definition.type)
}

/**
 * Orders definitions so schemas are generated before the parameters / routes that reference
 * them. The sort is stable, so registration order is preserved within each group.
 */
export function sortDefinitions(definitions: readonly Definition[]): readonly Definition[] {
  return definitions.toSorted((left, right) => generationIndex(left) - generationIndex(right))
}

function generateSingle(ctx: GenerationContext, definition: Definition) {
  if (isSchema(definition)) {
    return generateSchemaWithRef(ctx, astOf(definition))
  }
  if (definition.type === 'parameter') {
    return generateParameterDefinition(ctx, astOf(definition.schema))
  }
  if (definition.type === 'schema') {
    return generateSchemaWithRef(ctx, astOf(definition.schema))
  }
  if (definition.type === 'route') {
    return generateSingleRoute(ctx, definition.route, 'paths')
  }
  if (definition.type === 'webhook') {
    return generateSingleRoute(ctx, definition.webhook, 'webhooks')
  }
  ctx.rawComponents.push(definition)
  return { ok: true, value: undefined } as const
}

function isSchemaComponent(value: OpenAPIComponentObject): value is SchemaObject | ReferenceObject {
  return typeof value === 'object' && value !== null
}

function isParameterComponent(
  value: OpenAPIComponentObject,
): value is ParameterObject | ReferenceObject {
  return (
    typeof value === 'object' && (isReferenceObject(value) || ('name' in value && 'in' in value))
  )
}

function rawComponentsOf<T extends OpenAPIComponentObject>(
  ctx: GenerationContext,
  componentType: ComponentTypeKey,
  guard: (value: OpenAPIComponentObject) => value is T,
): { readonly [name: string]: T } {
  return Object.fromEntries(
    ctx.rawComponents
      .filter((raw) => raw.componentType === componentType)
      .flatMap((raw) => (guard(raw.component) ? [[raw.name, raw.component] as const] : [])),
  )
}

function buildComponents(ctx: GenerationContext): ComponentsObject {
  const rawComponents = Object.fromEntries(
    [...new Set(ctx.rawComponents.map((raw) => raw.componentType))].map((componentType) => [
      componentType,
      Object.fromEntries(
        ctx.rawComponents
          .filter((raw) => raw.componentType === componentType)
          .map((raw) => [raw.name, raw.component] as const),
      ),
    ]),
  )

  // Raw components are entirely under the user's control, so they are passed through as-is.
  const allSchemas = {
    ...rawComponentsOf(ctx, 'schemas', isSchemaComponent),
    ...filteredSchemaRefs(ctx),
  }
  const allParameters = {
    ...rawComponentsOf(ctx, 'parameters', isParameterComponent),
    ...Object.fromEntries(ctx.paramRefs),
  }
  const sort = ctx.options?.sortComponents === 'alphabetically'

  return {
    ...rawComponents,
    schemas: sort ? sortObjectByKeys(allSchemas) : allSchemas,
    parameters: sort ? sortObjectByKeys(allParameters) : allParameters,
  }
}

/**
 * Runs every definition through the context and returns the document fragments.
 */
export function generateDocumentData(ctx: GenerationContext, definitions: readonly Definition[]) {
  for (const definition of sortDefinitions(definitions)) {
    const result = generateSingle(ctx, definition)
    if (!result.ok) {
      return result
    }
  }
  return {
    ok: true,
    value: {
      components: buildComponents(ctx),
      paths: Object.fromEntries(ctx.pathRefs),
      webhooks: Object.fromEntries(ctx.webhookRefs),
    },
  } as const
}
