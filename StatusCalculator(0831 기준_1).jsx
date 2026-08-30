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

export const _ba = [
  { id: "fixed", label: "특정 수치" },
  { id: "orig",  label: "원래 수치" },
  { id: "plain", label: "단순히" },
  { id: "zero",  label: "0 이 된다", alone: true },
  { id: "swap",  label: "공수를 맞바꾼다", alone: true },
];
export const _bb = [
  { id: "as",     label: "가 된다" },
  { id: "half",   label: "절반" },
  { id: "double", label: "2배" },
  { id: "triple", label: "3배" },
];

const _bc = {
  "fixed|as": "fixed",
  "orig|as": "toOrig",
  "orig|half": "origHalf",
  "orig|double": "origDouble",
  "orig|triple": "origTriple",
  "plain|half": "half",
  "plain|double": "double",
  "plain|triple": "triple",
};
export const _bd = (base, mode) => {
  if (!base) return "";
  if (base === "zero" || base === "swap") return base;
  return _bc[`${base}|${mode}`] ?? "";
};

export const _g = {
  delta: [
    { id: "up",   label: "올린다" },
    { id: "down", label: "내린다" },
  ],
  set: [
    { id: "fixed",      label: "특정 수치", needsValue: true },
    { id: "toOrig",     label: "원래 수치가 된다" },
    { id: "swap",       label: "공수를 맞바꾼다" },
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

const _p = ["origDouble", "origTriple", "origHalf", "toOrig"];

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
    case "toOrig":     return _d(ref);
    
    case "swap":       return value;
    case "double": return _d(value * 2);
    case "triple": return _d(value * 3);
    case "half":   return _d(value / 2);
    default:       return value;
  }
}

const _bv = (eff) =>
  !eff.vary ? [] : Array.isArray(eff.vary) ? eff.vary : [eff.vary];

const _bw = (eff) => {
  const st = _bv(eff).filter((v) => v.next !== undefined);
  return st.length ? st[st.length - 1].next : undefined;
};

const _e = (eff) => {
  const o = [..._g.delta, ..._g.set].find((x) => x.id === eff.op) ?? { label: "" };
  if (eff.op === "up" || eff.op === "down") return `${eff.value} ${o.label}`;
  if (eff.wasSwap) return "공수를 맞바꿨다";
  if (eff.op === "fixed" || eff.op === "_w") return `${eff.value} 이 된다`;
  return o.label;
};

