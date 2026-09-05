import { SchemaAST } from 'effect'

import type { AST } from '../ast/index.js'
import {
  literalValues,
  stringProperties,
  unwrapChained,
  unwrapNullable,
  valueMembers,
} from '../ast/index.js'
import { getInternalMetadata, getRefId } from '../metadata/index.js'
import type {
  DiscriminatorObject,
  MapNullableOfArray,
  MapNullableType,
  MapSubSchema,
  UnionPreferredType,
} from '../types/index.js'
import { isString } from '../utils/index.js'
import { enumSchema } from './literal.js'

function flattenUnionMembers(ast: AST.AST): readonly AST.AST[] {
  return SchemaAST.isUnion(ast) ? valueMembers(ast).flatMap(flattenUnionMembers) : [ast]
}

function literalValueOf(ast: AST.AST, key: string): string | undefined {
  const base = unwrapChained(ast)
  if (!SchemaAST.isObjects(base)) {
    return undefined
  }
  const property = stringProperties(base).find((entry) => entry.name === key)?.property
  const type = property === undefined ? undefined : unwrapChained(property.type)
  return type !== undefined && SchemaAST.isLiteral(type) && isString(type.literal)
    ? type.literal
    : undefined
}

/**
 * A key every member declares as a string literal, i.e. a discriminator in the OpenAPI sense.
 */
function discriminatorKey(members: readonly AST.AST[]): string | undefined {
  const [first] = members
  const base = first === undefined ? undefined : unwrapChained(first)
  if (base === undefined || !SchemaAST.isObjects(base)) {
    return undefined
  }
  return stringProperties(base)
    .map(({ name }) => name)
    .find((name) => members.every((member) => literalValueOf(member, name) !== undefined))
}

function discriminatorMapping(
  members: readonly AST.AST[],
  key: string,
  generateSchemaRef: (refId: string) => string,
): DiscriminatorObject | undefined {
  // All schemas must be registered to use a discriminator
  if (members.some((member) => getRefId(member) === undefined)) {
    return undefined
  }
  const mapping = Object.fromEntries(
    members.flatMap((member) => {
      const refId = getRefId(member)
      const value = literalValueOf(member, key)
      return refId === undefined || value === undefined ? [] : [[value, generateSchemaRef(refId)]]
    }),
  )
  return { propertyName: key, mapping }
}

/**
 * `Schema.Union([...])`:
 * - a union of literals of one primitive type becomes an `enum` (`Schema.Literals(['a', 'b'])`)
 * - members that are structs sharing a string-literal key become `oneOf` + `discriminator`
 *   (the mapping is emitted only when every member is a registered component)
 * - anything else becomes `anyOf` (or `oneOf` when the union declares `mode: 'oneOf'` or a
 *   preferred type is set)
 * Nested unions are flattened and nullable members are unwrapped, the whole union being
 * marked nullable instead.
 */
export function unionSchema(
  ast: AST.Union,
  isNullable: boolean,
  mapNullableType: MapNullableType,
  mapNullableOfArray: MapNullableOfArray,
  mapItem: MapSubSchema,
  generateSchemaRef: (refId: string) => string,
  preferredType: UnionPreferredType | undefined,
) {
  const members = flattenUnionMembers(ast).map(unwrapNullable)
  const literals = literalValues(members)
  if (literals !== undefined && literals.length > 0) {
    return enumSchema(literals, isNullable, mapNullableType)
  }
  const memberSchemas = members.map((member) => mapItem(member))
  const failed = memberSchemas.find((member) => !member.ok)
  if (failed !== undefined && !failed.ok) {
    return failed
  }
  const schemas = mapNullableOfArray(
    memberSchemas.flatMap((member) => (member.ok ? [member.value] : [])),
  )
  // `anyOf` / `oneOf` must be non-empty arrays; a union of only `undefined` accepts anything
  if (schemas.length === 0) {
    return { ok: true, value: {} } as const
  }
  const key = discriminatorKey(members)
  if (key !== undefined && !isNullable) {
    const discriminator = discriminatorMapping(members, key, generateSchemaRef)
    return {
      ok: true,
      value: { oneOf: schemas, ...(discriminator === undefined ? {} : { discriminator }) },
    } as const
  }
  const unionKey =
    getInternalMetadata(ast).unionPreferredType ??
    (ast.mode === 'oneOf' ? 'oneOf' : undefined) ??
    preferredType ??
    'anyOf'
  return { ok: true, value: { [unionKey]: schemas } } as const
}
