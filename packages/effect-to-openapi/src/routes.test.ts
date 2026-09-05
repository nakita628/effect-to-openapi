import { Schema } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { createRegistry, generateComponents, generateDocument } from './index.js'

const config = { openapi: '3.0.0', info: { title: 'API', version: '1.0.0' } } as const

describe('registry', () => {
  it('registers parameters with the refId as the default name and keeps explicit names', () => {
    const registry = createRegistry()
    registry.registerParameter('Id', Schema.String.annotate({ param: { in: 'path' } }))
    registry.registerParameter('Q', Schema.String.annotate({ param: { in: 'query', name: 'q' } }))
    expect(generateComponents(registry.definitions, { openapi: '3.0.0' })).toStrictEqual({
      ok: true,
      value: {
        components: {
          schemas: { Id: { type: 'string' }, Q: { type: 'string' } },
          parameters: {
            Id: {
              schema: { $ref: '#/components/schemas/Id' },
              required: true,
              in: 'path',
              name: 'Id',
            },
            Q: {
              schema: { $ref: '#/components/schemas/Q' },
              required: true,
              in: 'query',
              name: 'q',
            },
          },
        },
      },
    })
  })

  it('registers raw components, merges them with generated ones and sorts on request', () => {
    const parent = createRegistry()
    parent.register('B', Schema.String)
    const registry = createRegistry([parent])
    registry.register('A', Schema.Number)
    registry.registerComponent('schemas', 'Raw', { type: 'string' })
    registry.registerComponent('parameters', 'RawParam', { name: 'raw', in: 'query' })
    const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
      type: 'http',
      scheme: 'bearer',
    })
    expect(bearer).toStrictEqual({
      name: 'bearerAuth',
      ref: { $ref: '#/components/securitySchemes/bearerAuth' },
    })
    const document = generateDocument(registry.definitions, config, {
      sortComponents: 'alphabetically',
    })
    expect(document.ok ? document.value.components : document).toStrictEqual({
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas: { A: { type: 'number' }, B: { type: 'string' }, Raw: { type: 'string' } },
      parameters: { RawParam: { name: 'raw', in: 'query' } },
    })
  })

  it('rejects values that are not schemas with a helpful error', () => {
    expect(() => createRegistry().registerParameter('X', {} as never)).toThrow(
      'Expected an Effect schema',
    )
  })

  it('keeps registered schemas usable for decoding', () => {
    const User = createRegistry().register('User', Schema.Struct({ name: Schema.String }))
    expect(Schema.decodeUnknownSync(User)({ name: 'a' })).toStrictEqual({ name: 'a' })
  })
})

