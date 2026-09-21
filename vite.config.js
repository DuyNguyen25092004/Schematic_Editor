import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Schematic_Editor/', // <-- PHẢI CÓ DÒNG NÀY VÀ PHẢI CHÍNH XÁC TỪNG CHỮ
})