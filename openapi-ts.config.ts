import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi/openapi.json',
  output: './packages/api/src/generated',
  plugins: [
    { name: '@hey-api/client-fetch' },
    '@hey-api/typescript',
    { name: '@hey-api/sdk', client: '@hey-api/client-fetch' }
  ]
});
