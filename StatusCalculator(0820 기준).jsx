import { useState, useMemo } from "react";

/* ══════════════════════════════════════════════════════════════
   계산 로직 — UI와 분리되어 있으므로 그대로 떼어내 쓸 수 있습니다.
   근거: 遊戯王カードWiki「ステータス」
        → 攻撃力・守備力を変動させる効果について
   ══════════════════════════════════════════════════════════════ */

export const CATS = {
  1: { label: "발동 · 증감",        group: "current",  timing: "oneShot",    kind: "delta" },
  2: { label: "비발동 · 증감",      group: "current",  timing: "continuous", kind: "delta" },
  3: { label: "발동 · 지정 수치",   group: "current",  timing: "oneShot",    kind: "set" },
  4: { label: "비발동 · 지정 수치", group: "current",  timing: "continuous", kind: "set" },
  5: { label: "발동 · 원래 수치",   group: "original", timing: "oneShot",    kind: "set" },
  6: { label: "비발동 · 원래 수치", group: "original", timing: "continuous", kind: "set" },
};

export const OPS = {
  delta: [
    { id: "up",   label: "올린다" },
    { id: "down", label: "내린다" },
  ],
  set: [
    { id: "fixed",  label: "특정 수치가 된다", needsValue: true },
    { id: "zero",   label: "0이 된다" },
    { id: "double", label: "2배가 된다" },
    { id: "half",   label: "절반이 된다" },
  ],
};

/** 값을 직접 입력하는 연산인지 */
const NEEDS_VALUE = ["up", "down", "fixed"];

/** 하한 0, 소수는 즉시 반올림(사사오입). 매 단계마다 적용. */
const norm = (v) => Math.max(0, Math.round(v));

function applyOp(value, eff) {
  switch (eff.op) {
    case "up":     return norm(value + eff.value);
    case "down":   return norm(value - eff.value);
    case "fixed":  return norm(eff.value);
    case "double": return norm(value * 2);
    case "half":   return norm(value / 2);
    default:       return value;
  }
}

const opText = (eff) => {
  const o = [...OPS.delta, ...OPS.set].find((x) => x.id === eff.op);
  if (eff.op === "up" || eff.op === "down") return `${eff.value} ${o.label}`;
  if (eff.op === "fixed") return `${eff.value} 이 된다`;
  return o.label;
};

/**
 * @param {number} base    원래 공격력(또는 수비력)
 * @param {Array}  effects 적용된 순서대로 정렬된 효과 배열
 *                         { cat: 1..5, op, value }
 */
