import { defineConfig } from "vite";

// In development the browser talks to Vite (port 5173) only. Vite forwards the
// Socket.IO traffic to the game server (port 3000), so the game also works from
// other devices on your network without any extra configuration.
const SERVER = process.env.PD_SERVER_URL || "http://localhost:3000";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/socket.io": { target: SERVER, ws: true, changeOrigin: true }
    }
  }
});
