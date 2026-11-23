// Loads the repo's TypeScript in the browser, unchanged at the source: fetches
// the .ts files, strips their types and bundles them with esbuild (WebAssembly)
// in this page, then imports the result. Nothing is built ahead of time; no
// server does any work. (A service worker would be lighter, but the Claude
// desktop app's browser pane refuses service workers.)
import * as esbuild from '/node_modules/esbuild-wasm/esm/browser.min.js';

let ready;
const init = () => (ready ??= esbuild.initialize({ wasmURL: '/node_modules/esbuild-wasm/esbuild.wasm', worker: false }));

export async function importTs(entry) {
  await init();
  const t0 = performance.now();
  const files = [];
  const result = await esbuild.build({
    entryPoints: [new URL(entry, location.href).href],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    logLevel: 'silent',
    plugins: [
      {
        name: 'fetch',
        setup(build) {
          build.onResolve({ filter: /.*/ }, args => ({ path: new URL(args.path, args.importer || location.href).href, namespace: 'fetch' }));
          build.onLoad({ filter: /.*/, namespace: 'fetch' }, async args => {
            const res = await fetch(args.path);
            if (!res.ok) throw new Error(`${args.path}: ${res.status}`);
            files.push(new URL(args.path).pathname);
            return { contents: await res.text(), loader: 'ts' };
          });
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  const mod = await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  return { mod, files, ms: Math.round(performance.now() - t0) };
}
