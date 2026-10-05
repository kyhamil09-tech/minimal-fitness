import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {contentSecurityPolicy} from './src/lib/netHosts';

/**
 * Puts a security policy in the packaged app's index.html so the web view can only talk to the services listed in
 * src/lib/netHosts.ts, and load nothing from anywhere else. It is added to builds only: the dev server needs inline
 * scripts for hot reload. The Privacy screen reads the policy back from the page so what you see is what is enforced.
 */
const securityPolicy = (): Plugin => ({
  name: 'minimal-fitness-security-policy',
  apply: 'build',
  transformIndexHtml(html) {
    const tag = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy()}" />`;
    // After the character-set tag, which must stay within the first 1024 bytes of the page.
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${tag}`);
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), securityPolicy()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
