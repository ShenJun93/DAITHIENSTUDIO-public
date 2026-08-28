// Ambient module declaration for Vite's built-in `?raw` import suffix
// (used by tests to inspect a component's own source text without node:fs,
// which is off-limits outside src/infrastructure/**/scripts/**).
declare module '*?raw' {
  const content: string;
  export default content;
}