export function _a(base, effects) {
  const list = effects.map((e, i) => ({ ...e, order: i }));
  const _q = list.filter((e) => _f[e.cat].group === "original");
  const trace = [];

  
  const _v = new Set();
  
  const _ad = new Map();
  
  const _w = new Map();

  let orig = base;
  let _bf = null;
  let _bg = [];
  const live = [];
  const fired = new Set();

  const cur = () => {
    let v = _bf ? _bf.value : orig;
    for (const d of _bg) v = _d(v + d.value);
    return v;
  };
  const _bh = () => {
    let v = orig;
    for (const d of _bg) v = _d(v + d.value);
    return v;
  };
  const _ag = (e) => {
    if (_p.includes(e.op)) return orig;
    return _bf && _bf.order === e.order ? _bh() : cur();
  };

  const push = (e, before, value, note) =>
    trace.push({ kind: "step", cat: e.cat, label: _e(e), before, value, note });

  
  const _ac = (e) => {
    const steps = _bv(e).filter((v) => v.next !== undefined);
    if (!steps.length) return undefined;
    const i = _q.indexOf(e);
    const next = i < 0 ? null : _q[i + 1];
    const usable = steps.filter((v) => !next || v.after - 1 < next.order);
    return usable.length ? usable[usable.length - 1].next : undefined;
  };

  const _bi = (skip) => {
    for (const item of live) {
      if (_v.has(item.eff.order) || item.eff.order === skip) continue;
      const now = _ag(item.eff);
      if (now === item.lastInput) continue;
      const before = cur();
      const readsCur = READS_CURRENT.includes(item.eff.op) || item.eff.readsCurrent;
      const own = _bf && _bf.order === item.eff.order;
      item.lastInput = now;
      _bf = { ..._bf, value: _c(now, item.eff, orig), order: item.eff.order };
      
      if (readsCur && own) _bg = [];
      push(item.eff, before, cur(), "재계산");
    }
  };

  const _af = (upto) => {
    for (const d of list) {
      _bv(d).forEach((v, k) => {
        const key = `${d.order}:${k}`;
        if (fired.has(key) || v.after - 1 > upto) return;
        fired.add(key);
        if (_v.has(d.order)) return;
        const before = cur();
        if (v.delta !== undefined && _f[d.cat].kind === "delta") {
          const held = _bg.find((x) => x.order === d.order);
          if (!held) return;
          held.value += v.delta;
        } else if (v.next !== undefined && _f[d.cat].group === "current") {
          if (!_bf || _bf.order !== d.order) return;
          _bf = { ..._bf, value: _c(cur(), { ...d, value: v.next }, orig) };
        } else return;
        const shown = v.next ?? Math.abs(v.delta ?? 0);
        push(
          { ...d, value: shown }, before, cur(),
          v.from === undefined ? undefined : `개수 ${v.from} 에서 ${v.to} 변동`
        );
      });
    }
  };

  trace.push({ kind: "base", label: "원래 수치", value: base });

  for (const e of list) {
    const c = _f[e.cat];

    if (c.group === "original") {
      const before = cur();
      const nv = _ac(e);
      const src = nv !== undefined ? { ...e, value: nv } : e;
      const b2 = orig;
      orig = _c(orig, src, orig);
      _q.forEach((p) => { if (p.order < e.order) _v.add(p.order); });
      if (_bf && _bf.timing === "oneShot") {
        _v.add(_bf.order);
        _bf = null;
      }
      if (c.timing === "oneShot") _w.set(e.order, orig);
      trace.push({
        kind: "orig", cat: e.cat, label: _e(src),
        before: b2, value: orig, note: b2 === orig ? undefined : undefined,
      });
      _bi();
      _af(e.order);
      continue;
    }

    if (c.kind === "delta") {
      const before = cur();
      _bg.push({
        order: e.order, timing: c.timing,
        value: e.op === "down" ? -e.value : e.value,
      });
      push(e, before, cur());
      _bi();
      _af(e.order);
      continue;
    }

    const before = cur();
    const value = _c(cur(), e, orig);
    const readsCurrent = READS_CURRENT.includes(e.op) || e.readsCurrent;

    
    const keep = (d) => c.timing === "continuous" && !readsCurrent && d.timing === "continuous";
    _bg.forEach((d) => {
      if (keep(d)) return;
      _v.add(d.order);
      _ad.set(d.order, e);
    });
    _bg = _bg.filter(keep);
    if (_bf && _bf.timing === "oneShot") {
      _v.add(_bf.order);
      _ad.set(_bf.order, e);
    }

    _bf = { value, timing: c.timing, order: e.order, readsCurrent };
    if (c.timing === "oneShot") _w.set(e.order, value);
    if (c.timing === "continuous" && MULT.includes(e.op)) {
      live.push({ eff: e, lastInput: before });
    }
    push(e, before, cur());
    _bi(e.order);
    _af(e.order);
  }

  _af(Infinity);

  return {
    _ad,
    original: clamp(orig),
    current: clamp(cur()),
    raw: cur(),
    trace: trace.map((t) => ({
      ...t,
      value: clamp(t.value),
      before: t.before === undefined ? undefined : clamp(t.before),
    })),
    _v, _w,
  };
}

export function _b(base, effects, other = [], otherBase = 0) {
  
  const _al = (list, drop = () => false) =>
    _aa(list, other.filter((e) => !drop(e)), otherBase, base);

  const _ak = _a(base, _al(effects));

  
  const _aj = (drop) => {
    const _H = effects
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => {
        if (drop(e)) return false;
        if (!_ak._v.has(i)) return true;
        if (e.vary) return true;
        const by = _ak._ad.get(i);
        return !!by && drop(by);
      })
      .map(({ e, i }) =>
        _bw(e) !== undefined ? { e: { ...e, value: _bw(e) }, i } : { e, i }
      )
      .map(({ e, i }) => {
        const c = _f[e.cat];
        const value = _ak._w.get(i);
        const isOneShotSet = c.kind === "set" && c.timing === "oneShot";
        return isOneShotSet && value !== undefined
          ? { ...e, op: "_w", value, readsCurrent: READS_CURRENT.includes(e.op) }
          : e;
      });
    return _a(base, _al(_H, drop));
  };

  const hasOff = effects.some((e) => e.off);
  const now = hasOff ? _aj((e) => !!e.off) : _ak;
  if (hasOff) {
    effects.forEach((e) => {
      if (!e.off) return;
      now.trace.push({
        kind: "off", cat: e.cat,
        label: _e(e),
        value: now.current, note: "적용되지 않음",
      });
    });
  }
  const after = _aj((e) => !!e.off || !!e.temp);
  const hasTemp = effects.some((e) => e.temp);
  return { now, after, hasTemp };
}

export function _aa(self, other, otherBase, selfBase = 0, depth = 3) {
  const _ab = other
    .map((e, i) => (e.op === "swap" ? i : -1))
    .filter((i) => i >= 0);
  let seen = 0;

  return self.map((e) => {
    if (e.op !== "swap") return e;
    const cut = _ab[seen++] ?? other.length;
    const before = other.slice(0, cut);
    const prefix =
      depth > 0
        ? _aa(before, self, selfBase, otherBase, depth - 1)
        : before.filter((x) => x.op !== "swap");
    const r = _a(Number(otherBase) || 0, prefix);
    const value = _f[e.cat].group === "original" ? r.original : r.current;
    return { ...e, op: "fixed", value, readsCurrent: true, wasSwap: true };
  });
}