export function calcStatus(base, effects) {
  const list = effects.map((e, i) => ({ ...e, order: i }));
  const groupA = list.filter((e) => CATS[e.cat].group === "original");
  const groupB = list.filter((e) => CATS[e.cat].group === "current");
  const trace = [];

  /* 「~이 된다」에 지워진 효과의 order. 지워진 효과는 지운 쪽이
     사라져도 되돌아오지 않으므로, 턴 종료 후 계산에서 제외된다. */
  const wiped = new Set();

  /* 발동(단발) 「~이 된다」가 계산해 낸 값. 이 값은 굳어서,
     근거가 된 앞의 효과가 나중에 사라져도 다시 계산되지 않는다. */
  const frozen = new Map();

  /* ── 1단계 · 원래 수치 확정 (5·6번만 해당) ─────────────────
     배·절반은 직전 결과가 아니라 "기준값"을 읽는다.
     기준값은 카드 기재 수치에서 시작하고, 「고정값이 된다」가
     걸릴 때만 그 값으로 갈아치워진다. 배·절반은 기준값을 바꾸지 않는다. */
  const cardBase = norm(base);
  let ref = cardBase;
  let original = cardBase;
  trace.push({ kind: "start", label: "원래 수치", value: original });

  for (const e of groupA) {
    const before = original;
    original = applyOp(ref, e);
    if (e.op === "fixed") ref = original;
    groupA.forEach((p) => { if (p.order < e.order) wiped.add(p.order); });
    if (CATS[e.cat].timing === "oneShot") frozen.set(e.order, original);
    trace.push({
      kind: "orig", cat: e.cat, label: opText(e), before, value: original,
      note: e.op !== "fixed" && before !== ref ? `기준값 ${ref} 에서 계산` : null,
    });
  }

  /* ── 2단계 · 수치 계산 (원래 수치를 이어받음) ──────────────── */
  const runB = (startValue, items) => {
    let v = startValue;
    let pending = [];   // 아직 살아 있는 상시 증감 (2번)
    const applied = []; // 이 패스에서 지금까지 적용된 효과

    for (const e of items) {
      const c = CATS[e.cat];
      const before = v;

      // 예외 (24/01/19) — 2번 뒤에 4번(고정값)이 오면
      // 덮어쓰지 않고, 4번을 계산한 뒤 2번을 다시 얹는다.
      if (c.kind === "set" && c.timing === "continuous" && e.op === "fixed" && pending.length) {
        v = applyOp(v, e);
        trace.push({
          kind: "step", cat: e.cat, label: opText(e), before, value: v,
          note: "예외 · 덮어쓰지 않음",
        });
        // 재계산되는 상시 증감은 살아남고, 나머지는 지워진다.
        applied.forEach((p) => { if (!pending.includes(p)) wiped.add(p.order); });
        for (const d of pending) {
          const b2 = v;
          v = applyOp(v, d);
          trace.push({ kind: "step", cat: d.cat, label: opText(d), before: b2, value: v, note: "재계산" });
        }
        applied.push(e);
        continue;
      }

      v = applyOp(v, e);

      if (c.kind === "set") {
        // 「~이 된다」는 이전 변동 처리를 소거한다.
        const erased = applied.length > 0;
        applied.forEach((p) => wiped.add(p.order));
        if (c.timing === "oneShot") frozen.set(e.order, v);
        pending = [];
        trace.push({
          kind: "step", cat: e.cat, label: opText(e), before, value: v,
          note: erased ? "이전 변동 소거" : null,
        });
      } else {
        if (c.timing === "continuous") pending.push(e);
        trace.push({ kind: "step", cat: e.cat, label: opText(e), before, value: v });
      }
      applied.push(e);
    }
    return v;
  };

  let current = runB(original, groupB);

  /* ── 예외 · 공격력 그룹의 「지정 수치」 뒤에 원래 수치 그룹 효과가
     오면, 그 시점의 원래 수치가 그대로 최종 공격력이 된다.
     앞의 효과가 3번이든 4번이든, 뒤의 효과가 5번이든 6번이든 동일. */
  const lastCurrentSet = [...groupB].reverse().find((e) => CATS[e.cat].kind === "set");
  const laterOriginalSet = lastCurrentSet
    ? groupA.find((e) => e.order > lastCurrentSet.order)
    : null;

  if (laterOriginalSet) {
    // 그 효과가 적용된 시점의 원래 수치를 구한다.
    let refAt = cardBase;
    let originalAt = cardBase;
    for (const e of groupA) {
      originalAt = applyOp(refAt, e);
      if (e.op === "fixed") refAt = originalAt;
      if (e.order === laterOriginalSet.order) break;
    }
    trace.push({
      kind: "override", cat: laterOriginalSet.cat,
      label: `원래 수치 ${originalAt} 로 덮어쓰기`,
      before: current, value: originalAt, note: "예외 · 원래 수치가 뒤에 적용됨",
    });
    // 그 이후의 1~4번을 다시 얹는다.
    // 덮어쓰기로 밀려난 공격력 그룹 효과도 지워진 것으로 본다.
    groupB.forEach((p) => { if (p.order < laterOriginalSet.order) wiped.add(p.order); });
    current = runB(originalAt, groupB.filter((e) => e.order > laterOriginalSet.order));
  }

  return { original, current, trace, wiped, frozen };
}

/**
 * 두 시점을 한 번에 계산한다.
 *  now      … 턴 종료 전 수치
 *  after    … 턴 종료 후 수치
 *
 * 턴 종료 후에는 temp(턴 종료시까지) 효과를 목록에서 빼는데,
 *  · 「~이 된다」에 이미 지워진 효과는 되돌아오지 않으므로 함께 제외하고
 *  · 살아남은 발동(단발) 「~이 된다」는 이미 굳은 값을 그대로 쓴다.
 */
