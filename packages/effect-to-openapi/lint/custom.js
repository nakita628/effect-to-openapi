// Repo-specific convention plugin (an oxlint JS plugin using the alpha ESLint-compatible API).
// It reads the meaning of a declaration from the AST, which a glob cannot express. The rules are
// the structural conventions this package holds itself to:
//   custom/function-declaration a module-level function is a `function` declaration, not an
//                              anonymous function bound to a const (an annotated const keeps its
//                              contextual type and is allowed)
//   custom/predicate-is-name   a pure boolean predicate reads as a question: `is*`, `has*` or
//                              `can*` — the shape the guard modules are already written in
//   custom/type-pascal-case    a `type` alias is PascalCase
//   custom/no-let              no `let` outside a `for` statement head — every transformer here
//                              is one const expression, and that is what keeps them composable
//
// Tests are exempt from the structural rules: a test arranges and asserts imperatively when that
// is the clearest way to spell the fixture out.
const TEST_FILE = /\.test\.tsx?$/u
const PREDICATE_PREFIX = /^(is|has|can)[A-Z]/u
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/u

function filenameOf(context) {
  return context.filename ?? context.getFilename?.() ?? ''
}

function isTestPath(filename) {
  return TEST_FILE.test(filename)
}

function declarationOf(statement) {
  return statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
}

function isAnonymousFunctionInit(init) {
  return (
    init !== null &&
    init !== undefined &&
    (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
  )
}

// A function whose every `return` yields a boolean literal or a comparison — the shape a
// predicate has before anyone gives it a name.
function returnsBoolean(node) {
  if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement') {
    return isBooleanExpression(node.body)
  }
  const body = node.body
  if (body?.type !== 'BlockStatement') return false
  const returns = body.body.filter((statement) => statement.type === 'ReturnStatement')
  return returns.length > 0 && returns.every((statement) => isBooleanExpression(statement.argument))
}

function isBooleanExpression(node) {
  if (!node) return false
  if (node.type === 'Literal') return typeof node.value === 'boolean'
  if (node.type === 'UnaryExpression') return node.operator === '!'
  if (node.type === 'BinaryExpression') {
    return ['===', '!==', '==', '!=', '<', '<=', '>', '>=', 'instanceof', 'in'].includes(
      node.operator,
    )
  }
  if (node.type === 'LogicalExpression') {
    return isBooleanExpression(node.left) && isBooleanExpression(node.right)
  }
  return false
}

export default {
  meta: { name: 'custom' },
  rules: {
    'function-declaration': {
      meta: { docs: { description: 'module-level functions are function declarations' } },
      create(context) {
        if (isTestPath(filenameOf(context))) return {}
        return {
          Program(node) {
            for (const statement of node.body) {
              const declaration = declarationOf(statement)
              if (declaration?.type !== 'VariableDeclaration') continue
              for (const declarator of declaration.declarations) {
                if (declarator.id.type !== 'Identifier' || declarator.id.typeAnnotation) continue
                if (!isAnonymousFunctionInit(declarator.init)) continue
                context.report({
                  node: declarator.id,
                  message: `Declare \`${declarator.id.name}\` as \`function ${declarator.id.name}(...) { ... }\`. A named declaration reads as what it is, hoists, and shows up by name in stack traces; an anonymous function bound to a const is only warranted when the const carries a contextual type annotation.`,
                })
              }
            }
          },
        }
      },
    },
    'predicate-is-name': {
      meta: { docs: { description: 'a pure boolean predicate reads as a question' } },
      create(context) {
        if (isTestPath(filenameOf(context))) return {}
        return {
          FunctionDeclaration(node) {
            if (!node.id || PREDICATE_PREFIX.test(node.id.name) || !returnsBoolean(node)) return
            context.report({
              node: node.id,
              message: `\`${node.id.name}\` answers a yes/no question, so name it \`is\`/\`has\`/\`can\` — e.g. \`is${node.id.name[0].toUpperCase()}${node.id.name.slice(1)}\` — and the call site reads as the question it asks.`,
            })
          },
        }
      },
    },
    'type-pascal-case': {
      meta: { docs: { description: 'a type alias is PascalCase' } },
      create(context) {
        return {
          TSTypeAliasDeclaration(node) {
            if (!node.id || PASCAL_CASE.test(node.id.name)) return
            context.report({
              node: node.id,
              message: `Name the type \`${node.id.name}\` in PascalCase, the way every other type here is written.`,
            })
          },
        }
      },
    },
    'no-let': {
      meta: { docs: { description: 'no let outside a for statement head' } },
      create(context) {
        if (isTestPath(filenameOf(context))) return {}
        const forHeads = new Set()
        return {
          ForStatement(node) {
            if (node.init !== null && node.init !== undefined) forHeads.add(node.init)
          },
          VariableDeclaration(node) {
            if (node.kind === 'const' || forHeads.has(node)) return
            context.report({
              node,
              message:
                'Declare the value as one `const` expression (a ternary over the deciding condition, or an extracted function) instead of a `let` assigned later — a binding that changes over time makes the reader replay the control flow to know what it holds. A counter may live in a `for(...)` head; a genuinely imperative core states its reason on a `// oxlint-disable-next-line custom/no-let -- <why>` comment.',
            })
          },
        }
      },
    },
  },
}
