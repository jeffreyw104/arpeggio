// Verovio does not ship TypeScript declarations for its `wasm` / `esm`
// subpath entry points. These ambient declarations let the dynamic imports
// in `score-view/verovio.ts` type as `any` (the app narrows them via the
// `VerovioToolkit` interface). Do not install `@types/verovio` — it does not
// exist.
declare module "verovio/wasm";
declare module "verovio/esm";
