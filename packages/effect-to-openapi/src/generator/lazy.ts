import type {
  MapNullableRef,
  MapNullableType,
  ReferenceObject,
  SchemaObject,
} from '../types/index.js'
import { isReferenceObject } from '../utils/index.js'

/**
 * Re-applies nullability to an already generated schema or reference.
 */
export function mapRecursive(
  schema: SchemaObject | ReferenceObject,
  mapNullableType: MapNullableType,
  mapNullableRef: MapNullableRef,
): SchemaObject | ReferenceObject {
  if (isReferenceObject(schema)) {
    return mapNullableRef(schema)
  }
  return schema.type ? { ...schema, ...mapNullableType(schema.type) } : schema
}
