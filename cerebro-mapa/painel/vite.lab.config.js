// LAB (22/10): build so da pagina de teste lab.html em dist-lab/ (nao e o build do painel).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/anuncios/',
  plugins: [react()],
  build: { outDir: 'dist-lab', emptyOutDir: true, rollupOptions: { input: 'lab.html' } },
})
