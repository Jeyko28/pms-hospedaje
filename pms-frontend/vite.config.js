import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El frontend corre en el puerto 5173 (el que la API ya autoriza en CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
