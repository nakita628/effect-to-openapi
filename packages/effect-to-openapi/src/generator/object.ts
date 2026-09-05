import { SchemaAST } from 'effect'

import type { AST } from '../ast/index.js'
import { isOptionalProperty, stringProperties, templateLiteralPattern } from '../ast/index.js'
import type { MapNullableType, MapSubSchema } from '../types/index.js'

function indexSignatureKeywords(ast: AST.Objects, mapItem: MapSubSchema) {
  const patterns = ast.indexSignatures.flatMap((signature) =>
    SchemaAST.isTemplateLiteral(signature.parameter)
      ? [{ pattern: templateLiteralPattern(signature.parameter), value: mapItem(signature.type) }]
      : [],
  )
  const failedPattern = patterns.find(({ value }) => !value.ok)
  if (failedPattern !== undefined && !failedPattern.value.ok) {
    return failedPattern.value
  }
  const additional = ast.indexSignatures
    .filter((signature) => !SchemaAST.isTemplateLiteral(signature.parameter))
    .map((signature) => mapItem(signature.type))
  const failedAdditional = additional.find((value) => !value.ok)
  if (failedAdditional !== undefined && !failedAdditional.ok) {
    return failedAdditional
  }
  const additionalProperties = additional.flatMap((value) => (value.ok ? [value.value] : [])).at(-1)
  return {
    ok: true,
    value: {
      ...(patterns.length > 0
        ? {
            patternProperties: Object.fromEntries(
              patterns.flatMap(({ pattern, value }) => (value.ok ? [[pattern, value.value]] : [])),
            ),
          }
        : {}),
      ...(additionalProperties === undefined ? {} : { additionalProperties }),
    },
  } as const
}

/**
 * Annotations declared on the property key itself (`Schema.String.annotateKey({ ... })`) are
 * laid over the property schema; a `$ref` is wrapped in `allOf` like Effect's own JSON Schema
 * generator does.
 */
function propertySchema(property: AST.PropertySignature, mapItem: MapSubSchema) {
  const keyAnnotations = property.type.context?.annotations
  const title = keyAnnotations?.title
  const description = keyAnnotations?.description
  const examples = keyAnnotations?.examples
  const defaultValue = keyAnnotations?.default
  const annotations = {
    ...(typeof title === 'string' ? { title } : {}),
    ...(typeof description === 'string' ? { description } : {}),
    ...(Array.isArray(examples) ? { examples } : {}),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  }
  const schema = mapItem(property.type)
  if (!schema.ok || Object.keys(annotations).length === 0) {
    return schema
  }
  return {
    ok: true,
    value:
      '$ref' in schema.value
        ? { allOf: [schema.value], ...annotations }
        : { ...schema.value, ...annotations },
  } as const
}

/**
 * Keys whose property signature does not accept a missing value.
 */
export function requiredKeysOf(ast: AST.Objects) {
  return stringProperties(ast)
    .filter(({ property }) => !isOptionalProperty(property))
    .map(({ name }) => name)
}

/**
 * `Schema.Struct` / `Schema.Record` (an object node with property and index signatures).
 */
export function objectSchema(
  ast: AST.Objects,
  defaultValue: unknown,
  mapNullableType: MapNullableType,
  mapItem: MapSubSchema,
) {
  const properties = stringProperties(ast).map(({ name, property }) => ({
    name,
    schema: propertySchema(property, mapItem),
  }))
  const failed = properties.find(({ schema }) => !schema.ok)
  if (failed !== undefined && !failed.schema.ok) {
    return failed.schema
  }
  const indexKeywords = indexSignatureKeywords(ast, mapItem)
  if (!indexKeywords.ok) {
    return indexKeywords
  }
  const required = requiredKeysOf(ast)
  return {
    ok: true,
    value: {
      ...mapNullableType('object'),
      ...(properties.length > 0
        ? {
            properties: Object.fromEntries(
              properties.flatMap(({ name, schema }) => (schema.ok ? [[name, schema.value]] : [])),
            ),
          }
        : {}),
      default: defaultValue,
      ...(required.length > 0 ? { required } : {}),
      ...indexKeywords.value,
    },
  } as const
}