export function calcBoth(base, effects) {
  const now = calcStatus(base, effects);

  const survivors = effects
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => !e.temp && !now.wiped.has(i))
    .map(({ e, i }) => {
      const c = CATS[e.cat];
      const value = now.frozen.get(i);
      const isOneShotSet = c.kind === "set" && c.timing === "oneShot";
      // 굳은 값을 고정값으로 치환해, 근거가 사라져도 재계산되지 않게 한다.
      return isOneShotSet && value !== undefined
        ? { ...e, op: "fixed", value }
        : e;
    });

  const after = calcStatus(base, survivors);
  const hasTemp = effects.some((e) => e.temp);
  return { now, after, hasTemp };
}

/* ══════════════════════════════════════════════════════════════
   회귀 테스트 케이스
   로직을 고칠 때마다 이 표가 그대로 나오는지 확인할 것.
   ══════════════════════════════════════════════════════════════ */

export const REGRESSION_CASES = [
  {
    name: "위키 · 두 그룹 비간섭",
    note: "기재 2000 / 공격력 +1000 → 원래 1000이 된다 → 공격력 +1500. "
        + "앞서 걸린 +1000이 지워지지 않는지 확인",
    base: 2000,
    effects: [
      { cat: 2, op: "up",    value: 1000 },
      { cat: 5, op: "fixed", value: 1000 },
      { cat: 2, op: "up",    value: 1500 },
    ],
    expect: 3500,
  },
  {
    name: "위키 · 지속 증감 뒤의 지속 지정 (24/01/19)",
    note: "기재 2000 / 공격력 +1000 → 원래 100이 된다 → 공격력 100이 된다. "
        + "덮어쓰지 않고 재계산되는지 확인",
    base: 2000,
    effects: [
      { cat: 2, op: "up",    value: 1000 },
      { cat: 5, op: "fixed", value: 100 },
      { cat: 4, op: "fixed", value: 100 },
    ],
    expect: 1100,
  },
  {
    name: "원래 수치 그룹 · 2배 → 2배",
    base: 1000,
    effects: [{ cat: 5, op: "double" }, { cat: 6, op: "double" }],
    expect: 2000,
  },
  {
    name: "원래 수치 그룹 · 2배 → 절반",
    base: 1000,
    effects: [{ cat: 5, op: "double" }, { cat: 6, op: "half" }],
    expect: 500,
  },
  {
    name: "원래 수치 그룹 · 절반 → 2배",
    note: "뒤에 오는 분류가 무엇이든 기재 수치에서 다시 계산되는지 확인",
    base: 1000,
    effects: [{ cat: 6, op: "half" }, { cat: 5, op: "double" }],
    expect: 2000,
  },
  {
    name: "4번 지정 뒤의 6번 · 2배 (기재 0)",
    note: "공격력이 500이 된 뒤 원래 수치가 0으로 확정되면 최종도 0",
    base: 0,
    effects: [{ cat: 4, op: "fixed", value: 500 }, { cat: 6, op: "double" }],
    expect: 0,
  },
  {
    name: "4번 지정 뒤의 6번 · 절반 (기재 0)",
    base: 0,
    effects: [{ cat: 4, op: "fixed", value: 500 }, { cat: 6, op: "half" }],
    expect: 0,
  },
  {
    name: "3번 지정 뒤의 6번 · 2배 (기재 2000)",
    note: "공격력이 4000이 된 뒤 원래 수치가 4000으로 확정되면 최종도 4000",
    base: 2000,
    effects: [{ cat: 3, op: "double" }, { cat: 6, op: "double" }],
    expect: 4000,
  },
  {
    name: "고정값이 기준값을 갈아치움 · 절반",
    note: "기재 0 / 원래 2400이 된다 → 절반. 기재 0이 아니라 2400의 절반",
    base: 0,
    effects: [{ cat: 6, op: "fixed", value: 2400 }, { cat: 6, op: "half" }],
    expect: 1200,
  },
  {
    name: "고정값이 기준값을 갈아치움 · 2배",
    base: 0,
    effects: [{ cat: 6, op: "fixed", value: 2400 }, { cat: 6, op: "double" }],
    expect: 4800,
  },
  {
    name: "턴 종료 · 증감만 사라짐",
    base: 1000,
    effects: [
      { cat: 2, op: "up", value: 1000 },
      { cat: 1, op: "up", value: 1500, temp: true },
    ],
    expect: 3500,
    expectAfter: 2000,
  },
  {
    name: "턴 종료 · 지워진 쪽이 사라짐",
    base: 2000,
    effects: [
      { cat: 3, op: "half", temp: true },
      { cat: 3, op: "fixed", value: 0 },
    ],
    expect: 0,
    expectAfter: 0,
  },
  {
    name: "턴 종료 · 지운 쪽이 사라짐",
    note: "5번이 지워버린 6번은 5번이 사라져도 되돌아오지 않는다",
    base: 3000,
    effects: [
      { cat: 6, op: "fixed", value: 1900 },
      { cat: 5, op: "half", temp: true },
    ],
    expect: 950,
    expectAfter: 3000,
  },
  {
    name: "턴 종료 · 앞이 사라져도 굳은 값 유지",
    note: "5번(턴) 절반 → 3번(영구) 절반. 3번이 만든 525가 남는다",
    base: 2100,
    effects: [
      { cat: 5, op: "half", temp: true },
      { cat: 3, op: "half" },
    ],
    expect: 525,
    expectAfter: 525,
  },
  {
    name: "턴 종료 · 덮어쓰기로 밀린 쪽은 복구 안 됨",
    note: "3번(영구) 절반 → 5번(턴) 절반. 5번이 사라지면 원래 수치로",
    base: 2100,
    effects: [
      { cat: 3, op: "half" },
      { cat: 5, op: "half", temp: true },
    ],
    expect: 1050,
    expectAfter: 2100,
  },
];

