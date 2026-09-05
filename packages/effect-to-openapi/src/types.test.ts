import { Schema } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { generateComponents, generateDocument } from './index.js'

const schemasOf = (schema: Schema.Top, version: '3.0.0' | '3.1.0' = '3.0.0') => {
  const result = generateComponents([schema], { openapi: version })
  return result.ok ? result.value.components?.schemas : result.error
}

describe('primitives', () => {
  it('maps the keyword schemas', () => {
    expect(
      schemasOf(
        Schema.Struct({
          s: Schema.String,
          n: Schema.Number,
          b: Schema.Boolean,
          big: Schema.BigInt,
          u: Schema.Unknown,
          o: Schema.ObjectKeyword,
        }).annotate({ identifier: 'P' }),
      ),
    ).toStrictEqual({
      P: {
        type: 'object',
        properties: {
          s: { type: 'string' },
          n: { type: 'number' },
          b: { type: 'boolean' },
          big: { type: 'string', pattern: '^-?\\d+$' },
          u: { nullable: true },
          o: { type: 'object' },
        },
        required: ['s', 'n', 'b', 'big', 'o'],
      },
    })
  })

  it('keeps explicit title / description annotations', () => {
    expect(
      schemasOf(Schema.String.annotate({ identifier: 'S', title: 'T', description: 'D' })),
    ).toStrictEqual({
      S: { type: 'string', title: 'T', description: 'D' },
    })
  })

  it('uses the encoded side of transformations and declaration codecs', () => {
    expect(
      schemasOf(
        Schema.Struct({
          n: Schema.NumberFromString,
          d: Schema.Date,
          dt: Schema.DateTimeUtc,
        }).annotate({ identifier: 'T' }),
      ),
    ).toStrictEqual({
      T: {
        type: 'object',
        properties: {
          n: { type: 'string' },
          d: { type: 'string', format: 'date-time' },
          dt: { type: 'string', format: 'date-time' },
        },
        required: ['n', 'd', 'dt'],
      },
    })
  })

  it('maps number checks per version', () => {
    const N = Schema.Number.check(
      Schema.isGreaterThan(1),
      Schema.isLessThanOrEqualTo(10),
      Schema.isMultipleOf(2),
    ).annotate({ identifier: 'N' })
    expect(schemasOf(N)).toStrictEqual({
      N: {
        type: 'number',
        minimum: 1,
        exclusiveMinimum: true,
        maximum: 10,
        multipleOf: 2,
      },
    })
    expect(schemasOf(N, '3.1.0')).toStrictEqual({
      N: {
        type: 'number',
        exclusiveMinimum: 1,
        maximum: 10,
        multipleOf: 2,
      },
    })
  })

  it('honours a type override for opaque declarations', () => {
    expect(
      schemasOf(
        Schema.instanceOf(Date).annotate({
          identifier: 'D',
          type: 'string',
          format: 'date-time',
        }),
      ),
    ).toStrictEqual({
      D: { type: 'string', format: 'date-time' },
    })
  })

  it('reports nodes without a JSON representation as an error result', () => {
    const D = Schema.instanceOf(Date).annotate({ identifier: 'D' })
    expect(schemasOf(D)).toStrictEqual({
      type: 'UnknownSchemaTypeError',
      message:
        'Unknown Effect schema node `Declaration`, please specify `type` and other OpenAPI props using `.annotate()`.',
      data: { schemaName: 'D', currentSchema: D.ast },
    })
    const U = Schema.Undefined.annotate({ identifier: 'U' })
    expect(schemasOf(U)).toStrictEqual({
      type: 'UnknownSchemaTypeError',
      message:
        'Unknown Effect schema node `Undefined`, please specify `type` and other OpenAPI props using `.annotate()`.',
      data: { schemaName: 'U', currentSchema: U.ast },
    })
  })
})

