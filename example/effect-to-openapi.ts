import * as fs from 'node:fs'

import { Schema } from 'effect'
import {
  OpenApiGeneratorV3,
  // The exact same can be achieved by importing OpenApiGeneratorV31 instead:
  // OpenApiGeneratorV31
  OpenAPIRegistry,
} from 'effect-to-openapi'
import * as yaml from 'yaml'

const registry = new OpenAPIRegistry()

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
  const generator = new OpenApiGeneratorV3(registry.definitions)

  return generator.generateDocument({
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
