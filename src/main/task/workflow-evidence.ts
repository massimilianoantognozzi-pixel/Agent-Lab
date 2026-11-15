import path from 'node:path';

import * as ts from 'typescript';

import { readDevelopmentFiles } from './workflow-development';
import { validateWorkflowPath, type WorkflowFiles, type WorkflowProject } from './workflow-policy';

const moduleExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const sourceExtensions = new Set(moduleExtensions.filter((extension) => extension !== '.json'));

const staticModuleReferences = (file: string, content: string): Set<string> | undefined => {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const references = new Set<string>();
  const recordRequire = (callee: ts.Expression): boolean => {
    const call = callee.parent;
    if (!ts.isCallExpression(call) || call.expression !== callee || !call.arguments[0] || !ts.isStringLiteralLike(call.arguments[0])) {
      return true;
    }
    references.add(call.arguments[0].text);
    return false;
  };
  const visit = (node: ts.Node): boolean | undefined => {
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      return true;
    }
    if (ts.isIdentifier(node) && node.text === 'require') {
      const parent = node.parent;
      if ((ts.isPropertySignature(parent) || ts.isMethodSignature(parent) || ts.isPropertyAssignment(parent)) && parent.name === node) {
        return;
      }
      return recordRequire(ts.isPropertyAccessExpression(parent) && parent.name === node ? parent : node);
    }
    if (ts.isElementAccessExpression(node)) {
      const property = node.argumentExpression;
      if (ts.isStringLiteralLike(property)) {
        if (property.text === 'require' && recordRequire(node)) {
          return true;
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'module') {
        return true;
      }
    }
    if (ts.isCallExpression(node)) {
      const target = node.expression;
      if (target.kind === ts.SyntaxKind.ImportKeyword && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]))) {
        return true;
      }
      if (ts.isIdentifier(target) && (target.text === 'fetch' || target.text === 'eval')) {
        return true;
      }
    }
    return ts.forEachChild(node, visit);
  };
  if (ts.forEachChild(source, visit)) {
    return undefined;
  }
  const scan = ts.preProcessFile(content, true, true);
  for (const { fileName } of [...scan.importedFiles, ...scan.referencedFiles, ...scan.typeReferenceDirectives]) {
    references.add(fileName);
  }
  return references;
};

const candidatesFor = (source: string, specifier: string): string[] => {
  const resolved = path.posix.join(path.posix.dirname(source), specifier);
  const extension = path.posix.extname(resolved);
  if (!extension) {
    return [
      resolved,
      ...moduleExtensions.map((item) => resolved + item),
      ...moduleExtensions.map((item) => path.posix.join(resolved, 'index' + item)),
      path.posix.join(resolved, 'package.json'),
    ];
  }
  const substitutions: Record<string, string[]> = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };
  return [resolved, ...(substitutions[extension] ?? []).map((item) => resolved.slice(0, -extension.length) + item)];
};

export const isStandaloneVisualPath = (file: string): boolean => /\.(?:html?|css|scss|sass|less|styl|vue|svelte|astro|svg|mdx)$/i.test(file);

const isVisualSource = (file: string, content: string | null | undefined): boolean => {
  if (isStandaloneVisualPath(file)) {
    return true;
  }
  if (!content || !sourceExtensions.has(path.posix.extname(file).toLowerCase())) {
    return false;
  }
  const markup = /\.[jt]sx$/i.test(file) || /<\s*(?:[$_\p{ID_Start}]|>)/u.test(content);
  const componentCalls = /\b(?:createElement(?:NS)?|querySelector(?:All)?|getElementById|addEventListener)\b/.test(content);
  if (!markup && !componentCalls) {
    return false;
  }
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, false);
  const reactNamespaces = new Set(['React']);
  const reactFactories = new Set<string>();
  for (const item of source.statements) {
    if (!ts.isImportDeclaration(item) || !ts.isStringLiteral(item.moduleSpecifier) || item.moduleSpecifier.text !== 'react' || !item.importClause) {
      continue;
    }
    const { name, namedBindings } = item.importClause;
    if (name) {
      reactNamespaces.add(name.text);
    }
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      reactNamespaces.add(namedBindings.name.text);
    } else if (namedBindings) {
      for (const entry of namedBindings.elements) {
        if ((entry.propertyName ?? entry.name).text === 'createElement') {
          reactFactories.add(entry.name.text);
        }
      }
    }
  }
  const search = (node: ts.Node): true | undefined => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      return true;
    }
    if (componentCalls && ts.isCallExpression(node)) {
      const target = node.expression;
      if (ts.isIdentifier(target) && reactFactories.has(target.text)) {
        return true;
      }
      if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)) {
        const receiver = target.expression.text;
        const method = target.name.text;
        if (
          (reactNamespaces.has(receiver) && method === 'createElement') ||
          (receiver === 'document' && /^(?:createElement(?:NS)?|querySelector(?:All)?|getElementById|addEventListener)$/.test(method)) ||
          (receiver === 'window' && method === 'addEventListener')
        ) {
          return true;
        }
      }
    }
    return ts.forEachChild(node, search);
  };
  return Boolean(ts.forEachChild(source, search));
};

export const visualSourceKey = (file: string): string => (process.platform === 'win32' ? file.toLowerCase() : file);
const extensionFor = (file: string) => path.posix.extname(file).toLowerCase();
export const isVisualInput = (file: string): boolean => moduleExtensions.includes(extensionFor(file)) || isStandaloneVisualPath(file);

