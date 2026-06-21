import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

function pdfjsAssets(): Plugin {
  const sourceRoot = resolve('node_modules/pdfjs-dist')
  const groups = ['cmaps', 'standard_fonts', 'wasm']

  return {
    name: 'pdfjs-assets',
    buildStart() {
      for (const group of groups) {
        const directory = resolve(sourceRoot, group)
        for (const file of readdirSync(directory)) {
          const source = resolve(directory, file)
          if (!statSync(source).isFile()) continue
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${group}/${file}`,
            source: readFileSync(source),
          })
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = decodeURIComponent((request.url ?? '').split('?')[0])
        if (!pathname.startsWith('/pdfjs/')) return next()
        const relativePath = pathname.slice('/pdfjs/'.length)
        const source = resolve(sourceRoot, relativePath)
        if (!source.startsWith(sourceRoot) || !existsSync(source) || !statSync(source).isFile()) return next()
        response.setHeader('Content-Type', source.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        createReadStream(source).pipe(response)
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    pdfjsAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Deutsch PDF Study',
        short_name: 'Deutsch PDF',
        description: 'Local-first German PDF reader with fast iPad annotations.',
        theme_color: '#f6f3ea',
        background_color: '#f6f3ea',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: './icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: './icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,bcmap,pfb,ttf,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
})
