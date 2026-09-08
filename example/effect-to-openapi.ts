import * as fs from 'node:fs'

import { Schema } from 'effect'
import { OpenAPIRegistry, generateDocument } from 'effect-to-openapi'
import * as yaml from 'yaml'

const registry = OpenAPIRegistry()

const UserIdSchema = registry.registerParameter(
  'UserId',
  Schema.String.annotate({
    param: {
      name: 'id',
      in: 'path',
    },
    example: '1212121',
  }),
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
  request: {
    params: Schema.Struct({ id: UserIdSchema }),
  },
  responses: {
    200: {
      description: 'Object with user data.',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
    204: {
      description: 'No content - successful operation',
    },
  },
})

function getOpenApiDocumentation() {
  // `openapi` selects the output flavour: '3.1.0' / '3.2.0' generate the 3.1+ shape instead.
  return generateDocument(registry.definitions, {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'My API',
      description: 'This is the API',
    },
    servers: [{ url: 'v1' }],
  })
}

function writeDocumentation() {
  // OpenAPI JSON
  const docs = getOpenApiDocumentation()

  if (!docs.ok) {
    throw new Error(docs.error.message)
  }

  // YAML equivalent
  const fileContent = yaml.stringify(docs.value)

  fs.writeFileSync(new URL('effect-to-openapi-openapi-docs.yml', import.meta.url), fileContent, {
    encoding: 'utf-8',
  })
}

writeDocumentation()
