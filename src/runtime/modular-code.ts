import ts from 'typescript';
import { join, posix, resolve } from 'node:path';
import type { ArtifactReference, TaskContract } from '../contracts/types.ts';

export const MODULE_SLOTS = ['a', 'b'] as const;
export type ModuleSlot = typeof MODULE_SLOTS[number];
export const MODULE_CONTRACTS = '_cosmos/module-contracts.d.ts';
export const moduleInterface = (slot: ModuleSlot) => slot === 'a' ? 'ModuleA' : 'ModuleB';
export const moduleSource = (slot: ModuleSlot) => `authors/code-${slot}`;
export const moduleDirectory = (slot: ModuleSlot) => `src/modules/${slot}`;
export const moduleSlot = (task: Pick<TaskContract, 'acceptanceIds'>): ModuleSlot | undefined => task.acceptanceIds.length === 1
  ? task.acceptanceIds[0] === 'COSMOS-MODULE-A' ? 'a' : task.acceptanceIds[0] === 'COSMOS-MODULE-B' ? 'b' : undefined : undefined;
export interface ModularCompilerInputs {
  slot: ModuleSlot | 'integration'; contracts: { directory: string; ref: ArtifactReference; sha256: string };
  modules?: { slot: ModuleSlot; directory: string; ref: ArtifactReference; signature: string }[];
}