describe('parameters', () => {
  it('generates path, query, header and cookie parameters with metadata', () => {
    const Limit = createRegistry().registerParameter(
      'Limit',
      Schema.UndefinedOr(Schema.Number).annotate({ param: { name: 'limit', in: 'query' } }),
    )
    const document = generateDocument(
      [
        { type: 'parameter', schema: Limit },
        {
          type: 'route',
          route: {
            method: 'get',
            path: '/users/{id}',
            parameters: [{ name: 'manual', in: 'query', schema: { type: 'string' } }],
            request: {
              params: Schema.Struct({ id: Schema.String }),
              query: Schema.Struct({
                limit: Limit,
                q: Schema.String.annotate({
                  description: 'Schema',
                  param: { description: 'Param' },
                }),
              }),
              headers: [Schema.String.annotate({ param: { name: 'x-a' } })],
              cookies: Schema.Struct({ session: Schema.NullOr(Schema.String) }),
            },
            responses: { 200: { description: 'OK' } },
          },
        },
      ],
      config,
    )
    expect(document.ok ? document.value.components?.parameters : document).toStrictEqual({
      Limit: {
        schema: { $ref: '#/components/schemas/Limit' },
        required: false,
        name: 'limit',
        in: 'query',
      },
    })
    expect(
      document.ok ? document.value.paths?.['/users/{id}']?.get?.parameters : document,
    ).toStrictEqual([
      { name: 'manual', in: 'query', schema: { type: 'string' } },
      { schema: { type: 'string' }, required: true, name: 'id', in: 'path' },
      { $ref: '#/components/parameters/Limit' },
      {
        schema: { type: 'string', description: 'Schema' },
        required: true,
        description: 'Param',
        name: 'q',
        in: 'query',
      },
      { schema: { type: 'string' }, required: true, name: 'x-a', in: 'header' },
      {
        schema: { type: 'string', nullable: true },
        required: false,
        name: 'session',
        in: 'cookie',
      },
    ])
  })

  it('reports missing names and conflicting names / locations as error results', () => {
    const route = (query: Schema.Top) =>
      generateDocument(
        [{ type: 'route', route: { method: 'get', path: '/', request: { query }, responses: {} } }],
        config,
      )
    expect(route(Schema.String)).toStrictEqual({
      ok: false,
      error: {
        type: 'MissingParameterDataError',
        message:
          'Missing parameter data, please specify `name` and other OpenAPI parameter props using the `param` key of `.annotate()`',
        data: { missingField: 'name', location: 'query', route: 'get /' },
      },
    })
    expect(
      route(Schema.Struct({ id: Schema.String.annotate({ param: { name: 'x' } }) })),
    ).toStrictEqual({
      ok: false,
      error: {
        type: 'ConflictError',
        message:
          'Conflicting names for parameter. Use the same key in the route object and in `.annotate({ param: { name } })`',
        data: { key: 'name', values: ['id', 'x'] },
      },
    })
    expect(
      route(Schema.Struct({ id: Schema.String.annotate({ param: { in: 'path' } }) })),
    ).toStrictEqual({
      ok: false,
      error: {
        type: 'ConflictError',
        message:
          'Conflicting location for parameter id. Use the same `in` in the route request and in `.annotate({ param: { in } })`',
        data: { key: 'in', values: ['query', 'path'] },
      },
    })
    expect(route(Schema.String.annotate({ param: { name: 'q', in: 'path' } }))).toStrictEqual({
      ok: false,
      error: {
        type: 'ConflictError',
        message:
          'Conflicting location for parameter q. Use the same `in` in the route request and in `.annotate({ param: { in } })`',
        data: { key: 'in', values: ['query', 'path'] },
      },
    })
    const registry = createRegistry()
    const P = registry.registerParameter(
      'P',
      Schema.String.annotate({ param: { name: 'p', in: 'path' } }),
    )
    registry.registerPath({ method: 'get', path: '/', request: { query: P }, responses: {} })
    expect(generateDocument(registry.definitions, config)).toStrictEqual({
      ok: false,
      error: {
        type: 'ConflictError',
        message:
          'Conflicting location for parameter p. Use the same `in` in the route request and in `.annotate({ param: { in } })`',
        data: { key: 'in', values: ['path', 'query', 'path'] },
      },
    })
  })
})

