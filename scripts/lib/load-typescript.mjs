// Node-only verification helper; production uses Next.js module compilation.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

export function typescriptLoader(stubs = {}, globals = {}) {
  const require = createRequire(import.meta.url), cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} }; cache.set(file, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { process, console, AbortSignal, URL, ReadableStream, TransformStream, fetch, Buffer, setTimeout, clearTimeout, ...globals, module: loadedModule, exports: loadedModule.exports, require(name) {
      if (name === "server-only") return {};
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
      return require(name);
    } }, { filename: file });
    return loadedModule.exports;
  }
  return load;
}
