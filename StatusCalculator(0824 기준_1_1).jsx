import { useState, useMemo, useRef, useEffect } from "react";

export const _f = {
  1: { label: "발동형 · 단순 공/수 증감",   group: "current",  timing: "oneShot",    kind: "delta" },
  2: { label: "비발동형 · 단순 공/수 증감", group: "current",  timing: "continuous", kind: "delta" },
  3: { label: "발동형 · 특정 공/수 변경",   group: "current",  timing: "oneShot",    kind: "set" },
  4: { label: "비발동형 · 특정 공/수 변경", group: "current",  timing: "continuous", kind: "set" },
  5: { label: "발동형 · 원래 공/수 변경",   group: "original", timing: "oneShot",    kind: "set" },
  6: { label: "비발동형 · 원래 공/수 변경", group: "original", timing: "continuous", kind: "set" },
};

export const _h = [
  { id: "on",  label: "발동형" },
  { id: "off", label: "비발동형" },
];
export const _i = [
  { id: "delta", label: "단순 증감" },
  { id: "set",   label: "특정 수치 변경" },
  { id: "orig",  label: "원래 수치 변경" },
];
const _j = { delta: { on: 1, off: 2 }, set: { on: 3, off: 4 }, orig: { on: 5, off: 6 } };
export const _k = (grp, fire) => _j[grp][fire];
export const _n = (grp) => (grp ? (grp === "delta" ? "delta" : "set") : null);
export const _l = (cat) => (cat <= 2 ? "delta" : cat <= 4 ? "set" : "orig");
export const _m = (cat) => (cat % 2 === 1 ? "on" : "off");

export const _g = {
  delta: [
    { id: "up",   label: "올린다" },
    { id: "down", label: "내린다" },
  ],
  set: [
    { id: "fixed",      label: "특정 수치", needsValue: true },
    { id: "origDouble", label: "원래 수치의 2배" },
    { id: "origTriple", label: "원래 수치의 3배" },
    { id: "origHalf",   label: "원래 수치의 절반" },
    { id: "zero",       label: "0 이 된다" },
    { id: "double",     label: "단순 2배" },
    { id: "triple",     label: "단순 3배" },
    { id: "half",       label: "단순 절반" },
  ],
};

const _o = ["up", "down", "fixed"];

const _p = ["origDouble", "origTriple", "origHalf"];

const MULT = ["double", "triple", "half", ..._p];

const READS_CURRENT = ["double", "triple", "half"];

const _d = (v) => Math.round(v);

const clamp = (v) => Math.max(0, v);

function _c(value, eff, ref = value) {
  switch (eff.op) {
    case "up":     return _d(value + eff.value);
    case "down":   return _d(value - eff.value);
    case "fixed":  return _d(eff.value);
    case "_w": return _d(eff.value);
    case "origDouble": return _d(ref * 2);
    case "origTriple": return _d(ref * 3);
    case "origHalf":   return _d(ref / 2);
    case "double": return _d(value * 2);
    case "triple": return _d(value * 3);
    case "half":   return _d(value / 2);
    default:       return value;
  }
}

const _e = (eff) => {
  const o = [..._g.delta, ..._g.set].find((x) => x.id === eff.op) ?? { label: "" };
  if (eff.op === "up" || eff.op === "down") return `${eff.value} ${o.label}`;
  if (eff.op === "fixed" || eff.op === "_w") return `${eff.value} 이 된다`;
  return o.label;
};

