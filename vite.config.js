import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    // exceljs (~940 kB) is lazy-loaded by the owner's report tab only
    chunkSizeWarningLimit: 1000,
  },
  // `npm run dev:mock`: click through every screen with an in-memory fake Supabase
  ...(mode === 'mock' && {
    resolve: { alias: { '@supabase/supabase-js': fileURLToPath(new URL('./tests/mock-supabase.js', import.meta.url)) } },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://mock'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('mock'),
      'import.meta.env.VITE_PROMPTPAY_ID': JSON.stringify('0812345678'),
    },
  }),
}))