export const _bo = [
  { date: "2026-08-30", items: ["테스트입니다"] },
];

export function _bx({ more, setMore }) {
  return (
    <div className="yc-sub">
      <p>클로드 AI 기반으로 만들어진 유희왕 공격력 / 수비력 계산기입니다.</p>
      <p>
        최대한 공식 답변을 이용하여 제작되었으나, 오류가 있을 수도 있기 때문에
        참고용으로 사용해 주시면 감사하겠습니다.
      </p>
      <p>
        최신 재정은{" "}
        <a href="https://www.db.yugioh-card.com/yugiohdb/?request_locale=ja"
          target="_blank" rel="noreferrer">유희왕 OCG 데이터베이스</a>{" "}
        및 공식 사무국 답변에 따라주세요.
      </p>
      <p>
        사용하시다가 공식 답변과 다른 오류가 있으시다면{" "}
        <a href="mailto:wnsdud0678@gmail.com">wnsdud0678@gmail.com</a>로
        알려주시면 감사하겠습니다.<br />
        (계산 내용이 공식 답변과 다른 경우 최대한 공식 답변을 볼 수 있는 링크
        또는 이미지와 함께 첨부해서 제보해 주시면 적극 반영하겠습니다)
      </p>
      <p>사용 방법입니다.</p>
      <p>
        수치를 계산할 몬스터의 원래 공격력 또는 원래 수비력에 수치를 기입한 다음에{" "}
        <b>“체인 순서가 아닌”</b> 적용되는 순서대로 적어주세요.
      </p>
      <p className="yc-ex">
        <span className="yc-exlab">Ex)</span> 체인 1 : BF-질풍의 게일 → 적용 순서 2번<br />
        <span className="yc-exlab" aria-hidden="true">{"\u00A0\u00A0\u00A0"}</span> 체인 2 : 금지된 성창 → 적용 순서 1번
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
          <dt>영구</dt>
          <dd>
            기본적으로 효과의 적용 기간이 없는 상태입니다.
            턴 종료 시 등 기간이 정해져 있다면 해당 버튼을 눌러주세요.
          </dd>
          <dt>카드수</dt>
          <dd>
            [야미즈먼트☆미뇽]과 같이 (특정 변수) × (숫자) 식으로 이루어진
            텍스트에 사용하는 버튼입니다.
            기본적으로 처리 이후의 개체 수 변화에도 대응하도록 만들어져 있으나
            변화가 없다면 같은 숫자를 넣어주시면 됩니다.
          </dd>
          <dt>OFF</dt>
          <dd>
            처리 중에 무효 / 파괴가 되어서 더 이상
            “효과가 적용되지 않는 상태”를 표기할 때에 사용하는 버튼입니다.
          </dd>
        </dl>
      )}
    </div>
  );
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
.yc-h1{font-size:26px;font-weight:800;letter-spacing:-.01em;margin:0;
  flex:1;text-align:center;}

.yc-maintabs{display:flex;align-items:flex-end;gap:20px;margin:0 0 16px;
  border-bottom:1px solid var(--edge);}
.yc-maintabs .yc-tools{margin-left:auto;padding-bottom:6px;}
.yc-tab{background:transparent;border:0;border-bottom:3px solid transparent;
  color:var(--muted);cursor:pointer;font:inherit;font-size:19px;font-weight:800;
  letter-spacing:-.01em;padding:0 2px 8px;margin-bottom:-1px;}
.yc-tab:hover{color:var(--ink);}
.yc-tab[data-on="1"]{color:var(--ink);border-bottom-color:var(--gold);}
.yc-notes{line-height:1.75;}
.yc-notedate{font-size:14px;font-weight:800;color:var(--gold);margin:0 0 6px;}
.yc-note + .yc-note{margin-top:18px;border-top:1px dashed var(--edge);padding-top:16px;}
.yc-notes ul{margin:0;padding-left:18px;}
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
.yc-grid{display:grid;grid-template-columns:1fr 280px;gap:12px;align-items:start;}
.yc-sec + .yc-sec{margin-top:30px;}
.yc-sechead{font-size:15px;font-weight:800;letter-spacing:-.01em;margin:0 0 10px;
  padding-bottom:6px;border-bottom:2px solid var(--gold);}
@container (max-width:820px){.yc-grid{grid-template-columns:1fr;}}
.yc-panel{background:var(--surface);border:1px solid var(--edge);border-radius:10px;padding:18px;
  box-shadow:0 1px 2px var(--shadow);}

.yc-in{padding:18px 4px 12px;}
.yc-in > .yc-lab,.yc-in > .yc-input{margin-left:12px;margin-right:12px;width:auto;}
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
  grid-template-columns:18px 66px minmax(0,.85fr) minmax(0,1.25fr) 68px minmax(0,1.05fr) auto 66px;
  gap:5px;align-items:center;margin-bottom:8px;border-radius:6px;
  transition:transform .16s cubic-bezier(.2,.7,.3,1);}

