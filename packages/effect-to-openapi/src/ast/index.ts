import { Schema, SchemaAST as AST, SchemaRepresentation } from 'effect'

import type { AnySchema } from '../types/index.js'
import { isObject } from '../utils/index.js'

/**
 * Readers over the Effect Schema AST. Every generator works on `SchemaAST.AST` nodes (property
 * signatures carry ASTs, not schemas), so these helpers are the only place that knows how the
 * AST is shaped.
 */
export type { SchemaAST as AST } from 'effect'

const DEFS_PREFIX = '#/$defs/'

/**
 * Returns `true` when the value is an Effect schema.
 */
export function isSchema(value: unknown): value is AnySchema {
  return Schema.isSchema(value)
}

/**
 * The AST of a schema.
 */
export function astOf(schema: AnySchema): AST.AST {
  if (!Schema.isSchema(schema)) {
    throw new TypeError(
      'Expected an Effect schema. Pass the schema itself, e.g. `Schema.Struct({ ... })` or `Schema.String`.',
    )
  }
  return schema.ast
}

/**
 * Nodes with no JSON representation: a union member of these only marks the value as omittable.
 */
export function isUndefinedLike(ast: AST.AST) {
  return AST.isUndefined(ast) || AST.isVoid(ast)
}

/**
 * The members of a union that carry a JSON value (`null` / `undefined` members removed).
 */
export function valueMembers(ast: AST.Union): readonly AST.AST[] {
  return ast.types.filter((member) => !AST.isNull(member) && !isUndefinedLike(member))
}

/**
 * A union such as `Schema.NullOr(X)` / `Schema.optional(X)` wraps a single value schema; those
 * are treated like zod-to-openapi's nullable / optional wrappers, not as real unions.
 */
export function isWrapperUnion(ast: AST.AST): ast is AST.Union {
  return AST.isUnion(ast) && valueMembers(ast).length === 1 && ast.types.length > 1
}

function isCodecLink(value: unknown): value is { readonly to: AST.AST } {
  return isObject(value) && 'to' in value && AST.isAST(value.to)
}

function isCodecThunk(value: unknown): value is () => unknown {
  return typeof value === 'function'
}

/**
 * The wire-side AST a node encodes to, if any: the target of its `encoding` chain, or the JSON
 * codec a declaration names through its `toCodecJson` annotation (`Schema.Date` → string).
 */
function encodedTarget(ast: AST.AST): AST.AST | undefined {
  const link = ast.encoding?.at(-1)
  if (link !== undefined) {
    return link.to
  }
  const toCodecJson = ast.annotations?.toCodecJson
  if (AST.isDeclaration(ast) && isCodecThunk(toCodecJson)) {
    const codec = toCodecJson()
    return isCodecLink(codec) ? codec.to : undefined
  }
  return undefined
}

/**
 * The nodes from `ast` down to the schema that describes the wire value, outermost first:
 * encodings (`Schema.NumberFromString` → string), declaration JSON codecs (`Schema.Date` →
 * string), suspensions and wrapper unions are descended.
 *
 * @example
 * chain(Schema.NullOr(Schema.NumberFromString).ast)
 * // [Union, Number, String]
 */
export function chain(ast: AST.AST): readonly AST.AST[] {
  const encoded = encodedTarget(ast)
  if (encoded !== undefined) {
    return [ast, ...chain(encoded)]
  }
  if (AST.isSuspend(ast)) {
    return [ast, ...chain(ast.thunk())]
  }
  if (isWrapperUnion(ast)) {
    const [member] = valueMembers(ast)
    if (member === undefined) {
      return [ast]
    }
    return [ast, ...chain(member)]
  }
  return [ast]
}

/**
 * The innermost node of `chain(ast)`: the node the generator dispatches on.
 */
export function unwrapChained(ast: AST.AST): AST.AST {
  return chain(ast).at(-1) ?? ast
}

/**
 * Strips only `null` / `undefined` wrapper unions.
 */
export function unwrapNullable(ast: AST.AST): AST.AST {
  if (isWrapperUnion(ast)) {
    const [member] = valueMembers(ast)
    return member === undefined ? ast : unwrapNullable(member)
  }
  return ast
}

function isTopLike(ast: AST.AST) {
  return AST.isUnknown(ast) || AST.isAny(ast)
}

/**
 * Returns `true` when the wire value accepts `null` (`unknown` / `any` accept it as well).
 */
export function isNullableAst(ast: AST.AST): boolean {
  return chain(ast).some(
    (node) =>
      AST.isNull(node) || isTopLike(node) || (AST.isUnion(node) && node.types.some(isNullableAst)),
  )
}

/**
 * Returns `true` when the wire value accepts `undefined` (the key may be omitted).
 */
export function isOptionalAst(ast: AST.AST): boolean {
  return chain(ast).some(
    (node) =>
      isUndefinedLike(node) ||
      isTopLike(node) ||
      (AST.isUnion(node) && node.types.some(isOptionalAst)),
  )
}

/**
 * The annotations declared on a node, its last check included: `.annotate()` on a checked
 * schema (`Schema.String.check(...).annotate({ ... })`) stores the annotations on the last
 * check, so both places are read (the check overrides the node).
 */
export function annotationsOf(ast: AST.AST): Schema.Annotations.Annotations {
  return { ...ast.annotations, ...ast.checks?.at(-1)?.annotations }
}

