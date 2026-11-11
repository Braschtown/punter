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

/**
 * Line chart of a running total (cumulative profit). One series, so no legend: the card title names it.
 * Returns SVG markup; call bindLineHover() after it is in the page to add the crosshair and tooltip.
 * @param {Array<{y:number}>} points in time order
 */
export function lineChart(points, { format, title, height = 200, width = 600 }) {
  const w = Math.max(280, Math.round(width));
  const h = height;
  const pad = { top: 12, bottom: 22, left: 8, right: 56 };
  if (!points.length) return emptyChart(title, 6);
  const ys = points.map((p) => p.y);
  const max = Math.max(0, ...ys);
  const min = Math.min(0, ...ys);
  const span = max - min || 1;
  const x = (i) => pad.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * (w - pad.left - pad.right));
  const y = (v) => pad.top + ((max - v) / span) * (h - pad.top - pad.bottom);
  // Thin the path for long series; the tooltip still reads every point.
  const step = Math.max(1, Math.floor(points.length / 600));
  let d = '';
  for (let i = 0; i < points.length; i += step) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(points[i].y).toFixed(1)}`;
  const li = points.length - 1;
  d += `L${x(li).toFixed(1)},${y(points[li].y).toFixed(1)}`;
  return `<div class="chart-wrap"><svg class="chart line" viewBox="0 0 ${w} ${h}" style="height:${h}px" role="img" aria-label="${esc(title)}"
      data-w="${w}" data-pl="${pad.left}" data-pr="${pad.right}" data-n="${points.length}">
    <line class="axis" x1="${pad.left}" x2="${w - pad.right}" y1="${y(0)}" y2="${y(0)}"/>
    <text x="${w - pad.right + 6}" y="${y(0) + 4}">${esc(format(0))}</text>
    <text x="${w - pad.right + 6}" y="${y(max) + 10}">${max > 0 ? esc(format(max)) : ''}</text>
    <text x="${w - pad.right + 6}" y="${y(min) - 2}">${min < 0 ? esc(format(min)) : ''}</text>
    <path class="series" d="${d}"/>
    <circle class="end" cx="${x(li)}" cy="${y(points[li].y)}" r="4"/>
    <line class="cross" x1="0" x2="0" y1="${pad.top}" y2="${h - pad.bottom}" visibility="hidden"/>
    <circle class="dot" r="4" visibility="hidden"/>
    <rect class="hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
  </svg><div class="chart-tip" hidden></div></div>`;
}

/** Crosshair and tooltip for lineChart(). `tip(point)` returns the tooltip's HTML. */
export function bindLineHover(wrap, points, tip) {
  const svg = wrap?.querySelector('svg.line');
  if (!svg || !points.length) return;
  const w = Number(svg.dataset.w);
  const pl = Number(svg.dataset.pl);
  const pr = Number(svg.dataset.pr);
  const cross = svg.querySelector('.cross');
  const dot = svg.querySelector('.dot');
  const box = wrap.querySelector('.chart-tip');
  const path = svg.querySelector('.series');
  const ys = points.map((p) => p.y);
  const max = Math.max(0, ...ys);
  const min = Math.min(0, ...ys);
  const vb = svg.viewBox.baseVal;
  const top = 12;
  const bottom = 22;
  const yOf = (v) => top + ((max - v) / (max - min || 1)) * (vb.height - top - bottom);
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * w;
    const frac = Math.min(1, Math.max(0, (sx - pl) / (w - pl - pr)));
    const i = Math.round(frac * (points.length - 1));
    const px = pl + (points.length === 1 ? 0 : (i / (points.length - 1)) * (w - pl - pr));
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px); dot.setAttribute('cy', yOf(points[i].y)); dot.setAttribute('visibility', 'visible');
    box.innerHTML = tip(points[i]);
    box.hidden = false;
    const left = (px / w) * r.width;
    box.style.left = `${Math.min(Math.max(0, left - box.offsetWidth / 2), r.width - box.offsetWidth)}px`;
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); box.hidden = true; };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  void path;
}

/**
 * Horizontal bars around zero, one row per group (ROI by track, jockey and so on). Built in HTML so the
 * text stays full size at any width. Groups with too few bets are drawn as outlines, so a big number on a
 * tiny sample does not look solid.
 * @param {Array<{label:string, value:number|null, n:number, solid:boolean, tip:string}>} rows
 */
export function hBarChart(rows, { format, title }) {
  const vals = rows.map((r) => r.value).filter((v) => v !== null && Number.isFinite(v));
  if (!vals.length) return '';
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const pos = (v) => ((v - min) / span) * 100;
  const zero = pos(0);
  return `<div class="hbars" role="img" aria-label="${esc(title)}">${rows.map((r) => {
    const ok = r.value !== null && Number.isFinite(r.value);
    const a = ok ? Math.min(pos(r.value), zero) : zero;
    const w = ok ? Math.max(0.5, Math.abs(pos(r.value) - zero)) : 0;
    return `<div class="hb-row" title="${esc(r.tip)}">
      <span class="hb-label">${esc(r.label)}</span>
      <span class="hb-track"><span class="hb-zero" style="left:${zero}%"></span>${ok ? `<span class="hb-bar${r.solid ? '' : ' thin'}" style="left:${a}%;width:${w}%"></span>` : ''}</span>
      <span class="hb-val">${ok ? esc(format(r.value)) : '-'}</span></div>`;
  }).join('')}</div>`;
}
