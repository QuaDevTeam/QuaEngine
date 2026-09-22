import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { svedocs } from 'svedocs/vite';
import config from './svedocs.config.ts';

export default defineConfig({
  plugins: [
    svedocs({ config, theme: { components: {
      Navbar: '$lib/theme/Navbar.svelte',
      Footer: '$lib/theme/Footer.svelte',
      Sidebar: '$lib/theme/Sidebar.svelte',
      DocsShell: '$lib/theme/DocsShell.svelte'
    } } }),
    tailwindcss(), sveltekit()
  ],
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true }
});
