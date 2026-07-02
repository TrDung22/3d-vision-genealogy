// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://trdung22.github.io',
  base: '/3d-vision-genealogy',
  integrations: [mdx()],
});