describe('literals and enums', () => {
  it('maps literals, literal unions and TypeScript enums', () => {
    enum Role {
      Admin = 'admin',
      User = 'user',
    }
    expect(
      schemasOf(
        Schema.Struct({
          one: Schema.Literal('a'),
          many: Schema.Literals(['a', 'b']),
          numbers: Schema.Literals([1, 2]),
          role: Schema.Enum(Role),
          flag: Schema.Literal(true),
          nullable: Schema.NullOr(Schema.Literals(['x', 'y'])),
        }).annotate({ identifier: 'L' }),
      ),
    ).toStrictEqual({
      L: {
        type: 'object',
        properties: {
          one: { type: 'string', enum: ['a'] },
          many: { type: 'string', enum: ['a', 'b'] },
          numbers: { type: 'integer', enum: [1, 2] },
          role: { type: 'string', enum: ['admin', 'user'] },
          flag: { type: 'boolean', enum: [true] },
          nullable: { type: 'string', enum: ['x', 'y', null], nullable: true },
        },
        required: ['one', 'many', 'numbers', 'role', 'flag', 'nullable'],
      },
    })
  })

  it('maps bigint literals to decimal strings', () => {
    expect(schemasOf(Schema.Literal(1n).annotate({ identifier: 'B' }))).toStrictEqual({
      B: { type: 'string', pattern: '^-?\\d+$' },
    })
  })

  it('maps template literals to patterns', () => {
    expect(
      schemasOf(Schema.TemplateLiteral(['a', Schema.Number]).annotate({ identifier: 'T' })),
    ).toStrictEqual({
      T: { type: 'string', pattern: '^a[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?$' },
    })
  })
})

describe('arrays and tuples', () => {
  it('maps arrays, non-empty arrays and tuples', () => {
    const T = Schema.Struct({
      list: Schema.Array(Schema.String),
      nonEmpty: Schema.NonEmptyArray(Schema.Number),
      tuple: Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Number)]),
    }).annotate({ identifier: 'A' })
    expect(schemasOf(T)).toStrictEqual({
      A: {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'string' } },
          nonEmpty: { type: 'array', items: { type: 'number' }, minItems: 1 },
          tuple: {
            type: 'array',
            items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
            minItems: 1,
            maxItems: 2,
          },
        },
        required: ['list', 'nonEmpty', 'tuple'],
      },
    })
    expect(schemasOf(T, '3.1.0')).toMatchObject({
      A: {
        properties: {
          nonEmpty: {
            type: 'array',
            prefixItems: [{ type: 'number' }],
            items: { type: 'number' },
          },
          tuple: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] },
        },
      },
    })
  })
})

describe('structs and records', () => {
  it('maps optional and nullish fields', () => {
    expect(
      schemasOf(
        Schema.Struct({
          a: Schema.optionalKey(Schema.String),
          b: Schema.optional(Schema.String),
          c: Schema.NullishOr(Schema.String),
          d: Schema.UndefinedOr(Schema.String),
        }).annotate({ identifier: 'O' }),
      ),
    ).toStrictEqual({
      O: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string', nullable: true },
          d: { type: 'string' },
        },
      },
    })
  })

  it('maps records with template literal keys to patternProperties', () => {
    expect(
      schemasOf(
        Schema.Record(Schema.TemplateLiteral(['k-', Schema.String]), Schema.Number).annotate({
          identifier: 'P',
        }),
      ),
    ).toStrictEqual({
      P: { type: 'object', patternProperties: { '^k-[\\s\\S]*?$': { type: 'number' } } },
    })
  })

  it('maps records and property key annotations', () => {
    expect(
      schemasOf(
        Schema.Struct({
          dict: Schema.Record(Schema.String, Schema.Number),
          named: Schema.String.annotateKey({ description: 'Named' }),
        }).annotate({ identifier: 'R' }),
      ),
    ).toStrictEqual({
      R: {
        type: 'object',
        properties: {
          dict: { type: 'object', additionalProperties: { type: 'number' } },
          named: { type: 'string', description: 'Named' },
        },
        required: ['dict', 'named'],
      },
    })
  })

  it('maps Schema.Class through its encoded struct', () => {
    class Person extends Schema.Class<Person>('Person')({ name: Schema.String }) {}
    expect(schemasOf(Schema.Array(Person).annotate({ identifier: 'People' }))).toStrictEqual({
      Person: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      People: { type: 'array', items: { $ref: '#/components/schemas/Person' } },
    })
  })
})