export function _a(base, effects) {
  const list = effects.map((e, i) => ({ ...e, order: i }));
  const _q = list.filter((e) => _f[e.cat].group === "original");
  const _r = list.filter((e) => _f[e.cat].group === "current");
  const trace = [];

  
  const _v = new Set();

  
  const _w = new Map();

  
  const _s = _d(base);
  let ref = _s;
  let original = _s;
  trace.push({ kind: "start", label: "원래 수치", value: original });

  for (const e of _q) {
    const before = original;
    original = _c(original, e, ref);
    if (e.op === "fixed") ref = original;
    _q.forEach((p) => { if (p.order < e.order) _v.add(p.order); });
    if (_f[e.cat].timing === "oneShot") _w.set(e.order, original);
    trace.push({
      kind: "orig", cat: e.cat, label: _e(e), before, value: original,
      note: e.op !== "fixed" && before !== ref ? `기준값 ${ref} 에서 계산` : null,
    });
  }

  
  const _x = (startValue, items) => {
    let v = startValue;
    let _G = startValue;
    let alive = [];
    const _z = [];

    
    const inputOf = (e) =>
      _p.includes(e.op) || e.op === "fixed" || e.op === "_w" ? _G : v;

    const lastIn = new Map();
    const locked = new Set();
    const fired = new Set();

    
    const fireVary = (upto) => {
      for (const d of items) {
        if (!d.vary || fired.has(d.order) || d.vary.after - 1 > upto) continue;
        fired.add(d.order);
        if (locked.has(d.order) || _v.has(d.order) || !d.vary.delta) continue;
        const b2 = v;
        v = _d(v + d.vary.delta);
        trace.push({
          kind: "step", cat: d.cat,
          label: `개체수 변동 ${d.vary.delta > 0 ? "+" : ""}${d.vary.delta}`,
          before: b2, value: v, note: "개체수 변동",
        });
      }
    };

    const reapply = (upTo, by) => {
      const redoDelta = !READS_CURRENT.includes(by.op) && !by.readsCurrent;
      if (!redoDelta) alive.forEach((d) => locked.add(d.order));
      for (const d of alive) {
        if (d.order >= upTo) continue;
        const now = inputOf(d);
        if (_f[d.cat].kind === "delta") {
          if (!redoDelta) continue;
        } else if (lastIn.get(d.order) === now) continue;
        const b2 = v;
        v = _c(v, d, _G);
        lastIn.set(d.order, now);
        if (v === b2) continue;
        trace.push({
          kind: "step", cat: d.cat, label: _e(d),
          before: b2, value: v, note: "재계산",
        });
      }
    };

    for (const e of items) {
      const c = _f[e.cat];
      const before = v;

      lastIn.set(e.order, inputOf(e));
      v = _c(v, e, _G);
      if (e.op === "fixed") _G = v;

      if (c.kind === "set") {
        const erased = _z.some((p) => !alive.includes(p));
        _z.forEach((p) => { if (!alive.includes(p)) _v.add(p.order); });
        if (c.timing === "oneShot") _w.set(e.order, v);
        trace.push({
          kind: "step", cat: e.cat, label: _e(e), before, value: v,
          note: erased ? "이전 변동 소거" : null,
        });
        if (c.timing === "continuous") alive.push(e);
        reapply(e.order, e);
      } else {
        if (c.timing === "continuous") alive.push(e);
        trace.push({ kind: "step", cat: e.cat, label: _e(e), before, value: v });
      }
      _z.push(e);
      fireVary(e.order);
    }
    fireVary(Infinity);
    return v;
  };

  let current = _x(original, _r);

  
  
  const _A = [..._r].reverse().find((e) => _f[e.cat].kind === "set");
  const _B =
    _A &&
    _f[_A.cat].timing === "continuous" &&
    MULT.includes(_A.op);
  const _C = _B ? undefined : _A;
  const _D = _C
    ? _q.find((e) => e.order > _C.order)
    : null;

  if (_D) {
    let _F = _s;
    let _E = _s;
    for (const e of _q) {
      _E = _c(_E, e, _F);
      if (e.op === "fixed") _F = _E;
      if (e.order === _D.order) break;
    }
    trace.push({
      kind: "override", cat: _D.cat,
      label: `원래 수치 ${_E} 로 덮어쓰기`,
      before: current, value: _E, note: "예외 · 원래 수치가 뒤에 적용됨",
    });
    _r.forEach((p) => { if (p.order < _D.order) _v.add(p.order); });
    current = _x(_E, _r.filter((e) => e.order > _D.order));
  }

  return {
    original: clamp(original),
    current: clamp(current),
    raw: current,
    trace: trace.map((t) => ({
      ...t,
      value: clamp(t.value),
      before: t.before === undefined ? undefined : clamp(t.before),
    })),
    _v, _w,
  };
}

export function _b(base, effects) {
  const now = _a(base, effects);

  const _H = effects
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => !e.temp && !now._v.has(i))
    .map(({ e, i }) => {
      const c = _f[e.cat];
      const value = now._w.get(i);
      const isOneShotSet = c.kind === "set" && c.timing === "oneShot";
      return isOneShotSet && value !== undefined
        ? { ...e, op: "_w", value, readsCurrent: READS_CURRENT.includes(e.op) }
        : e;
    });

  const after = _a(base, _H);
  const hasTemp = effects.some((e) => e.temp);
  return { now, after, hasTemp };
}