describe('routes', () => {
  it('generates request bodies, responses, headers, raw content and webhooks', () => {
    const registry = createRegistry()
    const User = registry.register('User', Schema.Struct({ name: Schema.String }))
    registry.registerPath({
      method: 'post',
      path: '/users',
      summary: 'Create',
      request: { body: { required: true, content: { 'application/json': { schema: User } } } },
      responses: {
        201: {
          description: 'Created',
          headers: Schema.Struct({
            'x-id': Schema.String,
            'x-opt': Schema.optional(Schema.String),
          }),
          content: { 'application/json': { schema: User, example: { name: 'a' } } },
        },
        400: { description: 'Bad', headers: { 'x-raw': { schema: { type: 'string' } } } },
        404: { $ref: '#/components/responses/NotFound' },
        default: {
          description: 'Raw',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Raw' } },
            'text/plain': { $ref: '#/components/mediaTypes/Plain' },
          },
        },
      },
    })
    registry.registerPath({
      method: 'get',
      path: '/users',
      responses: { 200: { description: 'List' } },
    })
    registry.registerWebhook({
      method: 'post',
      path: 'userCreated',
      request: { body: { content: { 'application/json': { schema: User } } } },
      responses: { 200: { description: 'OK' } },
    })
    const v30 = generateDocument(registry.definitions, config)
    expect(v30.ok && 'webhooks' in v30.value).toBe(false)
    expect(v30.ok ? v30.value.paths : v30).toStrictEqual({
      '/users': {
        post: {
          summary: 'Create',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          responses: {
            201: {
              description: 'Created',
              headers: {
                'x-id': { schema: { type: 'string' }, required: true },
                'x-opt': { schema: { type: 'string' }, required: false },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                  example: { name: 'a' },
                },
              },
            },
            400: { description: 'Bad', headers: { 'x-raw': { schema: { type: 'string' } } } },
            404: { $ref: '#/components/responses/NotFound' },
            default: {
              description: 'Raw',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Raw' } },
                'text/plain': { $ref: '#/components/mediaTypes/Plain' },
              },
            },
          },
        },
        get: { responses: { 200: { description: 'List' } } },
      },
    })
    const v32 = generateDocument(registry.definitions, { ...config, openapi: '3.2.0' })
    expect(v32.ok ? v32.value.webhooks : v32).toStrictEqual({
      userCreated: {
        post: {
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          responses: { 200: { description: 'OK' } },
        },
      },
    })
  })

  it('supports the 3.2 query method, itemSchema and encodings', () => {
    const Item = Schema.Struct({ id: Schema.String }).annotate({ identifier: 'Item' })
    const document = generateDocument(
      [
        {
          type: 'route',
          route: {
            method: 'query',
            path: '/search',
            responses: {
              200: {
                summary: 'Stream',
                content: {
                  'application/jsonl': {
                    itemSchema: Item,
                    itemEncoding: { contentType: 'application/json' },
                  },
                  'application/json': {
                    schema: Schema.Tuple([Schema.String, Schema.Number]),
                    prefixEncoding: [{ contentType: 'text/plain' }],
                  },
                },
              },
            },
          },
        },
      ],
      { ...config, openapi: '3.2.0' },
    )
    expect(
      document.ok ? document.value.paths?.['/search']?.query?.responses?.[200] : document,
    ).toStrictEqual({
      summary: 'Stream',
      content: {
        'application/jsonl': {
          itemSchema: { $ref: '#/components/schemas/Item' },
          itemEncoding: { contentType: 'application/json' },
        },
        'application/json': {
          schema: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] },
          prefixEncoding: [{ contentType: 'text/plain' }],
        },
      },
    })
  })

  it('adds metadata overrides to references and keeps refIds through further annotations', () => {
    const Base = Schema.String.annotate({ identifier: 'Base', description: 'base' })
    const result = generateComponents(
      [
        Base,
        Schema.Struct({
          same: Base.annotate({ description: 'base' }),
          more: Base.annotate({ description: 'more', example: 'x' }),
          typed: Base.annotate({ type: 'integer' }),
          withDefault: Base.annotate({ default: 'd' }),
        }).annotate({ identifier: 'T' }),
      ],
      { openapi: '3.0.0' },
    )
    expect(result.ok ? result.value.components?.schemas?.T : result).toStrictEqual({
      type: 'object',
      properties: {
        same: { $ref: '#/components/schemas/Base' },
        more: {
          allOf: [{ $ref: '#/components/schemas/Base' }, { description: 'more', example: 'x' }],
        },
        typed: { allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'integer' }] },
        // v4's `.annotate` merges, so the identifier survives and the delta is layered on the ref
        withDefault: { allOf: [{ $ref: '#/components/schemas/Base' }, { default: 'd' }] },
      },
      required: ['same', 'more', 'typed', 'withDefault'],
    })
  })
})
