# effect-to-openapi

A library that generates OpenAPI docs from [Effect Schema](https://effect.website/docs/schema/introduction/) schemas

## Install

```bash
npm install effect-to-openapi effect
```

## Usage

```ts
import { Schema } from 'effect'
import { OpenAPIRegistry, generateDocument } from 'effect-to-openapi'

const registry = OpenAPIRegistry()

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

## OpenAPI version

The output flavour is the `openapi` field of the config, and nothing else. There is no separate
generator to pick:

```ts
// nullable: true, no webhooks
generateDocument(registry.definitions, { openapi: '3.0.0', info })

// type: ['string', 'null'], prefixItems, numeric exclusiveMinimum, webhooks
generateDocument(registry.definitions, { openapi: '3.1.0', info })

// the 3.1 shape, plus the 3.2 keywords the model carries (itemSchema, query, ...)
generateDocument(registry.definitions, { openapi: '3.2.0', info })
```

Accepted values are `3.0.0` through `3.0.4`, `3.1.0`, `3.1.1` and `3.2.0`; the type rejects
anything else. `generateComponents` reads the same field:

```ts
generateComponents(registry.definitions, { openapi: '3.1.0' })
```

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/effect-to-openapi?tab=MIT-1-ov-file) for more information.
