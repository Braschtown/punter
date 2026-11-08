// Hand-rolled SVG bar charts. Fixed height so nothing shifts when data arrives.
// With no data, draws dashed empty bars instead of inventing numbers.

import { esc } from './format.js';

const W = 340;
const H = 160;
const PAD = { top: 18, bottom: 26, left: 6, right: 6 };

/**
 * @param {Array<{label:string, values:Array<{v:number|null, cls?:string, name?:string}>}>} groups
 * @param {{format:(v:number)=>string, title:string, emptyGroups?:number}} opts
 */
export function barChart(groups, { format, title, emptyGroups = 4 }) {
  const all = groups.flatMap((g) => g.values.map((x) => x.v)).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!all.length) return emptyChart(title, emptyGroups);

  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const plotH = H - PAD.top - PAD.bottom - (min < 0 ? 16 : 0); // room for labels under negative bars
  const y = (v) => PAD.top + ((max - v) / span) * plotH;
  const zeroY = y(0);
  const gw = (W - PAD.left - PAD.right) / groups.length;
  const per = Math.max(...groups.map((g) => g.values.length));
  const bw = Math.min(28, (gw - 10) / per);

  let bars = '';
  groups.forEach((g, gi) => {
    const x0 = PAD.left + gi * gw + (gw - bw * g.values.length) / 2;
    g.values.forEach((val, vi) => {
      const x = x0 + vi * bw;
      if (val.v === null || val.v === undefined) {
        bars += `<rect class="empty" x="${x + 1}" y="${zeroY - 24}" width="${bw - 2}" height="24" rx="3"/>`;
        return;
      }
      const top = Math.min(y(val.v), zeroY);
      const h = Math.max(1, Math.abs(y(val.v) - zeroY));
      bars += `<rect class="bar ${val.cls || ''}" x="${x + 1}" y="${top}" width="${bw - 2}" height="${h}" rx="3"><title>${esc(`${g.label}${val.name ? ` ${val.name}` : ''}: ${format(val.v)}`)}</title></rect>`;
      if (g.values.length === 1 || per <= 2) {
        const ty = val.v >= 0 ? top - 4 : top + h + 12;
        if (per === 1) bars += `<text x="${x + bw / 2}" y="${ty}" text-anchor="middle">${esc(format(val.v))}</text>`;
      }
    });
    bars += `<text x="${PAD.left + gi * gw + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(g.label)}</text>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    <line class="axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${zeroY}" y2="${zeroY}"/>${bars}</svg>`;
}

function emptyChart(title, n) {
  const gw = (W - PAD.left - PAD.right) / n;
  const heights = [52, 84, 64, 100, 40, 72, 56, 88];
  let bars = '';
  for (let i = 0; i < n; i++) {
    const h = heights[i % heights.length];
    bars += `<rect class="empty" x="${PAD.left + i * gw + gw * 0.25}" y="${H - PAD.bottom - h}" width="${gw * 0.5}" height="${h}" rx="3"/>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: no data yet">
    <line class="axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${H - PAD.bottom}" y2="${H - PAD.bottom}"/>${bars}
    <text x="${W / 2}" y="${H - 8}" text-anchor="middle">No data yet</text></svg>`;
}
