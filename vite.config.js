import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  esbuild: false,
  base: '/TACTICAL-OPS/',  
  server: {
    port: 5173,
    host: true
  }
});