.yc-row .yc-sel,.yc-row .yc-input,.yc-row .yc-chip,.yc-row .yc-btn{height:38px;padding-top:0;padding-bottom:0;}

.yc-row .yc-sel{padding-left:4px;padding-right:2px;}
.yc-row .yc-input{padding-left:6px;padding-right:6px;}
.yc-ops{display:contents;}
.yc-mini{align-self:stretch;}

.yc-row[data-num="0"]{
  grid-template-columns:18px 66px minmax(0,.85fr) minmax(0,1.25fr) minmax(0,1.05fr) auto 66px;}

.yc-row[data-mode="1"]{
  grid-template-columns:18px 64px 81px minmax(0,1fr) 68px
                        88px 70px auto 54px;}
.yc-row[data-mode="1"][data-num="0"]{
  grid-template-columns:18px 64px 81px minmax(0,1fr)
                        88px 70px auto 54px;}

@container (min-width:561px){
  
  .yc-row{row-gap:0;}
  .yc-row > .yc-c-n{grid-row:1 / span 9;display:flex;align-items:center;
    justify-content:center;}
  .yc-var{grid-column:2/-3;display:flex;flex-wrap:nowrap;align-items:flex-end;gap:6px;
    margin:2px 0 4px;padding:0;font-size:11.5px;color:var(--muted);}
  .yc-off{grid-column:-3/-1;display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;
    margin:2px 0 4px;padding:0;font-size:11.5px;color:var(--muted);}
  
  .yc-var .yc-input{width:auto;min-width:62px;text-align:center;}
  .yc-var .yc-sel{width:auto;min-width:104px;}
  
  .yc-varchk{display:flex;align-items:center;justify-content:center;
    width:38px;height:38px;flex:0 0 auto;
    background:transparent;border:1px solid var(--edge);border-radius:6px;
    color:var(--muted);cursor:pointer;font:inherit;font-size:14px;padding:0;}
  .yc-varchk[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);
    color:var(--onGold);}
  
  .yc-var{display:grid;align-items:end;gap:6px;
    grid-template-columns:18px minmax(62px,.75fr) minmax(104px,1.2fr)
                          minmax(62px,.75fr) 38px;}
  .yc-varrow{display:contents;}
  .yc-varrow > :nth-child(1){grid-column:3;}
  .yc-varrow > :nth-child(2){grid-column:4;}
  .yc-varrow > :nth-child(3){grid-column:5;}
  .yc-varx{grid-column:1;grid-row:1;margin:0;width:18px;}
  .yc-varf--c1{grid-column:2;grid-row:1;}
  .yc-varf--c2{grid-column:3;grid-row:1;}
  .yc-varf--c3{grid-column:4;grid-row:1;}
  .yc-var > .yc-varchk{grid-column:5;grid-row:1;}
  .yc-var .yc-input,.yc-var .yc-sel{width:100%;min-width:0;}
  
  .yc-off{align-self:start;}
.yc-varx{display:flex;align-items:center;justify-content:center;width:18px;height:38px;
    color:var(--muted);font-size:14px;margin-right:-8px;}
  
  .yc-row[data-offrow="1"][data-vary="0"]{
    grid-template-columns:18px 66px minmax(0,.85fr) minmax(0,1.25fr) 68px
                          minmax(0,1.05fr) auto 118px 66px;}
  .yc-row[data-offrow="1"][data-vary="0"][data-num="0"]{
    grid-template-columns:18px 66px minmax(0,.85fr) minmax(0,1.25fr)
                          minmax(0,1.05fr) auto 118px 66px;}
  .yc-row[data-offrow="1"][data-vary="0"][data-mode="1"]{
    grid-template-columns:18px 64px 81px minmax(0,1fr) 68px
                          88px 70px auto 118px 54px;}
  .yc-row[data-offrow="1"][data-vary="0"][data-mode="1"][data-num="0"]{
    grid-template-columns:18px 64px 81px minmax(0,1fr)
                          88px 70px auto 118px 54px;}
  .yc-row[data-offrow="1"][data-vary="0"] .yc-off{
    grid-column:-3/-2;grid-row:1;margin:0;}
  .yc-row[data-offrow="1"][data-vary="0"] .yc-mini{grid-column:-2/-1;}
}
.yc-c-x{flex:0 0 auto;min-width:44px;justify-self:end;}
.yc-row .yc-c-o2{padding-left:4px;padding-right:2px;}
.yc-chips{display:flex;gap:5px;}
.yc-chips .yc-chip{min-width:44px;}
.yc-chips .yc-chip{width:auto;padding:0 5px;}

.yc-c-x:empty{min-width:0;width:0;padding:0;border:0;}

.yc-off .yc-sel{width:100%;min-width:0;}
.yc-off .yc-varf{flex:1;min-width:0;}
.yc-varf{display:flex;flex-direction:column;align-items:stretch;gap:3px;min-width:0;}

.yc-varf > span{text-align:center;}
.yc-input[data-hide="1"]{display:none;}