describe('unions', () => {
  it('maps plain unions, nullable unions and the preferred type', () => {
    const U = Schema.Union([Schema.String, Schema.Number])
    expect(schemasOf(U.annotate({ identifier: 'U' }))).toStrictEqual({
      U: { anyOf: [{ type: 'string' }, { type: 'number' }] },
    })
    expect(schemasOf(Schema.NullOr(U).annotate({ identifier: 'N' }), '3.1.0')).toStrictEqual({
      N: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
    })
    expect(schemasOf(U.annotate({ identifier: 'O', unionPreferredType: 'oneOf' }))).toStrictEqual({
      O: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    })
  })

  it("honours the union's own oneOf mode", () => {
    const M = Schema.Union([Schema.String, Schema.Number], { mode: 'oneOf' }).annotate({
      identifier: 'M',
    })
    expect(schemasOf(M)).toStrictEqual({
      M: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    })
  })

  it('detects discriminated unions of registered structs', () => {
    const Cat = Schema.Struct({ kind: Schema.Literal('cat'), lives: Schema.Number }).annotate({
      identifier: 'Cat',
    })
    const Dog = Schema.Struct({ kind: Schema.Literal('dog'), barks: Schema.Boolean }).annotate({
      identifier: 'Dog',
    })
    expect(schemasOf(Schema.Union([Cat, Dog]).annotate({ identifier: 'Pet' }))).toStrictEqual({
      Cat: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['cat'] }, lives: { type: 'number' } },
        required: ['kind', 'lives'],
      },
      Dog: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['dog'] }, barks: { type: 'boolean' } },
        required: ['kind', 'barks'],
      },
      Pet: {
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: {
          propertyName: 'kind',
          mapping: { cat: '#/components/schemas/Cat', dog: '#/components/schemas/Dog' },
        },
      },
    })
  })

  it('registers nullable references through allOf / oneOf', () => {
    const S = Schema.String.annotate({ identifier: 'S' })
    const result = generateComponents(
      [S, Schema.Struct({ key: Schema.NullOr(S) }).annotate({ identifier: 'T' })],
      {
        openapi: '3.0.0',
      },
    )
    expect(result.ok ? result.value.components?.schemas : result).toStrictEqual({
      S: { type: 'string' },
      T: {
        type: 'object',
        properties: { key: { allOf: [{ $ref: '#/components/schemas/S' }, { nullable: true }] } },
        required: ['key'],
      },
    })
  })
})

describe('edge cases', () => {
  it('references a recursive schema through a nullable wrapper', () => {
    type TreeNode = { readonly name: string; readonly parent: TreeNode | null }
    const TreeNode = Schema.Struct({
      name: Schema.String,
      parent: Schema.NullOr(Schema.suspend((): Schema.Codec<TreeNode> => TreeNode)),
    }).annotate({ identifier: 'Node' })
    expect(schemasOf(TreeNode)).toStrictEqual({
      Node: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          parent: { allOf: [{ $ref: '#/components/schemas/Node' }, { nullable: true }] },
        },
        required: ['name', 'parent'],
      },
    })
  })

  it('maps a union of only undefined to an unconstrained schema', () => {
    expect(schemasOf(Schema.Union([Schema.Undefined]).annotate({ identifier: 'U' }))).toStrictEqual(
      {
        U: {},
      },
    )
  })

  it('omits the discriminator mapping for unregistered members', () => {
    const Cat = Schema.Struct({ kind: Schema.Literal('cat') })
    const Dog = Schema.Struct({ kind: Schema.Literal('dog') })
    expect(schemasOf(Schema.Union([Cat, Dog]).annotate({ identifier: 'Pet' }))).toStrictEqual({
      Pet: {
        oneOf: [
          {
            type: 'object',
            properties: { kind: { type: 'string', enum: ['cat'] } },
            required: ['kind'],
          },
          {
            type: 'object',
            properties: { kind: { type: 'string', enum: ['dog'] } },
            required: ['kind'],
          },
        ],
      },
    })
  })

  it('maps exclusive upper bounds per version', () => {
    const N = Schema.Number.check(Schema.isLessThan(5)).annotate({ identifier: 'N' })
    expect(schemasOf(N)).toStrictEqual({
      N: { type: 'number', maximum: 5, exclusiveMaximum: true },
    })
    expect(schemasOf(N, '3.1.0')).toStrictEqual({
      N: { type: 'number', exclusiveMaximum: 5 },
    })
  })

  it('deduplicates same-typed tuple items in 3.0', () => {
    expect(
      schemasOf(Schema.Tuple([Schema.String, Schema.String]).annotate({ identifier: 'T' })),
    ).toStrictEqual({
      T: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
    })
  })
})

