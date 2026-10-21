import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svedocsPreprocess, svedocsSvelteExtensions } from 'svedocs/svelte';

export default {
  extensions: svedocsSvelteExtensions,
  preprocess: [vitePreprocess(), svedocsPreprocess()],
  // A copied 404.html can be served at any depth by Workers Assets.
  // Its styles and hydration chunks must resolve from the site root.
  kit: { adapter: adapter(), paths: { relative: false }, prerender: { handleHttpError: 'fail' } }
};
