import { defineConfig } from 'vite-plus'

// oxlint-disable-next-line import/no-default-export -- Vite resolves the config through its default export
export default defineConfig({
  pack: {
    entry: {
      index: './src/index.ts',
    },
    dts: true,
    // tsdown defaults to `.mjs` / `.d.mts` for node; `exports` points at `.js` / `.d.ts`.
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**'],
      reporter: ['text', 'text-summary'],
    },
  },
  lint: {
    ignorePatterns: ['**/dist/**'],
    // Node-only package: declaring the runtime is what lets rules that resolve globals
    // (`no-undef`, `unicorn/prefer-global-this`) tell a real global apart from a typo.
    env: { node: true, es2024: true },
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add
    // import / promise / node / jsdoc.
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node', 'jsdoc'],
    // The conventions a glob cannot express (function shape, predicate naming); see lint/custom.js.
    jsPlugins: ['./lint/custom.js'],
    options: {
      typeAware: true,
      typeCheck: true,
      // A rule that stops firing must have its `oxlint-disable` comment deleted with it,
      // otherwise the suppression silently outlives its reason.
      reportUnusedDisableDirectives: 'deny',
      // Nothing here is configured as a warning; this keeps a rule that defaults to
      // `warn` from slipping through `vp check` unnoticed.
      denyWarnings: true,
    },
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    // Strict by design: exceptions live next to the code as `oxlint-disable-next-line` with a
    // reason, never as `'off'` here. A rule that does not fit this codebase at all is left out
    // of the list entirely, with a comment where it would have gone saying why.
    //
    // Rules in the correctness / suspicious / perf categories are already errors via
    // `categories` above and are not restated; this list only adds rules from the
    // pedantic / style / restriction / nursery categories, which no category enables.
    rules: {
      'custom/function-declaration': 'error',
      'custom/predicate-is-name': 'error',
      'custom/type-pascal-case': 'error',
      'custom/no-let': 'error',
      // Doc comments. The `jsdoc` plugin is off by default and enables nothing on its own, so
      // every rule is named here. Doc comments in this package are TSDoc: the type lives in the
      // signature, never in the comment, which is why `require-param-type`, `require-returns-type`
      // and `require-property-type` are deliberately left out — each one asks for the `{type}`
      // TSDoc bans, and this package's whole point is that the signature is the type.
      // `require-param` / `require-returns` are left out too: a one-line
      // `/** JSON pointer to a component schema. */` over a self-describing signature is the
      // house style, and those two would turn 103 doc blocks into `@param` boilerplate that
      // restates what the reader can already see. What stays on is the shape of a block once
      // someone writes one.
      'jsdoc/check-access': 'error',
      'jsdoc/check-property-names': 'error',
      // The default vocabulary is JSDoc's and does not know the TSDoc-only tags, so a valid
      // `@remarks` or `@typeParam` would be reported as a typo without this list.
      'jsdoc/check-tag-names': [
        'error',
        {
          definedTags: [
            'alpha',
            'beta',
            'decorator',
            'defaultValue',
            'eventProperty',
            'experimental',
            'inheritDoc',
            'label',
            'packageDocumentation',
            'privateRemarks',
            'remarks',
            'sealed',
            'typeParam',
            'virtual',
          ],
        },
      ],
      'jsdoc/empty-tags': 'error',
      'jsdoc/implements-on-classes': 'error',
      'jsdoc/no-defaults': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-property': 'error',
      'jsdoc/require-property-description': 'error',
      'jsdoc/require-property-name': 'error',
      'jsdoc/require-returns-description': 'error',
      // Paired with `env: { node: true }` above, so a global resolves and a typo does not.
      'no-undef': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-shadow': 'error',
      // Effect's AST discriminates nodes by `_tag`.
      'no-underscore-dangle': ['error', { allow: ['_tag'] }],
      'no-console': 'error',
      'no-plusplus': 'error',
      'no-await-in-loop': 'error',
      'no-unused-vars': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'typescript/no-unsafe-type-assertion': 'error',
      'typescript/no-unnecessary-type-assertion': 'error',
      'typescript/no-unnecessary-type-arguments': 'error',
      'typescript/no-floating-promises': 'error',
      'typescript/await-thenable': 'error',
      'typescript/no-misused-promises': 'error',
      'typescript/consistent-return': 'error',
      'typescript/require-await': 'error',
      'typescript/prefer-readonly': 'error',
      'typescript/prefer-nullish-coalescing': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      'typescript/no-unsafe-argument': 'error',
      'typescript/no-unsafe-assignment': 'error',
      'typescript/no-unsafe-member-access': 'error',
      'typescript/no-unsafe-call': 'error',
      'typescript/no-unsafe-return': 'error',
      'unicorn/consistent-function-scoping': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/no-array-sort': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-duplicates': 'error',
      'typescript/require-array-sort-compare': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-return-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'prefer-object-spread': 'error',
      'symbol-description': 'error',
      'typescript/no-deprecated': 'error',
      'typescript/no-base-to-string': 'error',
      'typescript/restrict-template-expressions': 'error',
      'typescript/restrict-plus-operands': 'error',
      'typescript/no-redundant-type-constituents': 'error',
      'typescript/no-duplicate-type-constituents': 'error',
      'typescript/no-unnecessary-template-expression': 'error',
      'typescript/no-unnecessary-boolean-literal-compare': 'error',
      'typescript/no-unnecessary-type-parameters': 'error',
      'typescript/no-confusing-void-expression': 'error',
      'typescript/no-for-in-array': 'error',
      'typescript/no-implied-eval': 'error',
      'typescript/no-unsafe-enum-comparison': 'error',
      'typescript/no-unsafe-unary-minus': 'error',
      'typescript/only-throw-error': 'error',
      'typescript/prefer-promise-reject-errors': 'error',
      'typescript/prefer-reduce-type-parameter': 'error',
      'typescript/prefer-includes': 'error',
      'typescript/prefer-string-starts-ends-with': 'error',
      'typescript/prefer-optional-chain': 'error',
      'typescript/use-unknown-in-catch-callback-variable': 'error',
      'typescript/unbound-method': 'error',
      'typescript/return-await': 'error',
      'unicorn/no-await-expression-member': 'error',
      'unicorn/no-useless-spread': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-set-has': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-at': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/throw-new-error': 'error',
      'import/no-default-export': 'error',
      'import/no-mutable-exports': 'error',
      'import/no-absolute-path': 'error',
      'import/no-empty-named-blocks': 'error',
      'import/no-named-as-default-member': 'error',
      'import/first': 'error',

      // --- Hardening beyond the enabled categories -------------------------
      // Everything below sits in `pedantic` / `style` / `restriction` / `nursery`, which
      // oxlint leaves off by default. Only rules reachable from this codebase are named, so
      // class / enum / namespace / DOM / React rules are deliberately absent rather than
      // enabled as dead weight.

      // Escape hatches out of the type system, and the unsound types that survive `strict`.
      'typescript/ban-ts-comment': 'error',
      'typescript/prefer-ts-expect-error': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-invalid-void-type': 'error',
      'typescript/no-non-null-asserted-nullish-coalescing': 'error',
      'typescript/non-nullable-type-assertion-style': 'error',
      'typescript/no-dynamic-delete': 'error',
      'typescript/strict-void-return': 'error',

      // Declaration style. `consistent-type-definitions: 'type'` locks in the repo-wide
      // `type X = {...}`; the default of this rule is the opposite ('interface'), so the
      // option is load-bearing, not decoration.
      'typescript/consistent-type-definitions': ['error', 'type'],
      'typescript/consistent-type-exports': 'error',
      'typescript/consistent-generic-constructors': 'error',
      'typescript/array-type': 'error',
      'typescript/method-signature-style': 'error',
      'typescript/no-inferrable-types': 'error',
      'typescript/dot-notation': 'error',
      'typescript/prefer-for-of': 'error',
      'typescript/prefer-find': 'error',
      'typescript/prefer-function-type': 'error',
      // ESM-only package: a `require` call would not survive the build.
      'typescript/no-require-imports': 'error',
      'typescript/no-import-type-side-effects': 'error',

      // Nothing here throws — every failure travels as `{ ok: false, error }` — but the rules
      // that keep a throw honest stay on so the first one that appears has to carry an Error.
      'no-throw-literal': 'error',
      'unicorn/error-message': 'error',
      'unicorn/prefer-type-error': 'error',

      // Node / ESM hygiene.
      'unicorn/prefer-module': 'error',
      'unicorn/prefer-global-this': 'error',
      'unicorn/require-module-specifiers': 'error',
      'unicorn/prefer-export-from': 'error',
      'unicorn/prefer-import-meta-properties': 'error',
      // `no-abusive-eslint-disable` pairs with `reportUnusedDisableDirectives` above: a
      // suppression must name the rule it silences and must still be earning its place.
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-anonymous-default-export': 'error',

      // String and array work: building OpenAPI objects is what this library does all day.
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-multi-str': 'error',
      'unicorn/consistent-template-literal-escape': 'error',
      'unicorn/consistent-existence-index-check': 'error',
      'unicorn/require-array-join-separator': 'error',
      'unicorn/prefer-negative-index': 'error',
      'unicorn/prefer-array-index-of': 'error',
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-object-from-entries': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/prefer-code-point': 'error',
      'unicorn/prefer-native-coercion-functions': 'error',
      'unicorn/consistent-empty-array-spread': 'error',
      'unicorn/prefer-single-call': 'error',
      'unicorn/no-useless-collection-argument': 'error',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/no-unnecessary-array-flat-depth': 'error',
      'unicorn/no-magic-array-flat-depth': 'error',
      'unicorn/no-unnecessary-slice-end': 'error',
      'unicorn/no-length-as-slice-end': 'error',
      'unicorn/no-unreadable-array-destructuring': 'error',
      'unicorn/no-immediate-mutation': 'error',

      // Regex and numbers.
      'unicorn/prefer-regexp-test': 'error',
      'prefer-regex-literals': 'error',
      'require-unicode-regexp': 'error',
      'no-div-regex': 'error',
      'no-regex-spaces': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-math-min-max': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/prefer-modern-math-apis': 'error',
      'unicorn/numeric-separators-style': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/escape-case': 'error',
      'unicorn/no-hex-escape': 'error',
      radix: 'error',
      'prefer-numeric-literals': 'error',
      'prefer-exponentiation-operator': 'error',
      // `no-implicit-coercion` is deliberately absent: its fix rewrites `!!(a && b)` to
      // `Boolean(a && b)`, and TypeScript's aliased-condition narrowing does not survive the
      // call form. The rule would trade a real type guarantee for a stylistic one.
      'unicorn/no-typeof-undefined': 'error',

      // Control flow and declarations. `curly` is `multi-line` rather than `all` so the
      // guard-clause form (`if (!x) return null` on one line) stays legal, while a body
      // that wraps onto its own line must be braced.
      curly: ['error', 'multi-line'],
      'no-useless-return': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/prefer-logical-operator-over-ternary': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/no-object-as-default-parameter': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'default-case-last': 'error',
      'default-param-last': 'error',
      'no-fallthrough': 'error',
      'no-case-declarations': 'error',
      'array-callback-return': 'error',
      'no-loop-func': 'error',
      'no-inner-declarations': 'error',
      'block-scoped-var': 'error',
      'init-declarations': 'error',
      'no-redeclare': 'error',
      'no-multi-assign': 'error',
      'no-sequences': 'error',
      'no-useless-assignment': 'error',
      'no-unreachable-loop': 'error',
      // Hoisted `function` declarations are safe to reference above their definition;
      // `const` / `class` are the TDZ hazard this rule is for.
      'no-use-before-define': ['error', { functions: false }],
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
      'arrow-body-style': 'error',
      'prefer-arrow-callback': 'error',
      'guard-for-in': 'error',
      'no-labels': 'error',
      'no-label-var': 'error',
      'no-extra-label': 'error',
      'no-lone-blocks': 'error',
      yoda: 'error',
      'no-self-compare': 'error',

      // Objects and globals.
      'object-shorthand': 'error',
      'operator-assignment': 'error',
      'prefer-object-has-own': 'error',
      'no-prototype-builtins': 'error',
      'no-object-constructor': 'error',
      'no-array-constructor': 'error',
      'no-new-wrappers': 'error',
      'unicorn/new-for-builtins': 'error',
      'prefer-rest-params': 'error',
      'no-implicit-globals': 'error',
      'no-extra-bind': 'error',
      'no-useless-computed-key': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/prefer-structured-clone': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      // The rule's default name is `error`; restating it keeps a stray `e` from
      // creeping back in.
      'unicorn/catch-error-name': ['error', { name: 'error' }],

      // Code injection surfaces (`eval` itself is already `correctness`).
      'no-script-url': 'error',
      'no-bitwise': 'error',
      // `void promise` is the marker `typescript/no-floating-promises` prescribes for a
      // deliberate fire-and-forget; `void 0` stays banned.
      'no-void': ['error', { allowAsStatement: true }],
      'no-empty': 'error',
      'no-empty-function': 'error',
      'unicode-bom': 'error',
      // `new-cap` is deliberately absent: Effect's whole schema API is PascalCase functions
      // called without `new` (`Schema.Struct(...)`, `Schema.String.check(...)`), so the rule
      // would flag every schema in the codebase and its tests.
      // A parked TODO is debt that belongs in an issue, not in the source.
      'no-warning-comments': 'error',
      // A `${...}` inside a single-quoted string is almost always a template literal that
      // lost its backticks — a real hazard when half the strings here are JSON pointers.
      'no-template-curly-in-string': 'error',

      // promise / node rules sit outside the enabled categories. This package is fully
      // synchronous, so the list is what keeps the first async code that arrives honest.
      'promise/param-names': 'error',
      'promise/valid-params': 'error',
      'promise/spec-only': 'error',
      'promise/no-new-statics': 'error',
      'promise/no-multiple-resolved': 'error',
      'promise/no-return-wrap': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/no-nesting': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/catch-or-return': 'error',
      'promise/always-return': 'error',
      'promise/prefer-catch': 'error',
      'promise/prefer-await-to-then': 'error',
      'node/no-exports-assign': 'error',
      'node/no-new-require': 'error',
      'node/no-mixed-requires': 'error',
      'node/global-require': 'error',
      'node/no-path-concat': 'error',
      'node/handle-callback-err': 'error',
      'node/callback-return': 'error',
      // A zero-dependency library has no reason to reach for the runtime: `node:` imports
      // would make it unusable in a browser or worker.
      'node/no-top-level-await': 'error',

      // Module graph. `extensions` keeps relative specifiers `.js`-suffixed, which
      // NodeNext resolution requires at runtime and `tsc` does not check.
      'import/extensions': ['error', 'always', { ignorePackages: true }],
      'import/export': 'error',
      'import/unambiguous': 'error',
      'import/no-commonjs': 'error',
      'import/no-named-default': 'error',
      'import/no-unassigned-import': 'error',
      'import/no-named-as-default': 'error',
      'import/no-anonymous-default-export': 'error',
      'import/consistent-type-specifier-style': 'error',
      // Naming: the identifiers a reader scans first.
      'no-shadow-restricted-names': 'error',
      'no-delete-var': 'error',
      'unicorn/filename-case': 'error',
    },
    // Architecture rules for src: each directory may import only the siblings listed in its
    // message. Dependency direction is one-way:
    //   utils / openapi / errors (leaves) → types (re-exports the openapi model)
    //     → ast (Effect Schema AST readers) → metadata / specifics
    //     → generator (per-schema-type transformers, pure)
    //     → helper (composition with the generation context; the sub-layers are one-way as
    //       well: schema → parameter → route → components)
    //
    // One shape for every directory: `<dir>/index.ts` is the only entry an outside module names,
    // and a directory with more than one file makes that entry a barrel (`export *`). Inside a
    // directory the siblings name each other's files directly — routing them through the barrel
    // collapses the one-way order into a cycle, which `import/no-cycle` reports, so the rule is
    // stated per directory below.
    //     → core (public entry points)
    overrides: [
      {
        files: ['src/utils/**', 'src/openapi/**', 'src/errors/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^\\.\\./',
                  message: 'leaf module: no project-internal imports allowed',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/types/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(core|generator|ast|helper|metadata|specifics|utils)(/.*)?$',
                  message: 'types may only import openapi, errors',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/ast/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(core|errors|generator|helper|metadata|specifics)(/.*)?$',
                  message: 'ast may only import utils, types',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/metadata/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(core|errors|generator|helper|specifics)(/.*)?$',
                  message: 'metadata may only import utils, ast, types',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/specifics/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(core|errors|generator|ast|helper|metadata)(/.*)?$',
                  message: 'specifics may only import utils, types',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/generator/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(core|helper)(/.*)?$',
                  message:
                    'generator may only import utils, ast, types, errors, metadata, specifics',
                },
                {
                  regex: '^\\./index(\\.js)?$',
                  message:
                    'inside a directory, import the sibling module directly: going through the barrel turns the one-way order into a cycle',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/helper/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(core)(/.*)?$',
                  message:
                    'helper may only import utils, ast, types, errors, metadata, specifics, generator',
                },
                {
                  regex: '^\\./index(\\.js)?$',
                  message:
                    'inside a directory, import the sibling module directly: going through the barrel turns the one-way order into a cycle',
                },
              ],
            },
          ],
        },
      },
      {
        // The convention plugin is an oxlint JS plugin: it walks an untyped ESTree and its
        // contract with oxlint is a default export.
        files: ['lint/**'],
        rules: {
          'import/no-default-export': 'off',
          'import/no-anonymous-default-export': 'off',
          'typescript/no-unsafe-argument': 'off',
          'typescript/no-unsafe-assignment': 'off',
          'typescript/no-unsafe-call': 'off',
          'typescript/no-unsafe-member-access': 'off',
          'typescript/no-unsafe-return': 'off',
        },
      },
      {
        // Test files may cast and use `any` (CLAUDE.md 型安全 #1); the type-safety rules that
        // exist only to police those casts are scoped off here, nothing else is.
        files: ['**/*.test.ts'],
        plugins: ['vitest'],
        rules: {
          'no-restricted-imports': 'off',
          'typescript/no-explicit-any': 'off',
          'typescript/consistent-type-assertions': 'off',
          'typescript/no-unsafe-type-assertion': 'off',
          'typescript/no-unsafe-argument': 'off',
          'typescript/no-unsafe-assignment': 'off',
          'typescript/no-unsafe-member-access': 'off',
          'typescript/no-unsafe-call': 'off',
          'typescript/no-unsafe-return': 'off',
          'unicorn/no-array-sort': 'off',
          // A test spells its fixture out imperatively when that is clearest; the structural
          // rules describe `src`, not the suite.
          'custom/function-declaration': 'off',
          'custom/predicate-is-name': 'off',
          'custom/no-let': 'off',
          // A `let` declared per suite and assigned in a hook is the shape of a fixture,
          // not an uninitialized binding waiting to bite.
          'init-declarations': 'off',
          // Stub callbacks (`() => {}` handed to a getter or a spy) are the point.
          'no-empty-function': 'off',
          // Assertions nest a narrowing `if` inside a guard, which reads as a lonely `if`
          // while spelling out the case under test.
          'unicorn/no-lonely-if': 'off',
          // Fixtures assert on `pattern` strings that contain a literal `${...}`; there that
          // is the value under test, not a lost backtick.
          'no-template-curly-in-string': 'off',
          'vitest/no-focused-tests': 'error',
          'vitest/no-disabled-tests': 'error',
          'vitest/no-commented-out-tests': 'error',
          'vitest/expect-expect': 'error',
          'vitest/require-mock-type-parameters': 'error',
          'vitest/no-identical-title': 'error',
          'vitest/valid-expect': 'error',
          'vitest/valid-title': 'error',
          'vitest/valid-describe-callback': 'error',
          // An `expect` outside a test case is never run and never reported.
          'vitest/no-standalone-expect': 'error',
          'vitest/no-conditional-expect': 'error',
          'vitest/no-test-return-statement': 'error',
          'vitest/no-test-prefixes': 'error',
          'vitest/no-duplicate-hooks': 'error',
          'vitest/prefer-hooks-on-top': 'error',
          'vitest/prefer-hooks-in-order': 'error',
          'vitest/consistent-test-it': 'error',
          'vitest/no-alias-methods': 'error',
          'vitest/prefer-equality-matcher': 'error',
          'vitest/prefer-strict-equal': 'error',
          'vitest/require-to-throw-message': 'error',
          'vitest/prefer-each': 'error',
          'vitest/prefer-spy-on': 'error',
          'vitest/no-mocks-import': 'error',
          // Snapshots are a partial-match assertion by another name, so they are kept small
          // and literal where they appear at all.
          'vitest/no-interpolation-in-snapshots': 'error',
          'vitest/no-large-snapshots': 'error',
        },
      },
    ],
  },
  // Style (printWidth / quotes / semicolons / import sorting) is inherited from the root
  // vite.config.ts; only the paths this workspace skips are declared here.
  fmt: {
    ignorePatterns: ['**/node_modules/**', '**/dist/**'],
  },
})