describe('error propagation', () => {
  const Bad = Schema.instanceOf(Date)

  it('propagates schema errors out of every container', () => {
    const containers = [
      Schema.Struct({ x: Bad }),
      Schema.Array(Bad),
      Schema.Tuple([Schema.String, Bad]),
      Schema.Tuple([Bad]),
      Schema.Union([Schema.Struct({ x: Schema.String }), Schema.Struct({ x: Bad })]),
      Schema.Record(Schema.String, Bad),
      Schema.NullOr(Schema.Struct({ x: Bad })),
    ]
    for (const container of containers) {
      const result = generateComponents([container.annotate({ identifier: 'C' })], {
        openapi: '3.0.0',
      })
      expect(result.ok ? result : result.error.type).toBe('UnknownSchemaTypeError')
    }
  })

  it('propagates schema errors out of routes', () => {
    const responsesOnly = { 200: { description: 'OK' } }
    const routes = [
      {
        method: 'get',
        path: '/',
        request: { body: { content: { 'application/json': { schema: Bad } } } },
        responses: responsesOnly,
      },
      {
        method: 'get',
        path: '/',
        request: { params: Schema.Struct({ id: Bad }) },
        responses: responsesOnly,
      },
      {
        method: 'get',
        path: '/',
        request: { headers: [Schema.Struct({ 'x-a': Bad })] },
        responses: responsesOnly,
      },
      {
        method: 'get',
        path: '/',
        responses: {
          200: {
            description: 'OK',
            headers: Schema.Struct({ 'x-a': Bad }),
            content: { 'application/json': { schema: Bad } },
          },
        },
      },
      {
        method: 'query',
        path: '/',
        responses: {
          200: {
            description: 'OK',
            content: { 'application/jsonl': { itemSchema: Bad } },
          },
        },
      },
    ] as const
    for (const route of routes) {
      const result = generateDocument([{ type: 'route', route }], {
        openapi: '3.2.0',
        info: { title: 'API', version: '1.0.0' },
      })
      expect(result.ok ? result : result.error.type).toBe('UnknownSchemaTypeError')
    }
  })

  it('propagates schema errors out of registered parameters and webhooks', () => {
    const parameter = generateDocument(
      [{ type: 'parameter', schema: Bad.annotate({ param: { name: 'p', in: 'query' } }) }],
      { openapi: '3.1.0', info: { title: 'API', version: '1.0.0' } },
    )
    expect(parameter.ok ? parameter : parameter.error.type).toBe('UnknownSchemaTypeError')
    const webhook = generateDocument(
      [
        {
          type: 'webhook',
          webhook: {
            method: 'post',
            path: 'created',
            request: { body: { content: { 'application/json': { schema: Bad } } } },
            responses: { 200: { description: 'OK' } },
          },
        },
      ],
      { openapi: '3.1.0', info: { title: 'API', version: '1.0.0' } },
    )
    expect(webhook.ok ? webhook : webhook.error.type).toBe('UnknownSchemaTypeError')
  })
})