@media(max-width:560px){.yc{padding:18px 12px 44px;}}
@container (max-width:560px){
  .yc-panel{padding:12px;}
  .yc-h1{font-size:19px;}
  .yc-tab{font-size:13px;padding-bottom:6px;}
  
  .yc-row,
  .yc-row[data-num="0"],
  .yc-row[data-mode="1"],
  .yc-row[data-mode="1"][data-num="0"]{
    display:grid;gap:5px;align-items:stretch;
    grid-template-columns:15px 46px minmax(0,1fr) minmax(0,1fr) minmax(0,.85fr) 38px;}

  
  
  .yc-ops{grid-area:p;display:grid;gap:5px;min-width:0;
    grid-template-columns:62px minmax(0,1fr);}
  .yc-row[data-num="0"] .yc-ops{grid-template-columns:minmax(0,1fr);}
  .yc-row[data-mode="1"] .yc-ops{
    grid-template-columns:62px minmax(0,1fr) minmax(0,.8fr);}
  .yc-row[data-mode="1"][data-num="0"] .yc-ops{
    grid-template-columns:minmax(0,1fr) minmax(0,.8fr);}
  .yc-ops > *{min-width:0;width:100%;}
  .yc-ops .yc-c-v{text-align:center;}

  
  .yc-row{grid-template-areas:"n t f g g m"
                              "n p p p p m";}
  
  .yc-row[data-x="1"][data-open="0"]{grid-template-areas:"n t f g g m1"
                                                         "n x p p p m2";}
  
  .yc-row[data-x="1"][data-cv="0"][data-offrow="1"]{
    grid-template-areas:"n t f g g m1"
                        "n z w w w w"
                        "n p p p p m2";}
  .yc-row[data-x="1"][data-vary="1"][data-offrow="0"]{
    grid-template-areas:"n t f g g m1"
                        "n x y y y y"
                        "n z p p p m2";}
  .yc-row[data-x="1"][data-cv="1"][data-vary="0"][data-offrow="1"]{
    grid-template-areas:"n t f g g m1"
                        "n x p p p m2"
                        "n z w w w w";}
  .yc-row[data-x="1"][data-vary="1"][data-offrow="1"]{
    grid-template-areas:"n t f g g m1"
                        "n x y y y y"
                        "n z w w w w"
                        "n p p p p m2";}
  .yc-row[data-x="1"] .yc-c-m{display:contents;}
  .yc-row[data-x="1"] .yc-grip{grid-area:m1;}
  .yc-row[data-x="1"] .yc-del{grid-area:m2;}

  .yc-row[data-open="0"] .yc-chips{display:flex;flex-direction:column;gap:3px;
    grid-area:x;height:100%;width:100%;justify-self:stretch;min-width:0;}
  .yc-row[data-open="0"] .yc-cv,
  .yc-row[data-open="0"] .yc-offchip{grid-area:auto;height:auto;flex:1;min-height:0;
    width:100%;font-size:9px;}
  .yc-row[data-x="1"] .yc-c-m{display:contents;}
  .yc-row[data-x="1"] .yc-grip{grid-area:m1;}
  .yc-row[data-x="1"] .yc-del{grid-area:m2;}
  .yc-row[data-x="1"] .yc-grip,
  .yc-row[data-x="1"] .yc-del{height:40px;align-self:center;}
  .yc-row > *{min-height:40px;}
  
  .yc-row > .yc-c-n{grid-area:n;display:flex;align-items:center;
    justify-content:center;font-size:11px;}
  .yc-row .yc-var{grid-area:y;}
  .yc-row .yc-off{grid-area:w;}
  .yc-c-t{grid-area:t;font-size:10px;padding:0 2px;}
  .yc-c-f{grid-area:f;}
  .yc-c-g{grid-area:g;}
  .yc-c-m{grid-area:m;display:flex;flex-direction:column;gap:5px;}
  .yc-c-m .yc-btn{flex:1;min-height:0;padding:0;font-size:13px;}
  .yc-chips{display:contents;}
  .yc-cv{grid-area:x;}
  .yc-offchip{grid-area:z;}
  
  .yc-row .yc-cv,.yc-row .yc-offchip{height:40px;align-self:start;
    font-size:10px;padding:0 2px;}
  
  .yc-c-x:empty{display:none;}
  .yc-chips:empty{display:none;}
  

  .yc-row .yc-sel,.yc-row .yc-input{padding:0 3px;font-size:11px;}
  .yc-row .yc-sel,.yc-row .yc-input{height:40px;}
  .yc-row .yc-c-t{height:40px;}
  
  .yc-var{grid-area:y;padding:0;margin:0;width:100%;min-height:0;
    display:grid;gap:5px;font-size:10px;align-items:stretch;
    grid-template-columns:minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr) 38px;}
  .yc-varrow{display:contents;}
  .yc-varrow > :nth-child(1){grid-column:2;}
  .yc-varrow > :nth-child(2){grid-column:3;}
  .yc-varrow > :nth-child(3){grid-column:4;}
  .yc-varf--c1{grid-column:1;grid-row:1;}
  .yc-varf--c2{grid-column:2;grid-row:1;}
  .yc-varf--c3{grid-column:3;grid-row:1;}
  .yc-varchk{display:flex;align-items:center;justify-content:center;height:40px;
    width:100%;justify-self:stretch;
    background:transparent;border:1px solid var(--edge);border-radius:6px;
    color:var(--muted);cursor:pointer;font:inherit;font-size:14px;padding:0;}
  .yc-varchk[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);
    color:var(--onGold);}
  .yc-varf{flex-direction:column;align-items:stretch;gap:2px;min-width:0;height:40px;}
  .yc-varf > span{white-space:nowrap;}
  
  .yc-varf--off{grid-column:1/-1;}
  
  .yc-off{grid-area:w;padding:0;margin:0;width:100%;min-height:0;
    display:grid;gap:5px;font-size:10px;align-items:stretch;}
  .yc-off .yc-varf{height:40px;}
  .yc-off .yc-sel{width:100%;height:100%;min-width:0;padding:0 2px;font-size:10px;
    text-align:center;}
  .yc-varx{display:none;}
  .yc-var .yc-input,.yc-var .yc-sel{width:100%;height:100%;min-width:0;
    padding:0 2px;font-size:10px;text-align:center;}
  .yc-input[data-hide="1"]{display:none;}
}
.yc-chip{width:100%;background:transparent;border:1px solid var(--edge);border-radius:6px;
  color:var(--muted);cursor:pointer;font:inherit;font-size:11.5px;padding:0;white-space:nowrap;}