const CSS = `
.yc{--field:#FDF6E3;--surface:#FFFDF7;--inset:#F5ECD5;--edge:#E0D3B0;--ink:#3B3226;
  --gold:#A67C00;--cyan:#1B7E8C;--rose:#C2334C;--muted:#8A7B62;--onGold:#FFFDF7;
  --shadow:rgba(59,50,38,.05);
  background:var(--field);color:var(--ink);min-height:100vh;padding:28px 20px 60px;
  font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  font-size:14px;line-height:1.55;}
.yc[data-theme="dark"]{--field:#1B1813;--surface:#252118;--inset:#141109;--edge:#3D362A;
  --ink:#EDE4CE;--gold:#D8B34A;--cyan:#5CC6D6;--rose:#E8697F;--muted:#9A8F79;
  --onGold:#1B1813;--shadow:rgba(0,0,0,.28);}
.yc-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px;}
.yc-tools{display:flex;gap:8px;flex:0 0 auto;}
.yc-theme{flex:0 0 auto;height:36px;min-width:36px;padding:0 9px;border:1px solid var(--edge);
  border-radius:9px;background:var(--surface);color:var(--gold);cursor:pointer;
  display:grid;place-items:center;font:inherit;font-size:12px;white-space:nowrap;}
.yc-theme:hover{border-color:var(--gold);}
.yc-theme[data-on="1"]{background:var(--gold);color:var(--onGold);border-color:var(--gold);font-weight:700;}
.yc-theme:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.yc *{box-sizing:border-box;}
.yc-wrap{max-width:1040px;margin:0 auto;container-type:inline-size;}

.yc-wrap[data-narrow="1"]{max-width:372px;border:1px solid var(--edge);border-radius:14px;
  padding:10px;background:var(--field);box-shadow:0 6px 24px var(--shadow);}
.yc-eyebrow{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin:0 0 6px;}
.yc-h1{font-size:26px;font-weight:800;letter-spacing:-.01em;margin:0;}
.yc-sub{color:var(--muted);font-size:13px;margin:0 0 22px;
  background:var(--inset);border:1px solid var(--edge);border-radius:6px;
  padding:16px 18px;}
.yc-sub p{margin:0 0 10px;line-height:1.75;}
.yc-sub p:last-of-type{margin-bottom:0;}
.yc-sub b{color:var(--ink);font-weight:700;}
.yc-sub a{color:var(--cyan);text-decoration:underline;text-underline-offset:2px;}
.yc-sub hr{border:0;border-top:1px solid var(--edge);margin:14px 0;}
.yc-ex{margin:12px 0 14px !important;padding:10px 12px;background:var(--surface);
  border:1px solid var(--edge);border-radius:6px;font-size:12px;line-height:1.9 !important;}
.yc-exlab{display:inline-block;min-width:26px;color:var(--gold);font-weight:700;}
.yc-more{margin-top:14px;background:var(--gold);border:1px solid var(--gold);border-radius:6px;
  color:var(--onGold);cursor:pointer;font:inherit;font-size:12px;font-weight:700;padding:7px 14px;}
.yc-more:hover{filter:brightness(1.08);}
.yc-more:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.yc-terms{margin:12px 0 0;padding:14px 16px;border:1px solid var(--edge);border-radius:6px;
  background:var(--surface);font-size:12.5px;line-height:1.75;}
.yc-terms dt{color:var(--gold);font-weight:700;margin-top:12px;}
.yc-terms dt:first-child{margin-top:0;}
.yc-terms dd{margin:3px 0 0;padding-left:10px;border-left:2px solid var(--edge);color:var(--muted);}
.yc-grid{display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start;}
.yc-sec + .yc-sec{margin-top:30px;}
.yc-sechead{font-size:15px;font-weight:800;letter-spacing:-.01em;margin:0 0 10px;
  padding-bottom:6px;border-bottom:2px solid var(--gold);}
@container (max-width:820px){.yc-grid{grid-template-columns:1fr;}}
.yc-panel{background:var(--surface);border:1px solid var(--edge);border-radius:10px;padding:18px;
  box-shadow:0 1px 2px var(--shadow);}
.yc-lab{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 7px;}
.yc-input{background:var(--inset);border:1px solid var(--edge);border-radius:6px;color:var(--ink);
  padding:9px 11px;font:inherit;font-variant-numeric:tabular-nums;width:100%;}
.yc-input::placeholder{color:var(--muted);opacity:1;}
.yc-input:focus,.yc-sel:focus,.yc-btn:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.yc-sel[data-empty="1"]{color:var(--muted);}
.yc-sel:disabled{opacity:.45;cursor:not-allowed;}
.yc-sel{background:var(--inset);border:1px solid var(--edge);border-radius:6px;color:var(--ink);
  padding:0 8px;font:inherit;width:100%;}
.yc-toggle{display:inline-flex;border:1px solid var(--edge);border-radius:6px;overflow:hidden;margin-bottom:18px;}
.yc-toggle button + button{border-left:1px solid var(--edge);}
.yc-toggle button{background:transparent;border:0;color:var(--muted);padding:7px 18px;font:inherit;cursor:pointer;}
.yc-toggle button[data-on="1"]{background:var(--gold);color:var(--onGold);font-weight:700;}
.yc-row{display:grid;
  grid-template-columns:24px 66px minmax(0,.85fr) minmax(0,1.25fr) 68px minmax(0,1.05fr) auto 66px;
  gap:8px;align-items:center;margin-bottom:8px;border-radius:6px;
  transition:transform .16s cubic-bezier(.2,.7,.3,1);}

.yc-row .yc-sel,.yc-row .yc-input,.yc-row .yc-chip,.yc-row .yc-btn{height:38px;padding-top:0;padding-bottom:0;}
.yc-mini{align-self:stretch;}
.yc-row[data-num="0"]{
  grid-template-columns:24px 66px minmax(0,.85fr) minmax(0,1.25fr) minmax(0,1.05fr) auto 66px;}
.yc-c-x{flex:0 0 auto;min-width:58px;}

.yc-c-x:empty{min-width:0;width:0;padding:0;border:0;}
.yc-var{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;
  margin:2px 0 4px;padding:0 0 0 32px;font-size:11.5px;color:var(--muted);}
.yc-varf{display:flex;flex-direction:column;align-items:stretch;gap:3px;min-width:0;}
.yc-varf > span{text-align:center;}
.yc-var .yc-input{width:auto;min-width:110px;text-align:center;}
.yc-var .yc-sel{width:auto;min-width:110px;}
.yc-input[data-hide="1"]{display:none;}

@media(max-width:560px){.yc{padding:18px 12px 44px;}}
@container (max-width:560px){
  .yc-panel{padding:12px;}
  
  .yc-row,.yc-row[data-num="0"]{
    grid-template-columns:15px 58px minmax(0,1fr) minmax(0,1.5fr) 38px;}
  
  .yc-row{display:grid;gap:5px;align-items:stretch;
    grid-template-areas:"n t f g m"
                        "n v o o m"
                        "n x y y y";}
  
  .yc-row[data-num="0"]{grid-template-areas:"n t f g m"
                                            "n o o o m"
                                            "n x y y y";}
  .yc-c-x{grid-area:x;font-size:10px;padding:0 2px;}
  
  .yc-c-x:empty{display:none;}
  .yc-row[data-x="0"]{grid-template-areas:"n t f g m"
                                          "n v o o m";}
  .yc-row[data-num="0"][data-x="0"]{grid-template-areas:"n t f g m"
                                                        "n o o o m";}
  
  .yc-c-x{align-self:center;height:40px;}
  
  .yc-var{grid-area:y;padding:0;margin:0;width:100%;
    display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr);
    gap:5px;font-size:10px;align-items:stretch;}
  .yc-varf{flex-direction:column;align-items:stretch;gap:2px;min-width:0;}
  .yc-varf > span{white-space:nowrap;}
  .yc-var .yc-input,.yc-var .yc-sel{width:100%;min-width:0;min-height:0;text-align:center;}
  .yc-row > *{min-height:40px;}
  .yc-c-n{grid-area:n;display:flex;align-items:center;justify-content:center;font-size:11px;}
  .yc-c-t{grid-area:t;font-size:10px;padding:0 2px;}
  .yc-c-f{grid-area:f;}
  .yc-c-g{grid-area:g;}
  .yc-c-v{grid-area:v;text-align:center;}
  .yc-c-o{grid-area:o;}
  .yc-c-m{grid-area:m;display:flex;flex-direction:column;gap:5px;}
  .yc-c-m .yc-btn{flex:1;min-height:0;padding:0;font-size:13px;}
  .yc-row .yc-sel,.yc-row .yc-input{padding:0 3px;font-size:11px;}
  .yc-row .yc-sel,.yc-row .yc-input,.yc-row .yc-chip{height:40px;}
  
  .yc-varf{height:40px;}
  .yc-var .yc-input,.yc-var .yc-sel{height:100%;min-width:0;padding:0 2px;font-size:10px;}
  .yc-var{min-height:0;}
  .yc-input[data-hide="1"]{display:none;}
}
.yc-chip{width:100%;background:transparent;border:1px solid var(--edge);border-radius:6px;
  color:var(--muted);cursor:pointer;font:inherit;font-size:11.5px;padding:0;white-space:nowrap;}
.yc-chip:hover{border-color:var(--gold);color:var(--gold);}
.yc-chip[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);color:var(--onGold);font-weight:700;}
.yc-chip:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.yc-row[data-drag="1"]{background:var(--surface);box-shadow:0 8px 20px var(--shadow);}
.yc-n{font-variant-numeric:tabular-nums;color:var(--gold);font-weight:700;font-size:13px;
  text-align:center;user-select:none;}
.yc-grip{cursor:grab;color:var(--muted);font-size:15px;line-height:1;letter-spacing:.5px;
  touch-action:none;user-select:none;-webkit-user-select:none;}
.yc-grip:active{cursor:grabbing;}
.yc-mini{display:flex;gap:3px;}
.yc-btn{background:transparent;border:1px solid var(--edge);border-radius:6px;color:var(--muted);
  cursor:pointer;font:inherit;font-size:12px;padding:0;flex:1;}
.yc-btn:hover:not(:disabled){border-color:var(--gold);color:var(--gold);}
.yc-btn:disabled{opacity:.3;cursor:default;}
.yc-add{width:100%;margin-top:6px;padding:10px;border:1px dashed var(--edge);border-radius:6px;
  background:transparent;color:var(--muted);cursor:pointer;font:inherit;}
.yc-add:hover{border-color:var(--gold);color:var(--gold);}
.yc-empty{color:var(--muted);font-size:13px;padding:14px 0;}
.yc-out{position:sticky;top:20px;}

.yc-statline{display:flex;align-items:baseline;gap:8px;padding-bottom:9px;border-bottom:1px solid var(--edge);}
.yc-statlab{font-size:12px;letter-spacing:.2em;color:var(--gold);font-weight:700;}
.yc-statval{font-size:44px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1;}
.yc-orig{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--muted);padding:7px 0 3px;}
.yc-orig b{color:var(--cyan);font-variant-numeric:tabular-nums;font-weight:700;font-size:24px;
  letter-spacing:-.02em;line-height:1;}
.yc-block{padding-bottom:3px;}
.yc-block--after{margin-top:10px;padding-top:9px;border-top:1px solid var(--edge);}
.yc-blocklab{display:block;font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--gold);font-weight:700;margin-bottom:4px;line-height:1.2;}
.yc-block--after .yc-blocklab{color:var(--muted);}
.yc-tabs{display:flex;flex-wrap:wrap;gap:16px;margin-top:13px;border-bottom:1px solid var(--edge);}
.yc-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);
  font:inherit;font-size:12px;padding:7px 0;cursor:pointer;margin-bottom:-1px;white-space:nowrap;}
.yc-tabs button:hover{color:var(--ink);}
.yc-tabs button[data-on="1"]{color:var(--gold);border-bottom-color:var(--gold);font-weight:700;}
.yc-tabs button:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.yc-chain{list-style:none;margin:9px 0 0;line-height:1.2;padding:0 0 0 18px;border-left:1px solid var(--edge);}
.yc-block + .yc-chain{margin-top:13px;}
.yc-link{position:relative;padding:0 0 8px 12px;font-size:12.5px;}
.yc-link::before{content:"";position:absolute;left:-23px;top:3px;width:9px;height:9px;border-radius:50%;
  background:var(--surface);border:1.5px solid var(--edge);}
.yc-link[data-hit="1"]::before{border-color:var(--gold);background:var(--gold);}
.yc-link[data-hit="2"]::before{border-color:var(--rose);background:var(--rose);}
.yc-lt{display:flex;justify-content:space-between;gap:10px;}
.yc-out .yc-orig{line-height:1.2;}
.yc-name{color:var(--muted);}
.yc-cat{color:var(--gold);font-weight:700;font-variant-numeric:tabular-nums;}
.yc-val{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;}
.yc-was{color:var(--muted);text-decoration:line-through;font-weight:400;margin-right:7px;}
.yc-note{color:var(--rose);font-size:11px;letter-spacing:.02em;margin-top:1px;}
`;