/** 전부 통과하면 빈 배열을 돌려준다. */
export function runRegression() {
  return REGRESSION_CASES.flatMap((c) => {
    const eff = c.effects.map((e) => ({ value: 0, ...e }));
    const r = calcBoth(c.base, eff);
    const okNow = r.now.current === c.expect;
    const okAfter = c.expectAfter === undefined || r.after.current === c.expectAfter;
    return okNow && okAfter
      ? []
      : [{ ...c, got: r.now.current, gotAfter: r.after.current }];
  });
}

/* ══════════════════════════════════════════════════════════════
   UI
   ══════════════════════════════════════════════════════════════ */

const CSS = `
.yc{--field:#FDF6E3;--surface:#FFFDF7;--inset:#F5ECD5;--edge:#E0D3B0;--ink:#3B3226;
  --gold:#A67C00;--cyan:#1B7E8C;--rose:#C2334C;--muted:#8A7B62;
  background:var(--field);color:var(--ink);min-height:100vh;padding:28px 20px 60px;
  font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  font-size:14px;line-height:1.55;}
.yc *{box-sizing:border-box;}
.yc-wrap{max-width:1040px;margin:0 auto;}
.yc-eyebrow{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin:0 0 6px;}
.yc-h1{font-size:26px;font-weight:800;letter-spacing:-.01em;margin:0 0 4px;}
.yc-sub{color:var(--muted);font-size:13px;margin:0 0 26px;}
.yc-grid{display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start;}
@media(max-width:820px){.yc-grid{grid-template-columns:1fr;}}
.yc-panel{background:var(--surface);border:1px solid var(--edge);border-radius:10px;padding:18px;
  box-shadow:0 1px 2px rgba(59,50,38,.05);}
.yc-lab{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 7px;}
.yc-input{background:var(--inset);border:1px solid var(--edge);border-radius:6px;color:var(--ink);
  padding:9px 11px;font:inherit;font-variant-numeric:tabular-nums;width:100%;}
.yc-input:focus,.yc-sel:focus,.yc-btn:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.yc-sel{background:var(--inset);border:1px solid var(--edge);border-radius:6px;color:var(--ink);
  padding:9px 8px;font:inherit;width:100%;}
.yc-toggle{display:inline-flex;border:1px solid var(--edge);border-radius:6px;overflow:hidden;margin-bottom:18px;}
.yc-toggle button{background:transparent;border:0;color:var(--muted);padding:7px 18px;font:inherit;cursor:pointer;}
.yc-toggle button[data-on="1"]{background:var(--gold);color:#FFFDF7;font-weight:700;}
.yc-row{display:grid;
  grid-template-columns:26px minmax(0,1.25fr) minmax(0,1fr) 78px 66px 108px;
  gap:8px;align-items:center;margin-bottom:8px;border-radius:6px;}
@media(max-width:560px){
  .yc{padding:18px 12px 44px;}
  .yc-panel{padding:12px;}
  .yc-row{grid-template-columns:16px minmax(0,1.18fr) minmax(0,1fr) 44px 52px 84px;gap:4px;}
  .yc-row .yc-sel,.yc-row .yc-input{padding:7px 3px;font-size:11px;}
  .yc-row .yc-chip{font-size:9.5px;padding:7px 0;}
  .yc-row .yc-btn{font-size:11px;padding:6px 0;}
  .yc-row .yc-mini{gap:2px;}
  .yc-row .yc-n{font-size:11px;padding:5px 0;}
}
.yc-chip{width:100%;background:transparent;border:1px solid var(--edge);border-radius:5px;
  color:var(--muted);cursor:pointer;font:inherit;font-size:11.5px;padding:8px 0;white-space:nowrap;}
.yc-chip:hover{border-color:var(--gold);color:var(--gold);}
.yc-chip[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);color:#FFFDF7;font-weight:700;}
.yc-chip:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.yc-row[data-drag="1"]{opacity:.35;}
.yc-row[data-over="1"]{box-shadow:0 -2px 0 var(--gold);}
.yc-n{font-variant-numeric:tabular-nums;color:var(--gold);font-weight:700;font-size:13px;text-align:center;
  cursor:grab;user-select:none;padding:6px 0;border-radius:5px;}
.yc-n:hover{background:var(--edge);}
.yc-n:active{cursor:grabbing;}
.yc-mini{display:flex;gap:3px;}
.yc-btn{background:transparent;border:1px solid var(--edge);border-radius:5px;color:var(--muted);
  cursor:pointer;font:inherit;font-size:12px;padding:6px 0;flex:1;}
.yc-btn:hover:not(:disabled){border-color:var(--gold);color:var(--gold);}
.yc-btn:disabled{opacity:.3;cursor:default;}
.yc-add{width:100%;margin-top:6px;padding:10px;border:1px dashed var(--edge);border-radius:6px;
  background:transparent;color:var(--muted);cursor:pointer;font:inherit;}
.yc-add:hover{border-color:var(--gold);color:var(--gold);}
.yc-empty{color:var(--muted);font-size:13px;padding:14px 0;}
.yc-out{position:sticky;top:20px;}
.yc-statline{display:flex;align-items:baseline;gap:8px;padding-bottom:14px;border-bottom:1px solid var(--edge);}
.yc-statlab{font-size:12px;letter-spacing:.2em;color:var(--gold);font-weight:700;}
.yc-statval{font-size:44px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1;}
.yc-orig{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--muted);padding:11px 0 4px;}
.yc-orig b{color:var(--cyan);font-variant-numeric:tabular-nums;font-weight:700;font-size:24px;
  letter-spacing:-.02em;line-height:1;}
.yc-block{padding-bottom:4px;}
.yc-block--after{margin-top:16px;padding-top:14px;border-top:1px solid var(--edge);}
.yc-blocklab{display:block;font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--gold);font-weight:700;margin-bottom:6px;}
.yc-block--after .yc-blocklab{color:var(--muted);}
.yc-tabs{display:flex;gap:16px;margin-top:20px;border-bottom:1px solid var(--edge);}
.yc-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);
  font:inherit;font-size:12px;padding:7px 0;cursor:pointer;margin-bottom:-1px;white-space:nowrap;}
.yc-tabs button:hover{color:var(--ink);}
.yc-tabs button[data-on="1"]{color:var(--gold);border-bottom-color:var(--gold);font-weight:700;}
.yc-tabs button:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.yc-chain{list-style:none;margin:14px 0 0;padding:0 0 0 18px;border-left:1px solid var(--edge);}
.yc-block + .yc-chain{margin-top:20px;}
.yc-link{position:relative;padding:0 0 13px 12px;font-size:12.5px;}
.yc-link::before{content:"";position:absolute;left:-23px;top:5px;width:9px;height:9px;border-radius:50%;
  background:var(--surface);border:1.5px solid var(--edge);}
.yc-link[data-hit="1"]::before{border-color:var(--gold);background:var(--gold);}
.yc-link[data-hit="2"]::before{border-color:var(--rose);background:var(--rose);}
.yc-lt{display:flex;justify-content:space-between;gap:10px;}
.yc-name{color:var(--muted);}
.yc-cat{color:var(--gold);font-weight:700;font-variant-numeric:tabular-nums;}
.yc-val{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;}
.yc-was{color:var(--muted);text-decoration:line-through;font-weight:400;margin-right:7px;}
.yc-note{color:var(--rose);font-size:11px;letter-spacing:.02em;margin-top:1px;}
`;

