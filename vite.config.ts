import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Identificação desta publicação: o app compara com /version.json para avisar quem está com a versão antiga aberta.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());
const versionFile = (): Plugin => ({
  name: "version-file",
  generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) }); },
});

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "::",
    port: 8080,
  },
});
