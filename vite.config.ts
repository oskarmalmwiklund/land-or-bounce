import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

/** `vercel env pull` writes .env.local; the API handlers read process.env like they do on Vercel. */
for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

/** Serve /api/* from the same handlers Vercel runs, so `npm run dev` captures pages with local Chrome. */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const name = req.url.slice(5).split(/[?#]/)[0].replace(/[^a-z0-9_-]/gi, '');
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          await mod.default(req, res);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [apiDev()],
  build: { chunkSizeWarningLimit: 800, target: 'es2022' },
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'], testTimeout: 120_000 },
});
