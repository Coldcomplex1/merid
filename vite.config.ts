import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'

// Two builds come out of this config:
//
//   vite build                                  the SPA, into dist/
//   vite build --ssr src/blog/entry-server.tsx  the blog renderer, into .blog-ssr/
//
// The second one is loaded by scripts/prerender.mjs, which turns every published
// post into a static HTML file. Nothing about the SPA build changes shape here;
// the only addition on that side is the manifest, which the prerenderer reads to
// find the hashed CSS filename so blog pages can link the same stylesheet.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    // enforce: 'pre' so .mdx is compiled to JSX before the React plugin runs.
    {
      enforce: 'pre',
      ...mdx({
        // Frontmatter is parsed out of the YAML block and re-exported as a named
        // `frontmatter` binding, which is what src/content/loader.ts validates.
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
        // Heading ids come from here, and the table of contents is built by
        // reading them back out of the rendered HTML, so the two cannot drift.
        rehypePlugins: [rehypeSlug],
      }),
    },
    react(),
    tailwindcss(),
  ],
  build: {
    // The prerenderer needs the hashed asset names; without this it would have to
    // guess at dist/assets/index-*.css.
    manifest: true,
    rollupOptions: {
      output: {
        // Client-only: the SSR bundle never loads Firebase, and naming a chunk
        // for modules outside the graph is an error rather than a no-op.
        manualChunks: isSsrBuild
          ? undefined
          : {
              // Keep the Firebase SDK out of the app chunk so the landing page
              // JS stays small and the SDK caches independently across deploys.
              firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            },
      },
    },
  },
}))
