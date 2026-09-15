/** 無猜盤面生成成本實測(只讀,不改任何檔)。 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = require('vite');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { generateNoGuess } = await server.ssrLoadModule('/src/game/generator.ts');
const { PRESETS } = await server.ssrLoadModule('/src/game/types.ts');

for (const [name, spec] of Object.entries(PRESETS)) {
  for (const rule of ['opening', 'safe']) {
    let ok = 0, attempts = 0, ms = 0, worstMs = 0, worstAtt = 0;
    const N = 25;
    for (let i = 0; i < N; i++) {
      const first = Math.floor(Math.random() * spec.width * spec.height);
      const t0 = Date.now();
      const r = generateNoGuess({ spec, firstIndex: first, rule, seed: (i + 1) * 7919, budgetMs: 3000, maxAttempts: 20000 });
      const dt = Date.now() - t0;
      if (r.noGuess) ok++;
      attempts += r.attempts; ms += dt;
      if (dt > worstMs) worstMs = dt;
      if (r.attempts > worstAtt) worstAtt = r.attempts;
    }
    console.log(
      `${name.padEnd(13)} ${rule.padEnd(8)} 成功 ${String(ok).padStart(2)}/${N}` +
      `  平均 ${String(Math.round(ms / N)).padStart(4)}ms / ${String(Math.round(attempts / N)).padStart(4)} 次抽` +
      `  最慢 ${String(worstMs).padStart(4)}ms / ${String(worstAtt).padStart(5)} 次`
    );
  }
}
await server.close();
