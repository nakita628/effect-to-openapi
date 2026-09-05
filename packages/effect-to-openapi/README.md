# effect-to-openapi

Build OpenAPI 3.0 / 3.1 / 3.2 documents from [Effect Schema](https://effect.website/docs/schema/introduction/) **v4**. Functional port of [@asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi) with **no dependency besides `effect`** — the OpenAPI object model is defined in the package itself (`src/openapi`), so `openapi3-ts` is not needed even for types.

Metadata is attached with Effect's own `.annotate()` — there is no library-specific action or symbol. `.annotate({ identifier: 'User' })` registers a component, and the OpenAPI-specific keys (`param`, `example`, `unionPreferredType`, `x-*`, …) are typed through Effect's documented `Annotations` module augmentation.

## Install

```bash
npm install effect-to-openapi effect@^4.0.0-rc.112
```

> Requires Effect **v4** (currently a release candidate — the Schema rewrite this package builds on). Effect v3 is not supported.

## Quick Start

The upstream `OpenAPIRegistry` / `OpenApiGeneratorV3` class shape is available, so zod-to-openapi's README example ports with `.annotate(…)` in place of `.openapi(…)`:

```ts
import { Schema } from 'effect'
import { OpenApiGeneratorV3, OpenAPIRegistry } from 'effect-to-openapi'

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

const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'My API',
    description: 'This is the API',
  },
  servers: [{ url: 'v1' }],
})
```

`OpenApiGeneratorV31` / `OpenApiGeneratorV32` produce the 3.1 / 3.2 flavours. The functional forms do the same without classes:

```ts
import { Schema } from 'effect'
import { createRegistry, generateDocument } from 'effect-to-openapi'

const registry = createRegistry()

const User = registry.register(
  'User',
  Schema.Struct({
    id: Schema.String.check(Schema.isUUID()).annotate({ description: 'The user id' }),
    name: Schema.String.check(Schema.isMinLength(1)),
    age: Schema.optional(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  }),
)

registry.registerPath({
  method: 'get',
  path: '/users',
  responses: {
    200: { description: 'Users', content: { 'application/json': { schema: Schema.Array(User) } } },
  },
})

// Generation returns `{ ok: true, value } | { ok: false, error }` — nothing is thrown
const document = generateDocument(registry.definitions, {
  openapi: '3.1.0',
  info: { title: 'My API', version: '1.0.0' },
})
if (document.ok) {
  console.log(document.value) // the OpenAPI document
} else {
  console.error(document.error.message) // { type, message, data } — plain object, no class
}
```

Registering through the registry is just sugar over the `identifier` annotation — any schema with `.annotate({ identifier: 'User' })` becomes a `components.schemas` entry when it is generated:

```ts
const User = Schema.Struct({ name: Schema.String }).annotate({
  identifier: 'User',
  description: 'A registered user',
})
```

## API

| Export                                                                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new OpenAPIRegistry(parents?)` / `new OpenApiGeneratorV3(definitions, options?)` / `V31` / `V32` | Class forms of `createRegistry` / `generateDocument` / `generateComponents` with the zod-to-openapi signatures. Instances and `createRegistry()` results share the `Registry` type and can be mixed as parents.                                                                                                                                                                                                                                                                                       |
| `createRegistry(parents?)`                                                                        | Returns `{ definitions, register, registerParameter, registerPath, registerWebhook, registerComponent }`. `register(refId, schema)` returns `schema.annotate({ identifier: refId })`, so the result stays a regular Effect schema.                                                                                                                                                                                                                                                                    |
| `generateDocument(definitions, config, options?)`                                                 | Full document as `{ ok: true, value } \| { ok: false, error }`; the version is taken from `config.openapi` (`3.0.x` → `nullable: true`, boolean `exclusiveMinimum`; `3.1.x` / `3.2.0` → `type: [..., 'null']`, `prefixItems`, `webhooks`). Returns the package's own `OpenAPI` type (a 3.0 / 3.1 / 3.2 superset, defined in `src/openapi`: `OpenAPI` / `Components` / `PathItem` / `Operation` / `Parameter` / `Schema` / `Reference`, all `readonly`, `$ref` typed as `#/components/<kind>/<name>`). |
| `generateComponents(definitions, config, options?)`                                               | Only `components`; `config.openapi` selects the version like `generateDocument`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `getOpenApiMetadata(ast)` / `getRefId(ast)`                                                       | Read the collected OpenAPI metadata / component name of a schema's AST (`schema.ast`).                                                                                                                                                                                                                                                                                                                                                                                                                |
| `EffectToOpenAPIError`                                                                            | Everything that can fail returns `{ ok: true, value }` or `{ ok: false, error }` inline — nothing is thrown and there is no named Result type. Errors are plain objects discriminated by `type` (`ConflictError`, `MissingParameterDataError`, `UnknownSchemaTypeError`, `EffectToOpenAPIError`) with the next action in `message`.                                                                                                                                                                   |

`options` for the generators: `{ unionPreferredType?: 'oneOf' | 'anyOf', sortComponents?: 'alphabetically' }`.

### Annotations

Everything goes through `.annotate()`. Effect's standard keys are used where they exist, and the OpenAPI-specific keys are added by this package's module augmentation of `Schema.Annotations.Annotations`, so they are type-checked:

```ts
Schema.String.annotate({
  identifier: 'Id', // → components.schemas.Id + $ref (Effect's own key)
  title: 'The id', // Effect's own keys: title / description / format / default / examples / …
  example: '123', // OpenAPI 3.0-style singular example
  deprecated: true, // any SchemaObject keyword (type, enum, minLength, …)
  'x-internal': true, // vendor extensions are copied through
  param: { in: 'path', name: 'id' }, // OpenAPI parameter metadata
})
```

`.annotate()` merges, so a registered schema keeps its `identifier` through further annotations — `User.annotate({ description: 'x' })` generates `allOf: [{ $ref }, { description: 'x' }]` instead of inlining. Note Effect's resolution rule: on a schema with `.check(...)`s the annotations live on the last check, so annotate **after** the checks (`Schema.String.check(...).annotate({ identifier })`).

### How Effect schemas are read

- **`identifier` → component**: every schema whose resolved `identifier` annotation is set (`.annotate({ identifier })`, `registry.register`, `Schema.Class`) becomes a `$ref` to `components.schemas`.
- **Checks** contribute their JSON Schema keywords through Effect's own `toJsonSchema` compilers: `isMinLength` / `isMaxLength` / `isPattern` / `isUUID` / `isInt` / `isGreaterThan` / `isBetween` / `isMultipleOf` / … are merged into the schema (`isMinLength` on an array becomes `minItems`). Checks add no automatic `title` / `description`.
- **Encodings** use their wire side (`Schema.NumberFromString` → `string`, `Schema.Class` → its struct). Declarations are lowered through their `toCodecJson` codec: `Schema.Date` / `Schema.DateTimeUtc` / `Schema.DateTimeZoned` → `string` with `format: 'date-time'`, `Schema.BigInt` → a decimal-`pattern` string.
- **Annotations** `title` / `description` / `examples` / `default` and the OpenAPI keys above are emitted; Effect's machinery annotations (`expected`, `arbitrary`, …) are not.
- **Unions**: `Schema.NullOr` / `Schema.optional` / `Schema.UndefinedOr` are treated as nullable / optional wrappers; a union of same-typed literals becomes `enum`; structs sharing a string-literal key become `oneOf` + `discriminator` (mapping when every member is registered); anything else `anyOf` — or `oneOf` via `Schema.Union([...], { mode: 'oneOf' })`, the `unionPreferredType` annotation, or the generator option.
- **Overrides**: `.annotate({ type: 'string', format: 'date-time' })` types an opaque schema by hand (`Schema.instanceOf(Date)`), and any SchemaObject keyword laid on top wins over the generated one.
- **Unsupported** (declarations without `toCodecJson`, `Undefined`, `Symbol`, …) produce an `UnknownSchemaTypeError` result.

### Tips

- **Extending objects** (zod's `.extend()`): Effect has no schema-level extension tracking, so spread the fields (`Schema.Struct({ ...Base.fields, extra: Schema.String })`) for a flat object, or lay the parent reference on top with `.annotate({ allOf: [{ $ref: '#/components/schemas/Base' }] })` when the `$ref` must appear.
- **Recursive schemas** (`Schema.suspend`) need an `identifier` on the recursive node so the generator can emit a `$ref` instead of looping.
- `OpenAPIObjectConfigV30` / `V31` / `V32` narrow `config.openapi` to the version literals when you want the compiler to pin the version.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/effect-to-openapi?tab=MIT-1-ov-file) for more information.
