import { useState } from 'preact/hooks';
import type { Data } from '../types';
import { firmStats } from '../logic';
import { Empty, Pill, Rating } from './common';
import { go } from './nav';

export function Compare({ data }: { data: Data }) {
  const firms = data.firms.filter((f) => f.kind === 'firm');
  const stats = firms.map((f) => ({ f, s: firmStats(data, f) }));
  const [sel, setSel] = useState<string[]>(() => stats.filter((x) => x.f.interest).sort((a, b) => (b.f.interest ?? 0) - (a.f.interest ?? 0)).slice(0, 3).map((x) => x.f.id));
  const toggle = (id: string) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]);

  // Scatter: x = people spoken to, y = interest; colour = avg impression.
  const W = 560, H = 300, P = 36;
  const maxX = Math.max(3, ...stats.map((x) => x.s.spokeCount));
  const px = (v: number) => P + (v / maxX) * (W - P * 2);
  const py = (v: number) => H - P - ((v - 1) / 4) * (H - P * 2);
  const colour = (imp: number | null) => imp == null ? 'var(--grey-dot)' : imp >= 4 ? 'var(--green)' : imp >= 3 ? 'var(--amber)' : 'var(--red)';
  const plotted = stats.filter((x) => x.f.interest);
  // Jitter overlapping points.
  const seen = new Map<string, number>();

  return (
    <div class="page">
      <div class="page-head"><h1>Compare firms</h1></div>
      <div class="cols two">
        <section class="card">
          <h3>Interest vs. people you’ve spoken to</h3>
          <p class="small muted">Top-left = firms you care about but haven’t talked to anyone at. Dot colour = average conversation impression (green ≥4, amber 3, red &lt;3, grey none).</p>
          {plotted.length === 0 ? <Empty>Set an interest level on a few firms to fill this in.</Empty> : (
            <svg viewBox={`0 0 ${W} ${H}`} class="scatter" role="img" aria-label="Firm interest versus people spoken to">
              <rect x={P} y={P} width={(W - 2 * P) / 2} height={(H - 2 * P) / 2} class="quad" />
              <text x={P + 6} y={P + 14} class="quad-label">Gap: talk to someone here</text>
              {[1, 2, 3, 4, 5].map((v) => <g><line x1={P} x2={W - P} y1={py(v)} y2={py(v)} class="gridline" /><text x={P - 8} y={py(v) + 4} class="axis" text-anchor="end">{v}</text></g>)}
              {Array.from({ length: maxX + 1 }, (_, v) => <text x={px(v)} y={H - P + 16} class="axis" text-anchor="middle">{v}</text>)}
              <text x={W / 2} y={H - 4} class="axis" text-anchor="middle">people spoken to</text>
              <text x={10} y={H / 2} class="axis" transform={`rotate(-90 10 ${H / 2})`} text-anchor="middle">interest</text>
              {plotted.map(({ f, s }) => {
                const k = `${s.spokeCount}-${f.interest}`;
                const n = seen.get(k) ?? 0; seen.set(k, n + 1);
                const x = px(s.spokeCount) + n * 9, y = py(f.interest!) - n * 4;
                return (
                  <g class="pt" onClick={() => toggle(f.id)} style={{ cursor: 'pointer' }}>
                    <circle cx={x} cy={y} r={sel.includes(f.id) ? 7 : 5.5} fill={colour(s.avgImpression)} stroke={sel.includes(f.id) ? 'var(--ink)' : 'white'} stroke-width="1.5" />
                    <text x={x + 9} y={y + 4} class="pt-label">{f.aliases[0] ?? f.name.split(/[ ,]/)[0]}</text>
                    <title>{f.name}: interest {f.interest}, spoke with {s.spokeCount}, impression {s.avgImpression?.toFixed(1) ?? '—'}</title>
                  </g>
                );
              })}
            </svg>
          )}
        </section>
        <section class="card">
          <h3>Pick up to 4 firms</h3>
          <p class="small muted">Firms still “Not Started” are hidden unless they have an interest level.</p>
          <div class="checklist">
            {stats.filter(({ f }) => f.status !== 'Not Started' || f.interest || sel.includes(f.id)).sort((a, b) => a.f.name.localeCompare(b.f.name)).map(({ f }) => (
              <label class="check"><input type="checkbox" checked={sel.includes(f.id)} onChange={() => toggle(f.id)} disabled={!sel.includes(f.id) && sel.length >= 4} /> {f.name}</label>
            ))}
          </div>
        </section>
      </div>

      {sel.length > 0 && (
        <section class="card">
          <div class="compare" style={{ gridTemplateColumns: `140px repeat(${sel.length}, 1fr)` }}>
            <div />
            {sel.map((id) => { const f = data.firms.find((x) => x.id === id)!; return <div class="c-head"><a href={`#/firms/${f.id}`} onClick={(e) => { e.preventDefault(); go(`firms/${f.id}`); }}>{f.name}</a></div>; })}
            {([
              ['Status', (f, s) => <Pill s={f.status} small />],
              ['Interest', (f) => <Rating value={f.interest} />],
              ['Market', (f) => f.market || '—'],
              ['Size', (f) => f.size || '—'],
              ['Tiers', (f) => f.tiers.join(', ') || '—'],
              ['Practice areas', (f) => f.practiceAreas || '—'],
              ['People / spoke', (f, s) => `${s.peopleCount} / ${s.spokeCount}`],
              ['Avg impression', (f, s) => s.avgImpression?.toFixed(1) ?? '—'],
              ['Culture notes', (f) => <div class="pre">{f.notes || '—'}</div>],
              ['What people said', (f, s) => {
                const ids = new Set(s.people.map((p) => p.id));
                const t = data.interactions.filter((i) => ids.has(i.personId) && i.takeaways).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
                return t.length ? <ul class="tight">{t.map((i) => <li>{i.takeaways}</li>)}</ul> : '—';
              }],
            ] as [string, (f: Data['firms'][number], s: ReturnType<typeof firmStats>) => any][]).map(([label, fn]) => (
              <>
                <div class="c-label">{label}</div>
                {sel.map((id) => { const f = data.firms.find((x) => x.id === id)!; return <div class="c-cell">{fn(f, firmStats(data, f))}</div>; })}
              </>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