export type VisualSourceScope = { paths: string[]; roots: string[]; uncertain: boolean; importers: Record<string, string[]> };

export const visualSourceScope = (files: WorkflowFiles): VisualSourceScope => {
  const names = Object.keys(files);
  const byKey = new Map(names.map((file) => [visualSourceKey(file), file]));
  const aliases = names
    .filter((file) => /(?:^|\/)(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json$/i.test(file))
    .flatMap((file) => {
      const content = files[file];
      if (typeof content !== 'string') {
        return [];
      }
      const options: { paths?: Record<string, string[]> } | undefined = ts.parseConfigFileTextToJson(file, content).config?.compilerOptions;
      return Object.keys(options?.paths ?? {});
    });
  const visual = names.filter((file) => isVisualSource(file, files[file]));
  const paths = new Set(visual.map(visualSourceKey));
  const pending = visual.filter((file) => sourceExtensions.has(extensionFor(file)));
  const visited = new Set<string>();
  const importers = new Map<string, string[]>();
  let uncertain = visual.some((file) => /\.(?:html?|vue|svelte|astro|mdx)$/i.test(file));
  for (const file of pending) {
    if (visited.has(file)) {
      continue;
    }
    visited.add(file);
    const content = files[file];
    const references = typeof content === 'string' ? staticModuleReferences(file, content) : undefined;
    if (!references) {
      uncertain = true;
      continue;
    }
    for (const specifier of references) {
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        uncertain ||=
          /^(?:[@~]\/|#)/.test(specifier) ||
          aliases.some((alias) => {
            const wildcard = alias.indexOf('*');
            return wildcard < 0 ? alias === specifier : specifier.startsWith(alias.slice(0, wildcard)) && specifier.endsWith(alias.slice(wildcard + 1));
          });
        continue;
      }
      for (const candidate of candidatesFor(file, specifier)) {
        const key = visualSourceKey(candidate);
        paths.add(key);
        const actual = byKey.get(key);
        if (actual) {
          const parents = importers.get(key) ?? [];
          parents.push(file);
          importers.set(key, parents);
        }
        if (actual && sourceExtensions.has(extensionFor(actual))) {
          pending.push(actual);
        }
      }
    }
  }
  return { paths: [...paths], roots: visual, uncertain, importers: Object.fromEntries(importers) };
};

export const visualPathsAffected = (paths: string[], ...scopes: VisualSourceScope[]): string[] => {
  const related = new Set(scopes.flatMap((scope) => scope.paths));
  const uncertain = scopes.some((scope) => scope.uncertain);
  return paths.filter((file) => related.has(visualSourceKey(file)) || (uncertain && isVisualInput(file)));
};

export const hasVisualWorkflowImpact = (before: WorkflowFiles, after: WorkflowFiles, paths: string[]): boolean =>
  paths.some((file) => isVisualSource(file, before[file]) || isVisualSource(file, after[file])) ||
  (paths.some(isVisualInput) && visualPathsAffected(paths, visualSourceScope(before), visualSourceScope(after)).length > 0);

// An exclusion can be reused only while the configured sources have a
// readable local module closure that does not reference the excluded path.
export const unverifiedEvidenceExclusions = async (
  policy: WorkflowProject,
  head: string,
  inputs: Set<string>,
  exclusions: string[],
  signal?: AbortSignal,
): Promise<string[]> => {
  const sources = [...inputs].filter((file) => sourceExtensions.has(path.posix.extname(file)));
  if (!sources.length) {
    return exclusions;
  }
  const pending = [...sources];
  const visited = new Set<string>();
  const contents = new Map<string, string | null>();
  const involved = new Set<string>();
  const excluded = new Set(exclusions);
  let size = 0;
  const read = async (files: string[]) => {
    const missing = files.filter((file) => !contents.has(file));
    if (missing.length) {
      if (contents.size + missing.length > 512) {
        throw new Error('Perimetro della prova troppo esteso per riesaminare le esclusioni.');
      }
      const snapshot = await readDevelopmentFiles(
        { ...policy, references: [], context: [], editable: [], workPlan: undefined, optionalInputs: missing.map(validateWorkflowPath) },
        head,
        signal,
      );
      for (const [file, content] of Object.entries(snapshot)) {
        size += content?.length ?? 0;
        if (size > 900_000) {
          throw new Error('Perimetro della prova troppo esteso per riesaminare le esclusioni.');
        }
        contents.set(file, content);
      }
    }
  };

  try {
    await read(pending);
    for (const file of pending) {
      signal?.throwIfAborted();
      if (visited.has(file)) {
        continue;
      }
      visited.add(file);
      const content = contents.get(file);
      if (visited.size > 128 || content === null || content === undefined) {
        return exclusions;
      }
      const references = staticModuleReferences(file, content);
      if (!references) {
        return exclusions;
      }
      for (const specifier of references) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          return exclusions;
        }
        const candidates = candidatesFor(file, specifier);
        for (const candidate of candidates) {
          if (excluded.has(candidate)) {
            involved.add(candidate);
          }
        }
        await read(candidates);
        const resolved = candidates.filter((candidate) => typeof contents.get(candidate) === 'string');
        if (resolved.length !== 1 || resolved.some((candidate) => !moduleExtensions.includes(path.posix.extname(candidate)))) {
          return exclusions;
        }
        pending.push(...resolved.filter((candidate) => sourceExtensions.has(path.posix.extname(candidate))));
      }
    }
  } catch {
    signal?.throwIfAborted();
    return exclusions;
  }
  return [...involved];
};
