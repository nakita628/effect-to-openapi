import { mkdirSync, writeFileSync } from 'node:fs'

import { createRegistry, generateDocument } from 'effect-to-openapi'
import { stringify } from 'yaml'

import { info, Post, routes, User } from './schema.ts'

/**
 * Generates the OpenAPI document for every supported version and writes them to `out/`.
 *
 * Run: `pnpm -F @effect-to-openapi/test generate`
 */
const VERSIONS = ['3.0.0', '3.1.0', '3.2.0'] as const

const outDir = new URL('../out/', import.meta.url)
mkdirSync(outDir, { recursive: true })

for (const version of VERSIONS) {
  const registry = createRegistry()
  registry.register('User', User)
  registry.register('Post', Post)
  for (const route of routes) {
    registry.registerPath(route)
  }
  const document = generateDocument(registry.definitions, { openapi: version, info })
  if (!document.ok) {
    throw new Error(document.error.message)
  }
  const yaml = stringify(document.value)
  writeFileSync(new URL(`effect-to-openapi-${version}.yaml`, outDir), yaml)
  console.log(`OK   ${version}  effect-to-openapi-${version}.yaml (${yaml.length} bytes)`)
}

console.log(`\nwritten to ${outDir.pathname}`)
