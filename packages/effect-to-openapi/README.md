# effect-to-openapi

A library that generates OpenAPI docs from [Effect Schema](https://effect.website/docs/schema/introduction/) schemas

## Install

```bash
npm install effect-to-openapi effect
```

## Usage

```ts
import { Schema } from 'effect'
import { createRegistry, generateDocument } from 'effect-to-openapi'

const registry = createRegistry()

const User = registry.register(
  'User',
  Schema.Struct({
    id: Schema.String.annotate({ example: '1212121' }),
    name: Schema.String.annotate({ example: 'John Doe' }),
  }),
)

registry.registerPath({
  method: 'get',
  path: '/users',
  responses: {
    200: {
      description: 'Users',
      content: { 'application/json': { schema: Schema.Array(User) } },
    },
  },
})

const result = generateDocument(registry.definitions, {
  openapi: '3.1.0',
  info: { title: 'My API', version: '1.0.0' },
})

if (result.ok) {
  console.log(result.value)
} else {
  console.error(result.error.message)
}
```

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/effect-to-openapi?tab=MIT-1-ov-file) for more information.
