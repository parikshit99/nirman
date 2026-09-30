import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/migrate-cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  // Bundle the workspace package (it ships TypeScript source); keep real deps external.
  noExternal: [/^@nirman\//],
});