/**
 * The annotations Effect itself resolves for a node: the last check's when checks exist,
 * otherwise the node's own (mirrors `Schema.resolveAnnotations`).
 */
function resolvedAnnotations(ast: AST.AST) {
  return ast.checks === undefined ? ast.annotations : ast.checks.at(-1)?.annotations
}

type ToJsonSchemaFn = (input: {
  readonly type: string | undefined
  readonly schemas: readonly unknown[]
}) => unknown

function isToJsonSchemaFn(value: unknown): value is ToJsonSchemaFn {
  return typeof value === 'function'
}

/**
 * The JSON Schema fragments of one check: its `toJsonSchema` annotation compiled with the JSON
 * type of the node (`minLength` on a string → `minLength`, on an array → `minItems`), descending
 * into filter groups without their own compiler.
 */
function checkFragments(
  check: { readonly annotations?: { readonly [key: string]: unknown } | undefined },
  jsonType: string | undefined,
): readonly { readonly [keyword: string]: unknown }[] {
  const toJsonSchema = check.annotations?.toJsonSchema
  if (isToJsonSchemaFn(toJsonSchema)) {
    const fragment = toJsonSchema({ type: jsonType, schemas: [] })
    return isObject(fragment) ? [fragment] : []
  }
  if ('checks' in check && Array.isArray(check.checks)) {
    return check.checks.flatMap((member) =>
      isObject(member) ? checkFragments(member, jsonType) : [],
    )
  }
  return []
}

const DATE_TIME_DECLARATIONS = new Set([
  'effect/schema/Date',
  'effect/schema/DateTimeUtc',
  'effect/schema/DateTimeZoned',
])

function declarationHint(ast: AST.AST): { readonly [keyword: string]: unknown } {
  if (!AST.isDeclaration(ast)) {
    return {}
  }
  const representation = ast.annotations?.representation
  const id = isObject(representation) ? representation.id : undefined
  return typeof id === 'string' && DATE_TIME_DECLARATIONS.has(id) ? { format: 'date-time' } : {}
}

const JSON_TYPES: { readonly [tag: string]: string } = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Arrays: 'array',
  Objects: 'object',
}

/**
 * JSON Schema keywords that constrain the wire value: the checks of every node in the chain
 * compiled through their `toJsonSchema` annotation (innermost first, so outer checks win) plus
 * hints derived from well-known declarations (`Schema.Date` → `format: 'date-time'`).
 *
 * @example
 * checks(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(3)).ast)
 * // { minLength: 1, maxLength: 3 }
 */
export function checks(ast: AST.AST): { readonly [keyword: string]: unknown } {
  const nodes = chain(ast)
  const base = nodes.at(-1)
  const jsonType = base === undefined ? undefined : JSON_TYPES[base._tag]
  const keywordsOf = (node: AST.AST) => [
    ...Object.entries(declarationHint(node)),
    ...(node.checks ?? []).flatMap((check) =>
      checkFragments(check, jsonType).flatMap((fragment) => Object.entries(fragment)),
    ),
  ]
  return Object.fromEntries(nodes.toReversed().flatMap(keywordsOf))
}

/**
 * The identifier used as the component name, resolved the way Effect resolves it (the last
 * check's `identifier` when checks exist, otherwise the node's own), or a suspended schema's
 * (`Schema.Class` declarations carry their identifier directly).
 */
export function identifierOf(ast: AST.AST): string | undefined {
  const own = resolvedAnnotations(ast)?.identifier
  if (typeof own === 'string') {
    return own
  }
  if (AST.isSuspend(ast)) {
    return identifierOf(ast.thunk())
  }
  return undefined
}

/**
 * Property signatures with string keys (symbol keys have no JSON representation).
 */
export function stringProperties(ast: AST.Objects) {
  return ast.propertySignatures.flatMap((property) =>
    typeof property.name === 'string' ? [{ name: property.name, property }] : [],
  )
}

/**
 * Returns `true` when a property may be omitted from the object.
 */
export function isOptionalProperty(property: AST.PropertySignature) {
  return AST.isOptional(property.type) || isOptionalAst(property.type)
}

/**
 * The literal values of a union of literals (`Schema.Literals(['a', 'b'])`), or `undefined`
 * when the union holds anything else.
 */
export function literalValues(
  members: readonly AST.AST[],
): readonly AST.LiteralValue[] | undefined {
  const literals = members.flatMap((member) => (AST.isLiteral(member) ? [member.literal] : []))
  return literals.length === members.length ? literals : undefined
}

/**
 * The regular expression source of a template literal, compiled the way Effect's own JSON
 * Schema generator does.
 */
export function templateLiteralPattern(ast: AST.TemplateLiteral) {
  const document = SchemaRepresentation.toJsonSchemaDocument(
    SchemaRepresentation.toRepresentation(ast),
  )
  // An identifier annotation turns the top-level schema into a `$ref` into `$defs`.
  const reference = isObject(document.schema) ? document.schema.$ref : undefined
  const definition =
    typeof reference === 'string' && reference.startsWith(DEFS_PREFIX)
      ? document.definitions[reference.slice(DEFS_PREFIX.length)]
      : document.schema
  const pattern = isObject(definition) ? definition.pattern : undefined
  return typeof pattern === 'string' ? pattern : ''
}