const _O = (() => { let n = 0; return () => ++n; })();

const _J = () => ({
  id: _O(), fire: null, grp: null, op: null, value: "", temp: false,
  varying: false, count: "", count2: "", after: "1",
});

export default function StatusCalculator() {
  const STATS = ["공격력", "수비력"];

  const [on, setOn] = useState({ 공격력: true, 수비력: false });
  const [dark, setDark] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [more, setMore] = useState(false);

  
  const wrapRef = useRef(null);
  const [tight, setTight] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) =>
      setTight(entry.contentRect.width <= 560)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [traceTab, setTraceTab] = useState("now");
  const [bases, setBases] = useState({ 공격력: "2000", 수비력: "2000" });

  
  const [lists, setLists] = useState({
    공격력: [_J()],
    수비력: [_J()],
  });

  const active = STATS.filter((s) => on[s]);

  const _W = useMemo(() => {
    const _Y = (list) =>
      list
        .filter((e) => e.fire && e.grp && e.op)
        .map((e) => (e.op === "zero" ? { ...e, op: "fixed", value: "0" } : e))
        .filter((e) => !_o.includes(e.op) || String(e.value).trim() !== "")
        .map((e) => {
          const unit = Number(e.value) || 0;
          const base = {
            cat: _k(e.grp, e.fire), op: e.op,
            value: unit, temp: !!e.temp,
          };
          if (!e.varying) return base;
          const c1 = Number(e.count) || 0;
          const c2 = Number(e.count2) || 0;
          return {
            ...base,
            value: unit * c1,
            vary: { after: Number(e.after) || 1, delta: unit * (c2 - c1) },
          };
        });
    return Object.fromEntries(
      STATS.map((s) => [s, _b(Number(bases[s]) || 0, _Y(lists[s]))])
    );
  }, [bases, lists]);

  const _V = (s, updater) =>
    setLists((all) => ({ ...all, [s]: updater(all[s]) }));

  const patch = (s, id, next) =>
    _V(s, (list) => list.map((e) => (e.id === id ? { ...e, ...next } : e)));

  const _U = (s) => {
    if (on[s] && active.length === 1) return;
    setOn((o) => ({ ...o, [s]: !o[s] }));
  };

  
  const _P = useRef({});
  const [drag, setDrag] = useState(null);

  const _Q = (ev, s, i) => {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const kids = _P.current[s] ? Array.from(_P.current[s].children) : [];
    const a = kids[0]?.getBoundingClientRect();
    const b = kids[1]?.getBoundingClientRect();
    const rowH = b ? b.top - a.top : a ? a.height + 8 : 44;
    setDrag({ stat: s, from: i, to: i, dy: 0, rowH, startY: ev.clientY });
  };

  const _R = (ev) =>
    setDrag((d) => {
      if (!d) return d;
      const dy = ev.clientY - d.startY;
      const len = lists[d.stat].length;
      const to = Math.max(0, Math.min(len - 1, d.from + Math.round(dy / d.rowH)));
      return { ...d, dy, to };
    });

  const _S = () =>
    setDrag((d) => {
      if (d && d.from !== d.to) {
        _V(d.stat, (list) => {
          const copy = [...list];
          const [moved] = copy.splice(d.from, 1);
          copy.splice(d.to, 0, moved);
          return copy;
        });
      }
      return null;
    });

  
  const _T = (s, i) => {
    if (!drag || drag.stat !== s) return undefined;
    const { from, to, dy, rowH } = drag;
    if (i === from)
      return { transform: `translateY(${dy}px)`, transition: "none", position: "relative", zIndex: 2 };
    if (from < to && i > from && i <= to) return { transform: `translateY(${-rowH}px)` };
    if (from > to && i < from && i >= to) return { transform: `translateY(${rowH}px)` };
    return undefined;
  };

  

  const _N = (s, r) => (
    <>
      <div className="yc-statline">
        <span className="yc-statlab">{s === "공격력" ? "ATK" : "DEF"}/</span>
        <span className="yc-statval">{r.current}</span>
      </div>
      <div className="yc-orig">
        <span>원래 수치</span>
        <b>{r.original}</b>
      </div>
    </>
  );

  const _K = (s, e, i) => {
    const kind = _n(e.grp);
    const ops = kind ? _g[kind] : [];
    const _X = e.grp === "delta" || e.op === "fixed";
    const canVary = e.grp === "delta" && e.fire === "off";
    return (
      <div
        className="yc-row" key={e.id}
        data-num={_X ? "1" : "0"}
        data-x={canVary ? "1" : "0"}
        data-drag={drag && drag.stat === s && drag.from === i ? "1" : "0"}
        style={_T(s, i)}
      >
        <span className="yc-n yc-c-n">{i + 1}</span>

        <button
          className="yc-chip yc-c-t" aria-pressed={e.temp ? "true" : "false"}
          title={e.temp ? "턴 종료시까지만 적용됩니다" : "계속 적용됩니다"}
          onClick={() => patch(s, e.id, { temp: !e.temp })}
        >
          {e.temp ? "턴 종료시" : "영구"}
        </button>

        <select
          className="yc-sel yc-c-f" data-empty={e.fire ? "0" : "1"}
          value={e.fire ?? ""} aria-label={`${i + 1}번 발동 여부`}
          onChange={(ev) => patch(s, e.id, { fire: ev.target.value })}
        >
          <option value="" disabled>선택</option>
          {_h.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>

        <select
          className="yc-sel yc-c-g" data-empty={e.grp ? "0" : "1"}
          value={e.grp ?? ""} aria-label={`${i + 1}번 종류`}
          onChange={(ev) => {
            const grp = ev.target.value;
            const keep = _n(grp) === kind ? e.op : null;
            patch(s, e.id, { grp, op: keep });
          }}
        >
          <option value="" disabled>선택</option>
          {_i.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>

        <input
          className="yc-input yc-c-v" inputMode="numeric" placeholder="수치"
          aria-label={`${i + 1}번 수치`}
          data-hide={_X ? "0" : "1"}
          tabIndex={_X ? 0 : -1}
          aria-hidden={!_X}
          value={e.value}
          onChange={(ev) => patch(s, e.id, { value: ev.target.value })}
        />

        <select
          className="yc-sel yc-c-o" data-empty={e.op ? "0" : "1"}
          value={e.op ?? ""} aria-label={`${i + 1}번 연산`}
          disabled={!kind}
          onChange={(ev) => patch(s, e.id, { op: ev.target.value })}
        >
          <option value="" disabled>선택</option>
          {ops.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>

        {canVary ? (
          <button
            className="yc-chip yc-c-x" aria-pressed={e.varying ? "true" : "false"}
            title="참조하는 카드 수에 따라 변하는 효과"
            onClick={() => patch(s, e.id, { varying: !e.varying })}
          >
            카드수
          </button>
        ) : (
          <span className="yc-c-x" aria-hidden="true" />
        )}

        <div className="yc-mini yc-c-m">
          <button
            className="yc-btn yc-grip"
            title="끌어서 순서 바꾸기" aria-label="순서 바꾸기"
            onPointerDown={(ev) => _Q(ev, s, i)}
            onPointerMove={_R}
            onPointerUp={_S}
            onPointerCancel={_S}
          >≡</button>
          <button className="yc-btn"
            onClick={() => _V(s, (l) => l.filter((x) => x.id !== e.id))}
            aria-label="삭제">×</button>
        </div>

        {canVary && e.varying && (
          <div className="yc-var">
            <label className="yc-varf">
              {!tight && <span>×개수</span>}
              <input className="yc-input" inputMode="numeric"
                placeholder={tight ? "×개수" : "수치"} aria-label="×개수"
                value={e.count}
                onChange={(ev) => patch(s, e.id, { count: ev.target.value })} />
            </label>
            <label className="yc-varf">
              {!tight && <span>이후에 적용될 순서</span>}
              <select className="yc-sel" value={e.after} aria-label="이후에 적용될 순서"
                onChange={(ev) => patch(s, e.id, { after: ev.target.value })}>
                {lists[s].map((_, n) => (
                  <option key={n} value={n + 1}>
                    {tight ? `적용 순서 ${n + 1} 이후` : n + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="yc-varf">
              {!tight && <span>변화한 개수</span>}
              <input className="yc-input" inputMode="numeric"
                placeholder={tight ? "변화한 개수" : "수치"} aria-label="변화한 개수"
                value={e.count2}
                onChange={(ev) => patch(s, e.id, { count2: ev.target.value })} />
            </label>
          </div>
        )}
      </div>
    );
  };

  const _L = (s) => (
    <div className="yc-panel">
      <label className="yc-lab" htmlFor={`yc-base-${s}`}>원래 {s}</label>
      <input
        id={`yc-base-${s}`} className="yc-input" inputMode="numeric"
        value={bases[s]}
        onChange={(ev) => setBases((b) => ({ ...b, [s]: ev.target.value }))}
      />

      <p className="yc-lab" style={{ marginTop: 22 }}>적용 순서</p>

      {lists[s].length === 0 && (
        <p className="yc-empty">효과가 없습니다. 아래에서 추가하세요.</p>
      )}

      <div className="yc-list" ref={(el) => { _P.current[s] = el; }}>
        {lists[s].map((e, i) => _K(s, e, i))}
      </div>

      <button
        className="yc-add"
        onClick={() => _V(s, (l) => [...l, _J()])}
      >
        효과 추가
      </button>
    </div>
  );

  const _M = (s) => {
    const r = _W[s];
    const hasTemp = lists[s].some((e) => e.temp);
    return (
      <div className="yc-panel yc-out">
        {hasTemp ? (
          <>
            <div className="yc-block">
              <span className="yc-blocklab">턴 종료 전</span>
              {_N(s, r.now)}
            </div>
            <div className="yc-block yc-block--after">
              <span className="yc-blocklab">턴 종료 후</span>
              {_N(s, r.after)}
            </div>

            <div className="yc-tabs">
              {[["now", "턴 종료 전"], ["after", "턴 종료 후"]].map(([k, l]) => (
                <button key={k} data-on={traceTab === k ? "1" : "0"}
                  onClick={() => setTraceTab(k)}>
                  {l} 계산 흐름
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="yc-block">{_N(s, r.now)}</div>
        )}

        <ol className="yc-chain">
          {r[hasTemp ? traceTab : "now"].trace.map((t, i) => (
            <li className="yc-link" key={i}
                data-hit={t.kind === "override" ? "2" : t.note ? "2" : t.kind === "start" ? "0" : "1"}>
              <div className="yc-lt">
                <span className="yc-name">
                  {}
                  {t.label}
                </span>
                <span className="yc-val">
                  {t.before !== undefined && t.before !== t.value && (
                    <span className="yc-was">{t.before}</span>
                  )}
                  {t.value}
                </span>
              </div>
              {t.note && <div className="yc-note">{t.note}</div>}
            </li>
          ))}
        </ol>
      </div>
    );
  };

  

  return (
    <div className="yc" data-theme={dark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="yc-wrap" ref={wrapRef} data-narrow={narrow ? "1" : "0"}>
        <div className="yc-head">
          <h1 className="yc-h1">유희왕 공격력 / 수비력 계산기</h1>
          <div className="yc-tools">
            <button className="yc-theme" data-on={narrow ? "1" : "0"}
              onClick={() => setNarrow((v) => !v)}
              aria-pressed={narrow} title="좁은 화면 배치로 미리보기">
              모바일
            </button>
            <button className="yc-theme" onClick={() => setDark((d) => !d)}
              aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
              title={dark ? "라이트 모드" : "다크 모드"}>
              {dark ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.3 14.9A8.5 8.5 0 0 1 9.1 3.7a8.5 8.5 0 1 0 11.2 11.2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="yc-sub">
              <p>클로드 AI를 이용하여 만든 공격력 / 수비력 계산기입니다.</p>
              <p>
                공식적인 사무국은 아니기 때문에 언제나 참고용으로만 사용해 주시고,
                최신 재정은{" "}
                <a href="https://www.db.yugioh-card.com/yugiohdb/?request_locale=ja"
                   target="_blank" rel="noreferrer">유희왕 OCG 데이터 베이스</a>{" "}
                또는 사무국 답변에 따라주세요.
              </p>
              <p>
                원래 공격력 / 수비력에 수치를 기입한 다음에{" "}
                <b>“체인 순서가 아닌”</b> 적용되는 순서대로 적어주세요.
              </p>
              <p className="yc-ex">
                <span className="yc-exlab">Ex)</span> 체인 1 : BF-질풍의 게일 → 적용 순서 2번<br />
                <span className="yc-exlab" aria-hidden="true">{"\u00A0\u00A0\u00A0"}</span> 체인 2 : 금지된 성창 → 적용 순서 1번
              </p>
              <p>
                또한, 턴 종료시까지만 적용되는 효과면 <b>“영구”</b> 버튼을 누르시면
                <b>“턴 종료시”</b>로 지정할 수 있습니다.
                이 경우에는 턴 종료 전까지의 수치와 턴 종료 이후의 수치를 모두 볼 수 있습니다.
              </p>

              <hr />

              <button className="yc-more" aria-expanded={more}
                onClick={() => setMore((v) => !v)}>
                용어 설명 {more ? "접기" : "더보기"}
              </button>

              {more && (
                <dl className="yc-terms">
                  <dt>발동형</dt>
                  <dd>발동하는 효과로 이루어지는 처리</dd>
                  <dt>비발동형</dt>
                  <dd>
                    장착 카드, 지속 효과 등 발동하지 않는 효과로 이루어지는 처리 및
                    발동한 효과 이후 잔존 효과로 적용되는 처리
                  </dd>
                  <dt>단순 증감</dt>
                  <dd>[돌진]처럼 단순하게 공격력 / 수비력의 증감이 이루어지는 분류</dd>
                  <dt>특정 수치 변경</dt>
                  <dd>
                    [BF-질풍의 게일]처럼 공격력 / 수비력을 절반으로 한다 / 배가 된다 /
                    0이 된다 / ~가 된다 등의 처리가 이루어지는 분류
                  </dd>
                  <dt>원래 수치 변경</dt>
                  <dd>
                    [수축]처럼 “원래 공격력 / 수비력”을 절반으로 한다 / 배가 된다 /
                    0이 된다 / ~가 된다 등의 처리가 이루어지는 분류
                  </dd>
                </dl>
              )}
        </div>

        <div className="yc-toggle">
          {STATS.map((s) => (
            <button key={s} data-on={on[s] ? "1" : "0"}
              aria-pressed={on[s]} onClick={() => _U(s)}>
              {s}
            </button>
          ))}
        </div>

        {active.map((s) => (
          <section className="yc-sec" key={s}>
            {active.length > 1 && <h2 className="yc-sechead">{s}</h2>}
            <div className="yc-grid">
              {_L(s)}
              {_M(s)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
