import { createRequire } from 'node:module';
import type * as TS from 'typescript';

/** The TypeScript module type (used only for typing; the runtime load is dynamic). */
export type TsModule = typeof TS;

/** True when the optional `typescript` peer is resolvable from this package. */
function moduleResolves(name: string): boolean {
  try {
    createRequire(import.meta.url).resolve(name);
    return true;
  } catch {
    return false;
  }
}

/** Public probe: is the AST path available? (typescript peer installed) */
export function typescriptAvailable(): boolean {
  return moduleResolves('typescript');
}

let tsPromise: Promise<TsModule | null> | undefined;

/**
 * Loads the `typescript` peer via a non-literal dynamic import so the build never
 * resolves it statically. Cached. Returns null when the peer is absent or fails
 * to load — callers fall back to their regex path.
 */
async function loadTs(): Promise<TsModule | null> {
  if (tsPromise === undefined) {
    tsPromise = (async (): Promise<TsModule | null> => {
      if (!typescriptAvailable()) {
        return null;
      }
      try {
        const specifier = 'typescript';
        const mod = (await import(specifier)) as { default?: TsModule } & TsModule;
        return (mod.default ?? mod) as TsModule;
      } catch {
        return null;
      }
    })();
  }
  return tsPromise;
}

/** A parsed source file plus the TS module that produced it. */
export interface ParsedSource {
  ts: TsModule;
  sourceFile: TS.SourceFile;
}

function scriptKindFor(ts: TsModule, file: string): TS.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.ts') || file.endsWith('.mts') || file.endsWith('.cts'))
    return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * Parses a single source file with the TypeScript compiler API (syntax only —
 * no type-checking, no program, no file system). Returns null when the peer is
 * unavailable or the file cannot be parsed; callers fall back to regex per file.
 */
export async function parseSource(file: string, text: string): Promise<ParsedSource | null> {
  const ts = await loadTs();
  if (ts === null) {
    return null;
  }
  try {
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(ts, file),
    );
    return { ts, sourceFile };
  } catch {
    return null;
  }
}

/** A located occurrence in a source file (1-based line/column). */
export interface SourceOccurrence {
  line: number;
  column: number;
  text: string;
}

const CONSOLE_METHODS = new Set(['log', 'debug', 'error', 'warn']);

/**
 * Real `console.log|debug|error|warn` member accesses and `debugger` statements,
 * located via the AST. String- and comment-embedded occurrences are not nodes, so
 * they are never reported — the false-positive class the regex scanner could not
 * exclude.
 */
export function findConsoleAndDebugger(parsed: ParsedSource): SourceOccurrence[] {
  const { ts, sourceFile } = parsed;
  const out: SourceOccurrence[] = [];
  const loc = (node: TS.Node): { line: number; column: number } => {
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { line: pos.line + 1, column: pos.character + 1 };
  };
  const visit = (node: TS.Node): void => {
    if (ts.isDebuggerStatement(node)) {
      const { line, column } = loc(node);
      out.push({ line, column, text: 'debugger' });
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'console' &&
      CONSOLE_METHODS.has(node.name.text)
    ) {
      const { line, column } = loc(node);
      out.push({ line, column, text: `console.${node.name.text}` });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

/**
 * Every module specifier referenced by the file via the AST: static
 * import/export-from, `import type`, `import x = require('y')`, dynamic
 * `import('y')`, and `require('y')`. Non-string-literal specifiers (e.g.
 * `require(name)`) are unresolvable and intentionally omitted. Relative/absolute
 * specifiers are returned as-is; the caller maps them to package names.
 */
export function extractModuleSpecifiers(parsed: ParsedSource): string[] {
  const { ts, sourceFile } = parsed;
  const specifiers: string[] = [];
  const visit = (node: TS.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if ((isRequire || isDynamicImport) && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (arg !== undefined && ts.isStringLiteral(arg)) {
          specifiers.push(arg.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}