/** Source-owned declaration subset, never executable design code or a model-provided compiler entry. */
export function validateModuleContracts(text: string): void {
  const fail = (): never => { throw new Error('Module contracts require exactly exported ModuleA/ModuleB interfaces with required callable values and concrete types.'); };
  if (typeof text !== 'string' || !text.trim() || text.length > 16000) fail();
  const source = ts.createSourceFile(MODULE_CONTRACTS, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if ((source as any).parseDiagnostics.length || source.statements.length !== 2) fail();
  for (const [index, statement] of source.statements.entries()) {
    if (!ts.isInterfaceDeclaration(statement)) return fail();
    if (statement.name.text !== moduleInterface(MODULE_SLOTS[index]) || statement.typeParameters?.length
      || statement.heritageClauses?.length || statement.modifiers?.length !== 1 || statement.modifiers[0].kind !== ts.SyntaxKind.ExportKeyword || !statement.members.length) fail();
    for (const member of statement.members) {
      if (!ts.isMethodSignature(member) || member.questionToken || member.typeParameters?.length || !member.type || !ts.isIdentifier(member.name)
        || Object.getOwnPropertyNames(Object.prototype).includes(member.name.getText(source))
        || member.parameters.some(parameter => !parameter.type || parameter.questionToken || parameter.dotDotDotToken || parameter.initializer)) fail();
    }
  }
  const visit = (node: ts.Node): void => {
    if ([ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.NeverKeyword].includes(node.kind)
      || ts.isIndexSignatureDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isConditionalTypeNode(node) || ts.isMappedTypeNode(node)
      || ts.isImportTypeNode(node) || ts.isTypeQueryNode(node) || ts.isTypeReferenceNode(node) && !['Array', 'ReadonlyArray', 'ModuleA', 'ModuleB'].includes(node.typeName.getText(source))
      || ts.isTypeLiteralNode(node) && !node.members.length
      || ts.isPropertySignature(node) && !!node.questionToken || ts.isFunctionTypeNode(node) && node.parameters.some(parameter => !parameter.type || parameter.questionToken)) fail();
    ts.forEachChild(node, visit);
  };
  visit(source);
}
export function moduleProbe(slot: ModuleSlot): string {
  if (!MODULE_SLOTS.includes(slot)) throw new Error('Unknown module compiler slot.');
  return `import type { ${moduleInterface(slot)} } from '../${MODULE_CONTRACTS.replace(/\.d\.ts$/, '')}';\nimport * as actual from './modules/${slot}/index';\nconst contract: ${moduleInterface(slot)} = actual;\nvoid contract;\n`;
}
export function validateModuleFiles(source: Map<string, Buffer>, slot: ModuleSlot): void {
  const prefix = moduleDirectory(slot);
  if (!source.has(`${prefix}/index.ts`) || [...source.keys()].some(name => !name.startsWith(prefix + '/') || !name.endsWith('.ts') || name.endsWith('.d.ts'))) throw new Error('Module output must contain its own actual index.ts and only its fixed source directory.');
  for (const [name, bytes] of source) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), ast = ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true);
    const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, text);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) if ([ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token)
      && /@ts-(ignore|nocheck|expect-error)\b/.test(scanner.getTokenText())) throw new Error('Module compile evidence cannot suppress compiler checks.');
    if (ast.referencedFiles.length || ast.typeReferenceDirectives.length || ast.libReferenceDirectives.length) throw new Error('Module compiler inputs cannot add external references.');
    const importPath = (value: string) => {
      const target = posix.normalize(posix.join(posix.dirname(name), value));
      if (value !== 'phaser' && (!value.startsWith('.') || !(target.startsWith(prefix + '/') || target === MODULE_CONTRACTS.replace(/\.d\.ts$/, '')))) throw new Error('Module import is outside its fixed source and interface scope.');
    };
    const visit = (node: ts.Node): void => {
      if (ts.isModuleDeclaration(node)) throw new Error('Module source cannot replace protected declarations.');
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error('Module import must be static.');
        importPath(node.moduleSpecifier.text);
      }
      if (ts.isImportTypeNode(node)) { if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) throw new Error('Module type import must be static.'); importPath(node.argument.literal.text); }
      if (ts.isExternalModuleReference(node)) { if (!ts.isStringLiteral(node.expression)) throw new Error('Module require import must be static.'); importPath(node.expression.text); }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error('Module source cannot add dynamic compiler inputs.');
      ts.forEachChild(node, visit);
    }; visit(ast);
  }
}
/** Inspect actual value exports with the same installed compiler used by the owned worker. */
export function validateModuleProgram(project: string, slot: ModuleSlot, compiler: typeof ts = ts): string[] {
  const config = compiler.readConfigFile(join(project, 'tsconfig.json'), compiler.sys.readFile);
  const parsed = compiler.parseJsonConfigFileContent(config.config, compiler.sys, project);
  if (config.error || parsed.errors.length) throw new Error('Module compiler configuration is invalid.');
  const program = compiler.createProgram(parsed.fileNames, parsed.options), checker = program.getTypeChecker();
  const source = program.getSourceFile(resolve(project, moduleDirectory(slot), 'index.ts')), contracts = program.getSourceFile(resolve(project, MODULE_CONTRACTS));
  if (!source || !contracts) throw new Error('Actual module or protected declaration was not compiled.');
  const declaration = contracts.statements.find(node => compiler.isInterfaceDeclaration(node) && node.name.text === moduleInterface(slot)) as ts.InterfaceDeclaration | undefined;
  const symbol = checker.getSymbolAtLocation(source);
  if (!declaration || !symbol) throw new Error('Actual module namespace has no required value exports.');
  const exports = checker.getExportsOfModule(symbol), keys: string[] = [];
  const weak = (type: ts.Type, seen = new Set<ts.Type>(), depth = 0): boolean => {
    if (type.flags & (compiler.TypeFlags.Any | compiler.TypeFlags.Unknown)) return true;
    if (seen.has(type)) return false; seen.add(type);
    if (depth > 12) throw new Error('Module public types exceed the bounded interface subset.');
    if (type.isUnionOrIntersection()) return type.types.some(value => weak(value, seen, depth + 1));
    if (!(type.flags & compiler.TypeFlags.Object)) return false;
    if (checker.isArrayType(type) || checker.isTupleType(type)) return checker.getTypeArguments(type as ts.TypeReference).some(value => weak(value, seen, depth + 1));
    for (const kind of [compiler.IndexKind.String, compiler.IndexKind.Number]) { const indexed = checker.getIndexTypeOfType(type, kind); if (indexed && weak(indexed, seen, depth + 1)) return true; }
    const signatures = type.getCallSignatures();
    if (signatures.length) return signatures.some(signature => weak(signature.getReturnType(), seen, depth + 1)
      || signature.parameters.some(parameter => weak(checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration ?? source), seen, depth + 1)));
    return type.getProperties().some(property => weak(checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration ?? source), seen, depth + 1));
  };
  for (const member of declaration.members) {
    const name = (member.name as ts.Identifier).text, exported = exports.find(value => value.name === name);
    if (!exported || exported.declarations?.some(node => compiler.isExportSpecifier(node) && (node.isTypeOnly || (node.parent.parent as ts.ExportDeclaration).isTypeOnly))) throw new Error(`Module ${slot} lacks callable value export ${name}.`);
    const target = exported.flags & compiler.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const type = checker.getTypeOfSymbolAtLocation(target, target.valueDeclaration ?? source);
    if (!(target.flags & compiler.SymbolFlags.Value) || !type.getCallSignatures().length || weak(type)) throw new Error(`Module ${slot} export ${name} is not a concrete callable value.`);
    keys.push(name);
  }
  return keys;
}
