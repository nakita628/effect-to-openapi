import { Schema } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import {
  OpenAPIRegistry,
  generateComponents,
  generateDocument,
  getOpenApiMetadata,
  getRefId,
} from '../index.js'

describe('registry and generation', () => {
  it('reads metadata and the refId straight from annotate', () => {
    const Id = Schema.String.annotate({ identifier: 'Id', description: 'The id' })
    expect(getRefId(Id.ast)).toBe('Id')
    expect(getOpenApiMetadata(Id.ast)).toStrictEqual({ description: 'The id' })
    expect(Schema.decodeUnknownSync(Id)('a')).toBe('a')
  })

  it('reproduces the zod-to-openapi example document', () => {
    const registry = OpenAPIRegistry()
    const UserIdSchema = registry.registerParameter(
      'UserId',
      Schema.String.annotate({ param: { name: 'id', in: 'path' }, example: '1212121' }),
    )
    const UserSchema = Schema.Struct({
      id: Schema.String.annotate({ example: '1212121' }),
      name: Schema.String.annotate({ example: 'John Doe' }),
      age: Schema.Number.annotate({ example: 42 }),
    }).annotate({ identifier: 'User' })
    const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    registry.registerPath({
      method: 'get',
      path: '/users/{id}',
      description: 'Get user data by its id',
      summary: 'Get a single user',
      security: [{ [bearerAuth.name]: [] }],
      request: { params: Schema.Struct({ id: UserIdSchema }) },
      responses: {
        200: {
          description: 'Object with user data.',
          content: { 'application/json': { schema: UserSchema } },
        },
        204: { description: 'No content - successful operation' },
      },
    })
    const info = { version: '1.0.0', title: 'My API', description: 'This is the API' }
    expect(
      generateDocument(registry.definitions, {
        openapi: '3.0.0',
        info,
        servers: [{ url: 'v1' }],
      }),
    ).toStrictEqual({
      ok: true,
      value: {
        openapi: '3.0.0',
        info,
        servers: [{ url: 'v1' }],
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
          schemas: {
            UserId: { type: 'string', example: '1212121' },
            User: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '1212121' },
                name: { type: 'string', example: 'John Doe' },
                age: { type: 'number', example: 42 },
              },
              required: ['id', 'name', 'age'],
            },
          },
          parameters: {
            UserId: {
              schema: { $ref: '#/components/schemas/UserId' },
              required: true,
              name: 'id',
              in: 'path',
            },
          },
        },
        paths: {
          '/users/{id}': {
            get: {
              description: 'Get user data by its id',
              summary: 'Get a single user',
              security: [{ bearerAuth: [] }],
              parameters: [{ $ref: '#/components/parameters/UserId' }],
              responses: {
                '200': {
                  description: 'Object with user data.',
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/User' } },
                  },
                },
                '204': { description: 'No content - successful operation' },
              },
            },
          },
        },
      },
    })
  })

  it('pins the output flavour to the requested version', () => {
    const registry = OpenAPIRegistry()
    registry.register('S', Schema.NullOr(Schema.String))
    expect(generateComponents(registry.definitions, { openapi: '3.0.0' })).toStrictEqual({
      ok: true,
      value: {
        components: {
          schemas: { S: { type: 'string', nullable: true } },
          parameters: {},
        },
      },
    })
    expect(generateComponents(registry.definitions, { openapi: '3.1.0' })).toStrictEqual({
      ok: true,
      value: {
        components: {
          schemas: { S: { type: ['string', 'null'] } },
          parameters: {},
        },
      },
    })
    expect(generateComponents(registry.definitions, { openapi: '3.2.0' })).toStrictEqual({
      ok: true,
      value: {
        components: {
          schemas: { S: { type: ['string', 'null'] } },
          parameters: {},
        },
      },
    })
    const info = { title: 'API', version: '1.0.0' }
    const v31 = generateDocument(registry.definitions, { openapi: '3.1.0', info })
    expect(v31.ok ? v31.value.openapi : v31).toBe('3.1.0')
    const v32 = generateDocument(registry.definitions, { openapi: '3.2.0', info })
    expect(v32.ok ? v32.value.openapi : v32).toBe('3.2.0')
  })

  it('copies x-* vendor extensions and parameter examples through annotate', () => {
    const registry = OpenAPIRegistry()
    registry.register(
      'Tagged',
      Schema.String.annotate({ 'x-internal': true, deprecated: true, examples: ['a'] }),
    )
    expect(generateComponents(registry.definitions, { openapi: '3.1.0' })).toStrictEqual({
      ok: true,
      value: {
        components: {
          schemas: {
            Tagged: { type: 'string', 'x-internal': true, deprecated: true, examples: ['a'] },
          },
          parameters: {},
        },
      },
    })
  })
})
