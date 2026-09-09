import { defineConfig } from 'vite'

// Relative base so the exported build runs from any static host or subfolder.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
})
