import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: [
    './src/infrastructure/db/schema.ts',
    './src/infrastructure/db/projectProductionTypes.ts',
  ],
  out: './src/infrastructure/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? './data/studio.db' },
  strict: true,
  verbose: true,
});