const nextId = (() => { let n = 0; return () => ++n; })();

export default function StatusCalculator() {
  const [stat, setStat] = useState("공격력");
  const [traceTab, setTraceTab] = useState("now");
  const [base, setBase] = useState("2000");
  const [effects, setEffects] = useState([
    { id: nextId(), cat: 2, op: "up", value: "1000", temp: false },
    { id: nextId(), cat: 5, op: "fixed", value: "1000", temp: false },
    { id: nextId(), cat: 2, op: "up", value: "1500", temp: false },
  ]);

  const result = useMemo(() => {
    const clean = effects
      .map((e) => (e.op === "zero" ? { ...e, op: "fixed", value: "0" } : e))
      .filter((e) => !NEEDS_VALUE.includes(e.op) || e.value.trim() !== "")
      .map((e) => ({ cat: e.cat, op: e.op, value: Number(e.value) || 0, temp: !!e.temp }));
    return calcBoth(Number(base) || 0, clean);
  }, [base, effects]);

  const patch = (id, next) =>
    setEffects((list) => list.map((e) => (e.id === id ? { ...e, ...next } : e)));

  const move = (i, dir) =>
    setEffects((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const readout = (r) => (
    <>
      <div className="yc-statline">
        <span className="yc-statlab">{stat === "공격력" ? "ATK" : "DEF"}/</span>
        <span className="yc-statval">{r.current}</span>
      </div>
      <div className="yc-orig">
        <span>원래 {stat}</span>
        <b>{r.original}</b>
      </div>
    </>
  );

  const drop = (to) => {
    if (dragFrom !== null && dragFrom !== to) {
      setEffects((list) => {
        const copy = [...list];
        const [moved] = copy.splice(dragFrom, 1);
        copy.splice(to, 0, moved);
        return copy;
      });
    }
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div className="yc">
      <style>{CSS}</style>
      <div className="yc-wrap">
        <h1 className="yc-h1">유희왕 공격력 / 수비력 계산기</h1>
        <p className="yc-sub">
          원래 수치를 넣고, 효과를 적용된 순서대로 쌓으면 최종 수치가 나옵니다.
        </p>

        <div className="yc-toggle">
          {["공격력", "수비력"].map((s) => (
            <button key={s} data-on={stat === s ? "1" : "0"} onClick={() => setStat(s)}>
              {s}
            </button>
          ))}
        </div>

        <div className="yc-grid">
          {/* ── 입력 ── */}
          <div className="yc-panel">
            <label className="yc-lab" htmlFor="yc-base">원래 {stat}</label>
            <input
              id="yc-base" className="yc-input" inputMode="numeric" value={base}
              onChange={(e) => setBase(e.target.value)}
            />

            <p className="yc-lab" style={{ marginTop: 22 }}>적용 순서</p>

            {effects.length === 0 && (
              <p className="yc-empty">효과가 없습니다. 아래에서 추가하세요.</p>
            )}

            {effects.map((e, i) => {
              const kind = CATS[e.cat].kind;
              const op = OPS[kind].find((o) => o.id === e.op) ?? OPS[kind][0];
              return (
                <div
                  className="yc-row" key={e.id}
                  data-drag={dragFrom === i ? "1" : "0"}
                  data-over={dragOver === i && dragFrom !== i ? "1" : "0"}
                  onDragOver={(ev) => { ev.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
                  onDrop={(ev) => { ev.preventDefault(); drop(i); }}
                >
                  <span
                    className="yc-n" draggable
                    title="끌어서 순서 바꾸기"
                    onDragStart={(ev) => { ev.dataTransfer.effectAllowed = "move"; setDragFrom(i); }}
                    onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  >
                    {i + 1}
                  </span>

                  <select
                    className="yc-sel" value={e.cat} aria-label={`${i + 1}번 분류`}
                    onChange={(ev) => {
                      const cat = Number(ev.target.value);
                      const k = CATS[cat].kind;
                      patch(e.id, { cat, op: k === kind ? e.op : OPS[k][0].id });
                    }}
                  >
                    {Object.entries(CATS).map(([n, c]) => (
                      <option key={n} value={n}>{c.label}</option>
                    ))}
                  </select>

                  <select
                    className="yc-sel" value={op.id} aria-label={`${i + 1}번 연산`}
                    onChange={(ev) => patch(e.id, { op: ev.target.value })}
                  >
                    {OPS[kind].map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>

                  <input
                    className="yc-input" inputMode="numeric" placeholder="—"
                    aria-label={`${i + 1}번 수치`}
                    disabled={!NEEDS_VALUE.includes(op.id)}
                    style={{ opacity: NEEDS_VALUE.includes(op.id) ? 1 : 0.4 }}
                    value={NEEDS_VALUE.includes(op.id) ? e.value : ""}
                    onChange={(ev) => patch(e.id, { value: ev.target.value })}
                  />

                  <button
                    className="yc-chip" aria-pressed={e.temp ? "true" : "false"}
                    title={e.temp ? "특정 시점까지만 적용됩니다" : "계속 적용됩니다"}
                    onClick={() => patch(e.id, { temp: !e.temp })}
                  >
                    {e.temp ? "턴 종료시" : "영구"}
                  </button>

                  <div className="yc-mini">
                    <button className="yc-btn" disabled={i === 0}
                      onClick={() => move(i, -1)} aria-label="위로">↑</button>
                    <button className="yc-btn" disabled={i === effects.length - 1}
                      onClick={() => move(i, 1)} aria-label="아래로">↓</button>
                    <button className="yc-btn"
                      onClick={() => setEffects((l) => l.filter((x) => x.id !== e.id))}
                      aria-label="삭제">×</button>
                  </div>
                </div>
              );
            })}

            <button
              className="yc-add"
              onClick={() => setEffects((l) => [...l, { id: nextId(), cat: 1, op: "up", value: "", temp: false }])}
            >
              효과 추가
            </button>
          </div>

          {/* ── 결과 ── */}
          <div className="yc-panel yc-out">
            {result.hasTemp ? (
              <>
                <div className="yc-block">
                  <span className="yc-blocklab">턴 종료 전</span>
                  {readout(result.now)}
                </div>
                <div className="yc-block yc-block--after">
                  <span className="yc-blocklab">턴 종료 후</span>
                  {readout(result.after)}
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
              <div className="yc-block">{readout(result.now)}</div>
            )}

            <ol className="yc-chain">
              {result[result.hasTemp ? traceTab : "now"].trace.map((t, i) => (
                <li className="yc-link" key={i}
                    data-hit={t.kind === "override" ? "2" : t.note ? "2" : t.kind === "start" ? "0" : "1"}>
                  <div className="yc-lt">
                    <span className="yc-name">
                      {/* t.cat 은 결과 데이터에 그대로 남아 있고, 화면에만 표시하지 않습니다 */}
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
        </div>
      </div>
    </div>
  );
}
