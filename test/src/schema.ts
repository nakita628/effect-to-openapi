import { Schema } from 'effect'

export const User = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(50)),
  email: Schema.String.check(Schema.isPattern(/^[^@]+@[^@]+$/u)).annotate({ format: 'email' }),
  age: Schema.optional(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  role: Schema.optional(Schema.Literals(['admin', 'member'])).annotate({ default: 'member' }),
}).annotate({ identifier: 'User', description: 'A registered user' })

export const Post = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  title: Schema.NonEmptyString,
  body: Schema.NullOr(Schema.String),
  author: User,
  tags: Schema.Array(Schema.String),
  publishedAt: Schema.optional(Schema.Date),
}).annotate({ identifier: 'Post' })

export const routes = [
  {
    method: 'get',
    path: '/users/{id}',
    operationId: 'getUser',
    request: { params: Schema.Struct({ id: Schema.String.check(Schema.isUUID()) }) },
    responses: {
      200: { description: 'The user', content: { 'application/json': { schema: User } } },
      404: { description: 'Not found' },
    },
  },
  {
    method: 'get',
    path: '/posts',
    operationId: 'listPosts',
    request: {
      query: Schema.Struct({
        limit: Schema.optional(
          Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })),
        ),
        tag: Schema.optional(Schema.String),
      }),
    },
    responses: {
      200: {
        description: 'Posts',
        content: { 'application/json': { schema: Schema.Array(Post) } },
      },
    },
  },
  {
    method: 'post',
    path: '/posts',
    operationId: 'createPost',
    request: { body: { required: true, content: { 'application/json': { schema: Post } } } },
    responses: { 201: { description: 'Created' } },
  },
] as const

export const info = { title: 'Simple API', version: '1.0.0' } as const