.yc-chip:hover{border-color:var(--gold);color:var(--gold);}
.yc-chip[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);color:var(--onGold);font-weight:700;}
.yc-chip:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.yc-row[data-drag="1"]{background:var(--surface);box-shadow:0 8px 20px var(--shadow);}

.yc-row + .yc-row{border-top:1px dashed var(--edge);padding-top:8px;}
.yc-n{font-variant-numeric:tabular-nums;color:var(--gold);font-weight:700;font-size:13px;
  text-align:center;user-select:none;}
.yc-grip{cursor:grab;color:var(--muted);font-size:15px;line-height:1;letter-spacing:.5px;
  touch-action:none;user-select:none;-webkit-user-select:none;}
.yc-grip:active{cursor:grabbing;}
.yc-mini{display:flex;gap:5px;}
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

.yc-statnote{font-size:12px;color:var(--muted);margin-top:2px;}
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
.yc-note--plain{color:var(--muted);}
`;

const _O = (() => { let n = 0; return () => ++n; })();

const _J = () => ({
  id: _O(), fire: null, grp: null, op: null, value: "", temp: false,
  opBase: "", opMode: "",
  varying: false, count: "", count2: "", after: "1",
  off: false, offAfter: "1",
  twin: null, steps: [],
});

export default function StatusCalculator() {
  const STATS = ["공격력", "수비력"];

  const [on, setOn] = useState({ 공격력: true, 수비력: false });
  const [dark, setDark] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [tab, setTab] = useState("계산기");
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
            value: unit, temp: !!e.temp, off: !!e.off,
          };
          if (!e.varying) return base;
          
          const counts = [
            Number(e.count) || 0,
            Number(e.count2) || 0,
            ...(e.steps ?? []).map((x) => Number(x.count) || 0),
          ];
          const afters = [
            Number(e.after) || 1,
            ...(e.steps ?? []).map((x) => Number(x.after) || 1),
          ];
          const vary = afters.map((after, k) => ({
            after,
            from: counts[k], to: counts[k + 1],
            ...(e.grp === "delta"
              ? { delta: unit * (counts[k + 1] - counts[k]) }
              : { next: unit * counts[k + 1] }),
          }));
          return { ...base, value: unit * counts[0], vary };
        });
    const _am = Object.fromEntries(STATS.map((s) => [s, _Y(lists[s])]));

    return Object.fromEntries(
      STATS.map((s) => {
        const otherName = s === "공격력" ? "수비력" : "공격력";
        return [
          s,
          _b(
            Number(bases[s]) || 0, _am[s],
            _am[otherName], Number(bases[otherName]) || 0
          ),
        ];
      })
    );
  }, [bases, lists]);

  const _V = (s, updater) =>
    setLists((all) => ({ ...all, [s]: updater(all[s]) }));

  const patch = (s, id, next) =>
    _V(s, (list) => list.map((e) => (e.id === id ? { ...e, ...next } : e)));

  const _bs = (s) => (s === "공격력" ? "수비력" : "공격력");

  
  const _bq = (s, e, opBase, opMode) => {
    const wasSwap = e.opBase === "swap";
    const isSwap = opBase === "swap";
    if (wasSwap === isSwap) return;
    const other = _bs(s);
    if (isSwap) {
      _V(other, (l) => [
        ...l,
        { ..._J(), twin: e.id, fire: e.fire, grp: e.grp, temp: e.temp,
          opBase: "swap", opMode: "", op: "swap" },
      ]);
    } else {
      _V(other, (l) => l.filter((x) => x.twin !== e.id));
    }
  };

  
  const _bp = (s, e, next) => {
    patch(s, e.id, next);
    const other = _bs(s);
    _V(other, (l) =>
      l.map((x) => (x.twin === e.id || x.id === e.twin ? { ...x, ...next } : x))
    );
  };

  const _br = (s, e) => {
    _V(s, (l) => l.filter((x) => x.id !== e.id));
    _V(_bs(s), (l) => l.filter((x) => x.twin !== e.id && x.id !== e.twin));
  };

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
      <div className="yc-statnote">
        ({s === "공격력" ? "사신 아바타" : "월경의 방패"}의 경우 : <b>{r.current + 100}</b>)
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
    
    const _be =
      kind === "set" && !!e.opBase &&
      !_ba.find((o) => o.id === e.opBase)?.alone;
    const canVary = e.fire === "off" && (e.grp === "delta" || e.op === "fixed");
    const canOff = e.fire === "off";
    return (
      <div
        className="yc-row" key={e.id}
        data-num={_X ? "1" : "0"}
        data-mode={_be ? "1" : "0"}
        data-x={canOff ? "1" : "0"}
        data-cv={canVary ? "1" : "0"}
        data-vary={canVary && e.varying ? "1" : "0"}
        data-offrow={canOff && e.off ? "1" : "0"}
        data-open={(canVary && e.varying) || (canOff && e.off) ? "1" : "0"}
        data-drag={drag && drag.stat === s && drag.from === i ? "1" : "0"}
        style={_T(s, i)}
      >
        <span className="yc-n yc-c-n">{i + 1}</span>

        <button
          className="yc-chip yc-c-t" aria-pressed={e.temp ? "true" : "false"}
          title={e.temp ? "턴 종료시까지만 적용됩니다" : "계속 적용됩니다"}
          onClick={() => _bp(s, e, { temp: !e.temp })}
        >
          {e.temp ? "턴 종료시" : "영구"}
        </button>

        <select
          className="yc-sel yc-c-f" data-empty={e.fire ? "0" : "1"}
          value={e.fire ?? ""} aria-label={`${i + 1}번 발동 여부`}
          onChange={(ev) => _bp(s, e, { fire: ev.target.value })}
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
            patch(s, e.id, { grp, op: null, opBase: "", opMode: "" });
            _V(_bs(s), (l) =>
              l.map((x) => (x.twin === e.id || x.id === e.twin ? { ...x, grp } : x))
            );
          }}
        >
          <option value="" disabled>선택</option>
          {_i.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>

        {}
        <div className="yc-ops">
          <input
            className="yc-input yc-c-v" inputMode="numeric" placeholder="수치"
            aria-label={`${i + 1}번 수치`}
            data-hide={_X ? "0" : "1"}
            tabIndex={_X ? 0 : -1}
            aria-hidden={!_X}
            value={e.value}
            onChange={(ev) => patch(s, e.id, { value: ev.target.value })}
          />

          {kind === "set" ? (
            <>
              <select
                className="yc-sel yc-c-o" data-empty={e.opBase ? "0" : "1"}
                value={e.opBase ?? ""} aria-label={`${i + 1}번 연산 기준`}
                onChange={(ev) => {
                  const opBase = ev.target.value;
                  _bq(s, e, opBase);
                  
                  const opMode = opBase === "fixed" ? "as" : "";
                  patch(s, e.id, { opBase, opMode, op: _bd(opBase, opMode) });
                }}
              >
                <option value="" disabled>선택</option>
                {_ba.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {_be && (
                <select
                  className="yc-sel yc-c-o2" data-empty={e.opMode ? "0" : "1"}
                  value={e.opMode ?? ""} aria-label={`${i + 1}번 연산 방식`}
                  
                  disabled={e.opBase === "fixed"}
                  onChange={(ev) => {
                    const opMode = ev.target.value;
                    patch(s, e.id, { opMode, op: _bd(e.opBase, opMode) });
                  }}
                >
                  <option value="" disabled>선택</option>
                  {_bb.filter(
                    (o) => o.id !== "as" || e.opBase !== "plain"
                  ).map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              )}
            </>
          ) : (
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
          )}
        </div>

        {canOff ? (
          <div className="yc-c-x yc-chips">
            {canVary && (
              <button
                className="yc-chip yc-cv" aria-pressed={e.varying ? "true" : "false"}
                title="참조하는 카드 수에 따라 변하는 효과"
                onClick={() => patch(s, e.id, { varying: !e.varying })}
              >
                카드수
              </button>
            )}
            <button
              className="yc-chip yc-offchip" aria-pressed={e.off ? "true" : "false"}
              title="도중에 무효가 되거나 파괴되는 효과"
              onClick={() => _bp(s, e, { off: !e.off })}
            >
              OFF
            </button>
          </div>
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
          <button className="yc-btn yc-del"
            onClick={() => _br(s, e)}
            aria-label="삭제">×</button>
        </div>

        {canVary && e.varying && (
          <div className="yc-var">
            <span className="yc-varx" aria-hidden="true">×</span>
            <label className="yc-varf yc-varf--c1">
              <input className="yc-input" inputMode="numeric"
                placeholder={tight ? "개수" : "×할 수치"} aria-label="곱할 수치"
                value={e.count}
                onChange={(ev) => patch(s, e.id, { count: ev.target.value })} />
            </label>
            <label className="yc-varf yc-varf--c2">
              <select className="yc-sel" value={e.after} aria-label="이후에 적용될 순서"
                onChange={(ev) => patch(s, e.id, { after: ev.target.value })}>
                {lists[s].map((_, n) => (
                  <option key={n} value={n + 1}>
                    {tight ? `순서 ${n + 1}` : `순서 ${n + 1} 이후 변화`}
                  </option>
                ))}
              </select>
            </label>
            <label className="yc-varf yc-varf--c3">
              <input className="yc-input" inputMode="numeric"
                placeholder={tight ? "이후개수" : "변화한 개수"} aria-label="변화한 개수"
                value={e.count2}
                onChange={(ev) => patch(s, e.id, { count2: ev.target.value })} />
            </label>
            {}
            {(() => {
              const on = (e.steps ?? []).length > 0;
              const i2 = 0;
              return (
              <button
                className="yc-varchk" aria-pressed={on ? "true" : "false"}
                title="개수가 한 번 더 바뀌는 경우"
                onClick={() => patch(s, e.id, {
                  steps: on
                    ? (e.steps ?? []).slice(0, i2)
                    : [...(e.steps ?? []), { after: "1", count: "" }],
                })}
              >
                {on ? "✓" : "+"}
              </button>
              );
            })()}
            {(e.steps ?? []).map((st, k) => {
              const i2 = k + 1;
              const on = (e.steps ?? []).length > i2;
              return (
                <div className="yc-varrow" key={`st${k}`}>
                  <label className="yc-varf">
                    <select className="yc-sel" value={st.after}
                      aria-label={`${k + 2}번째로 바뀌는 시점`}
                      onChange={(ev) => patch(s, e.id, {
                        steps: (e.steps ?? []).map((x, j) =>
                          j === k ? { ...x, after: ev.target.value } : x),
                      })}>
                      {lists[s].map((_, n) => (
                        <option key={n} value={n + 1}>
                          {tight ? `순서 ${n + 1}` : `순서 ${n + 1} 이후 변화`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="yc-varf">
                    <input className="yc-input" inputMode="numeric"
                      placeholder={tight ? "이후개수" : "변화한 개수"}
                      aria-label={`${k + 2}번째 변화한 개수`}
                      value={st.count}
                      onChange={(ev) => patch(s, e.id, {
                        steps: (e.steps ?? []).map((x, j) =>
                          j === k ? { ...x, count: ev.target.value } : x),
                      })} />
                  </label>
              <button
                className="yc-varchk" aria-pressed={on ? "true" : "false"}
                title="개수가 한 번 더 바뀌는 경우"
                onClick={() => patch(s, e.id, {
                  steps: on
                    ? (e.steps ?? []).slice(0, i2)
                    : [...(e.steps ?? []), { after: "1", count: "" }],
                })}
              >
                {on ? "✓" : "+"}
              </button>
                </div>
              );
            })}
          </div>
        )}

        {canOff && e.off && (
          <div className="yc-off">
            <label className="yc-varf yc-varf--off">
              <select className="yc-sel" value={e.offAfter}
                aria-label="무효·파괴되는 시점"
                onChange={(ev) => _bp(s, e, { offAfter: ev.target.value })}>
                {lists[s].map((_, n) => (
                  <option key={n} value={n + 1}>
                    {tight ? `적용 순서 ${n + 1} 이후 무효` : `순서 ${n + 1} 이후 적용X`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    );
  };

  const _L = (s) => (
    <div className="yc-panel yc-in">
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
                data-hit={t.kind === "off" ? "2" : t.kind === "base" ? "0" : "1"}>
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
              {t.note && (
                <div className={t.kind === "off" ? "yc-note" : "yc-note yc-note--plain"}>
                  {t.note}
                </div>
              )}
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
        <div className="yc-maintabs" role="tablist">
          {["계산기", "패치노트"].map((t) => (
            <button key={t} className="yc-tab" role="tab"
              aria-selected={tab === t} data-on={tab === t ? "1" : "0"}
              onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
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

        <div className="yc-head">
          <h1 className="yc-h1">유희왕 공격력 / 수비력 계산기</h1>
        </div>

        {tab === "패치노트" ? (
          <div className="yc-sub yc-notes">
            {_bo.map((n) => (
              <div className="yc-note" key={n.date}>
                <h2 className="yc-notedate">{n.date}</h2>
                <ul>
                  {n.items.map((it, k) => <li key={k}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <>
          <_bx more={more} setMore={setMore} />

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
          </>
        )}
      </div>
    </div>
  );
}
