import { defineConfig } from 'vite'

/** Where the rooms are while developing: npm start, in another terminal. */
const GAME_SERVER = process.env.GAME_SERVER ?? 'http://localhost:8080'

// Relative base so the exported build runs from any static host or subfolder.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  server: {
    // In production one process serves both the page and the rooms, so the
    // client just upgrades its own origin. Vite serves only the page, so the
    // socket and the lobby are proxied through to the room server and the
    // client needs no idea which of the two it is talking to.
    proxy: {
      '/ws': { target: GAME_SERVER, ws: true },
      '/api': { target: GAME_SERVER, changeOrigin: true },
    },
  },
})
