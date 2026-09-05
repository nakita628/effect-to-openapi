import { Schema } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { createRegistry, generateComponents, generateDocument } from './index.js'

const UUID_PATTERN =
  '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$'

describe('smoke', () => {
  it('generates a component schema with nested refs, nullable and defaults', () => {
    const Id = Schema.String.check(Schema.isUUID()).annotate({
      identifier: 'Id',
      description: 'The entity id',
    })
    const User = Schema.Struct({
      id: Id,
      name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(10)),
      age: Schema.optional(
        Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
      ).annotate({ default: 18 }),
      nickname: Schema.NullOr(Schema.String),
      tags: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
      role: Schema.Literals(['admin', 'user']),
    }).annotate({ identifier: 'User' })
    expect(generateComponents([User], { openapi: '3.0.0' })).toStrictEqual({
      ok: true,
      value: {
        components: {
          schemas: {
            Id: {
              type: 'string',
              format: 'uuid',
              pattern: UUID_PATTERN,
              description: 'The entity id',
            },
            User: {
              type: 'object',
              properties: {
                id: { $ref: '#/components/schemas/Id' },
                name: { type: 'string', minLength: 1, maxLength: 10 },
                age: { type: 'integer', minimum: 0, default: 18 },
                nickname: { type: 'string', nullable: true },
                tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
                role: { type: 'string', enum: ['admin', 'user'] },
              },
              required: ['id', 'name', 'nickname', 'tags', 'role'],
            },
          },
          parameters: {},
        },
      },
    })
  })

  it('generates a 3.1 document with paths, recursion and webhooks', () => {
    const registry = createRegistry()
    const User = registry.register('User', Schema.Struct({ name: Schema.String }))
    type Tree = { readonly name: string; readonly children: readonly Tree[] }
    const Tree = Schema.Struct({
      name: Schema.String,
      children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => Tree)),
    }).annotate({ identifier: 'Node' })
    registry.registerPath({
      method: 'get',
      path: '/users/{id}',
      request: {
        params: Schema.Struct({
          id: Schema.String.annotate({ param: { description: 'id' } }),
        }),
        query: Schema.Struct({ limit: Schema.optional(Schema.Number) }),
      },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: Schema.NullOr(Schema.Array(User)) } },
        },
        201: { description: 'Tree', content: { 'application/json': { schema: Tree } } },
      },
    })
    registry.registerWebhook({
      method: 'post',
      path: 'userCreated',
      responses: { 200: { description: 'OK' } },
    })
    const document = generateDocument(registry.definitions, {
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0.0' },
    })
    expect(document).toStrictEqual({
      ok: true,
      value: {
        openapi: '3.1.0',
        info: { title: 'API', version: '1.0.0' },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
            Node: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
              },
              required: ['name', 'children'],
            },
          },
          parameters: {},
        },
        paths: {
          '/users/{id}': {
            get: {
              parameters: [
                {
                  schema: { type: 'string' },
                  required: true,
                  description: 'id',
                  name: 'id',
                  in: 'path',
                },
                { schema: { type: 'number' }, required: false, name: 'limit', in: 'query' },
              ],
              responses: {
                200: {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: ['array', 'null'],
                        items: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
                201: {
                  description: 'Tree',
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/Node' } },
                  },
                },
              },
            },
          },
        },
        webhooks: {
          userCreated: { post: { responses: { 200: { description: 'OK' } } } },
        },
      },
    })
  })

  it('keeps the component name when a registered schema is annotated further', () => {
    const User = Schema.Struct({ name: Schema.String })
      .annotate({ identifier: 'User' })
      .annotate({ description: 'A user' })
    expect(generateComponents([User], { openapi: '3.1.0' })).toStrictEqual({
      ok: true,
      value: {
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
              description: 'A user',
            },
          },
          parameters: {},
        },
      },
    })
  })
})
