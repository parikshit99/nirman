// Vite's `?raw` imports (a file's text), for tests that check repository files.
declare module '*?raw' {
  const text: string;
  export default text;
}
