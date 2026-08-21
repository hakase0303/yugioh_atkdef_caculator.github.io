import { useState, useMemo, useRef } from "react";

/* ══════════════════════════════════════════════════════════════
   계산 로직 — UI와 분리되어 있으므로 그대로 떼어내 쓸 수 있습니다.
   근거: 遊戯王カードWiki「ステータス」
        → 攻撃力・守備力を変動させる効果について
   ══════════════════════════════════════════════════════════════ */

export const CATS = {
  1: { label: "발동형 · 단순 공/수 증감",   group: "current",  timing: "oneShot",    kind: "delta" },
  2: { label: "비발동형 · 단순 공/수 증감", group: "current",  timing: "continuous", kind: "delta" },
  3: { label: "발동형 · 특정 공/수 변경",   group: "current",  timing: "oneShot",    kind: "set" },
  4: { label: "비발동형 · 특정 공/수 변경", group: "current",  timing: "continuous", kind: "set" },
  5: { label: "발동형 · 원래 공/수 변경",   group: "original", timing: "oneShot",    kind: "set" },
  6: { label: "비발동형 · 원래 공/수 변경", group: "original", timing: "continuous", kind: "set" },
};

/** 분류를 두 축으로 나눠 고른다. 두 축의 조합이 곧 1~6번 분류다. */
export const FIRE = [
  { id: "on",  label: "발동형" },
  { id: "off", label: "비발동형" },
];
export const GRP = [
  { id: "delta", label: "단순 증감" },
  { id: "set",   label: "특정 수치 변경" },
  { id: "orig",  label: "원래 수치 변경" },
];
const CAT_MAP = { delta: { on: 1, off: 2 }, set: { on: 3, off: 4 }, orig: { on: 5, off: 6 } };
export const catOf = (grp, fire) => CAT_MAP[grp][fire];
export const kindOfGrp = (grp) => (grp ? (grp === "delta" ? "delta" : "set") : null);
export const grpOf = (cat) => (cat <= 2 ? "delta" : cat <= 4 ? "set" : "orig");
export const fireOf = (cat) => (cat % 2 === 1 ? "on" : "off");

export const OPS = {
  delta: [
    { id: "up",   label: "올린다" },
    { id: "down", label: "내린다" },
  ],
  set: [
    { id: "fixed",      label: "특정 수치", needsValue: true },
    // 원래 수치를 참조한다 — 거대화·수축 계열
    { id: "origDouble", label: "원래 수치의 2배" },
    { id: "origTriple", label: "원래 수치의 3배" },
    { id: "origHalf",   label: "원래 수치의 절반" },
    { id: "zero",       label: "0 이 된다" },
    // 직전 결과를 참조한다
    { id: "double",     label: "단순 2배" },
    { id: "triple",     label: "단순 3배" },
    { id: "half",       label: "단순 절반" },
  ],
};

/** 값을 직접 입력하는 연산인지 */
const NEEDS_VALUE = ["up", "down", "fixed"];

/** 원래 수치를 참조하는 연산 — 원래 수치가 바뀌면 다시 계산된다 */
const ORIG_REF = ["origDouble", "origTriple", "origHalf"];

/** 하한 0, 소수는 즉시 반올림(사사오입). 매 단계마다 적용. */
const norm = (v) => Math.max(0, Math.round(v));

/**
 * @param value 직전까지의 결과 (증감이 얹히는 대상)
 * @param ref   배·절반이 읽는 기준값
 *
 * 배·절반은 직전 결과가 아니라 기준값을 읽는다.
 * 「원래 공격력의 배가 된다」처럼 참조 대상이 정해져 있기 때문이다.
 */
function applyOp(value, eff, ref = value) {
  switch (eff.op) {
    case "up":     return norm(value + eff.value);
    case "down":   return norm(value - eff.value);
    case "fixed":  return norm(eff.value);
    // 「원래 수치의 ~배가 된다」 — 기준값을 읽는다
    case "origDouble": return norm(ref * 2);
    case "origTriple": return norm(ref * 3);
    case "origHalf":   return norm(ref / 2);
    // 「~배가 된다」 — 직전 결과를 읽는다
    case "double": return norm(value * 2);
    case "triple": return norm(value * 3);
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
 *                         { cat: 1..6, op, value, temp }
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
    original = applyOp(original, e, ref);
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
    let refB = startValue; // 배·절반이 읽는 기준값 (확정된 원래 수치에서 시작)
    let pending = [];   // 아직 살아 있는 상시 증감 (2번)
    const applied = []; // 이 패스에서 지금까지 적용된 효과

    for (const e of items) {
      const c = CATS[e.cat];
      const before = v;

      // 예외 (24/01/19) — 2번 뒤에 4번(고정값)이 오면
      // 덮어쓰지 않고, 4번을 계산한 뒤 2번을 다시 얹는다.
      if (c.kind === "set" && c.timing === "continuous" && pending.length) {
        v = applyOp(v, e, refB);
        if (e.op === "fixed") refB = v;
        trace.push({
          kind: "step", cat: e.cat, label: opText(e), before, value: v,
          note: "예외 · 덮어쓰지 않음",
        });
        // 재계산되는 상시 증감은 살아남고, 나머지는 지워진다.
        applied.forEach((p) => { if (!pending.includes(p)) wiped.add(p.order); });
        for (const d of pending) {
          const b2 = v;
          v = applyOp(v, d, refB);
          trace.push({ kind: "step", cat: d.cat, label: opText(d), before: b2, value: v, note: "재계산" });
        }
        applied.push(e);
        continue;
      }

      v = applyOp(v, e, refB);
      if (e.op === "fixed") refB = v;

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
  /* 마지막 지정 효과가 「원래 수치의 ~배」를 계속 참조하는 지속 효과라면,
     원래 수치가 바뀌는 순간 스스로 다시 계산되므로 덮어쓰지 않는다.
     발동 효과는 단발이라 다시 계산되지 않고, 고정값은 참조할 게 없어 덮어써진다. */
  const lastSetB = [...groupB].reverse().find((e) => CATS[e.cat].kind === "set");
  const recalculates =
    lastSetB &&
    CATS[lastSetB.cat].timing === "continuous" &&
    ORIG_REF.includes(lastSetB.op);
  const lastCurrentSet = recalculates ? undefined : lastSetB;
  const laterOriginalSet = lastCurrentSet
    ? groupA.find((e) => e.order > lastCurrentSet.order)
    : null;

  if (laterOriginalSet) {
    // 그 효과가 적용된 시점의 원래 수치를 구한다.
    let refAt = cardBase;
    let originalAt = cardBase;
    for (const e of groupA) {
      originalAt = applyOp(originalAt, e, refAt);
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
    effects: [{ cat: 5, op: "origDouble" }, { cat: 6, op: "origDouble" }],
    expect: 2000,
  },
  {
    name: "원래 수치 그룹 · 2배 → 절반",
    base: 1000,
    effects: [{ cat: 5, op: "origDouble" }, { cat: 6, op: "origHalf" }],
    expect: 500,
  },
  {
    name: "원래 수치 그룹 · 절반 → 2배",
    note: "뒤에 오는 분류가 무엇이든 기재 수치에서 다시 계산되는지 확인",
    base: 1000,
    effects: [{ cat: 6, op: "origHalf" }, { cat: 5, op: "origDouble" }],
    expect: 2000,
  },
  {
    name: "4번 지정 뒤의 6번 · 2배 (기재 0)",
    note: "공격력이 500이 된 뒤 원래 수치가 0으로 확정되면 최종도 0",
    base: 0,
    effects: [{ cat: 4, op: "fixed", value: 500 }, { cat: 6, op: "origDouble" }],
    expect: 0,
  },
  {
    name: "4번 지정 뒤의 6번 · 절반 (기재 0)",
    base: 0,
    effects: [{ cat: 4, op: "fixed", value: 500 }, { cat: 6, op: "origHalf" }],
    expect: 0,
  },
  {
    name: "3번 지정 뒤의 6번 · 2배 (기재 2000)",
    note: "공격력이 4000이 된 뒤 원래 수치가 4000으로 확정되면 최종도 4000",
    base: 2000,
    effects: [{ cat: 3, op: "origDouble" }, { cat: 6, op: "origDouble" }],
    expect: 4000,
  },
  {
    name: "고정값이 기준값을 갈아치움 · 절반",
    note: "기재 0 / 원래 2400이 된다 → 절반. 기재 0이 아니라 2400의 절반",
    base: 0,
    effects: [{ cat: 6, op: "fixed", value: 2400 }, { cat: 6, op: "origHalf" }],
    expect: 1200,
  },
  {
    name: "고정값이 기준값을 갈아치움 · 2배",
    base: 0,
    effects: [{ cat: 6, op: "fixed", value: 2400 }, { cat: 6, op: "origDouble" }],
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
      { cat: 3, op: "origHalf", temp: true },
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
      { cat: 5, op: "origHalf", temp: true },
    ],
    expect: 950,
    expectAfter: 3000,
  },
  {
    name: "턴 종료 · 앞이 사라져도 굳은 값 유지",
    note: "5번(턴) 절반 → 3번(영구) 절반. 3번이 만든 525가 남는다",
    base: 2100,
    effects: [
      { cat: 5, op: "origHalf", temp: true },
      { cat: 3, op: "origHalf" },
    ],
    expect: 525,
    expectAfter: 525,
  },
  {
    name: "턴 종료 · 덮어쓰기로 밀린 쪽은 복구 안 됨",
    note: "3번(영구) 절반 → 5번(턴) 절반. 5번이 사라지면 원래 수치로",
    base: 2100,
    effects: [
      { cat: 3, op: "origHalf" },
      { cat: 5, op: "origHalf", temp: true },
    ],
    expect: 1050,
    expectAfter: 2100,
  },

  /* ── 위키 「거대화·수축에 대하여」 항목의 실제 카드 예시 ──
     거대화 = 4번(비발동 · 특정 공/수 변경, 원래 수치를 참조)
     수축   = 5번(발동 · 원래 공/수 변경)                     */
  {
    name: "거대화 · 영속 증감은 다시 얹힌다",
    note: "체미나이 엘프 1900 + 가이아파워 500 + 데몬의 도끼 1000 → 거대화",
    base: 1900,
    effects: [
      { cat: 2, op: "up", value: 500 },
      { cat: 2, op: "up", value: 1000 },
      { cat: 4, op: "origDouble" },
    ],
    expect: 5300,
  },
  {
    name: "거대화 · 발동 증감은 다시 얹히지 않는다",
    note: "돌진(+700)을 받은 체미나이 엘프에 거대화. 돌진은 재계산되지 않는다",
    base: 1900,
    effects: [
      { cat: 1, op: "up", value: 700, temp: true },
      { cat: 4, op: "origDouble" },
    ],
    expect: 3800,
  },
  {
    name: "수축 · 영속 증감은 다시 얹힌다",
    note: "황금의 호문클루스 1500 + 자신 효과 900 → 수축",
    base: 1500,
    effects: [
      { cat: 2, op: "up", value: 900 },
      { cat: 5, op: "origHalf", temp: true },
    ],
    expect: 1650,
  },
  {
    name: "수축 · 지워진 원래 수치는 돌아오지 않는다",
    note: "타협소환 발바로스(원래 1900) + 수축. 턴 종료시 1900이 아니라 3000",
    base: 3000,
    effects: [
      { cat: 6, op: "fixed", value: 1900 },
      { cat: 5, op: "origHalf", temp: true },
    ],
    expect: 950,
    expectAfter: 3000,
  },
  {
    name: "배·절반은 기준값을 읽는다",
    note: "거대화로 500이 된 카라테맨의 2배는 500×2가 아니라 1000×2",
    base: 1000,
    effects: [
      { cat: 4, op: "origHalf" },
      { cat: 3, op: "origDouble" },
    ],
    expect: 2000,
  },
  {
    name: "3배는 기준값을 읽는다",
    note: "원래 1000 / 절반이 된 뒤 3배 → 500×3이 아니라 1000×3",
    base: 1000,
    effects: [
      { cat: 4, op: "origHalf" },
      { cat: 3, op: "origTriple" },
    ],
    expect: 3000,
  },
  {
    name: "거대화 + 고독의 검 · 원래 수치가 바뀌면 다시 계산된다",
    note: "원래 1700 / 거대화(4번, 원래 수치의 2배) + 고독의 검(6번, 원래 수치가 2배). "
        + "고독의 검으로 원래 수치가 3400이 되면 거대화가 그 값을 다시 읽는다",
    base: 1700,
    effects: [
      { cat: 4, op: "origDouble" },
      { cat: 6, op: "double" },
    ],
    expect: 6800,
  },
  {
    name: "거대화 + 고독의 검 · 순서를 바꿔도 같다",
    base: 1700,
    effects: [
      { cat: 6, op: "double" },
      { cat: 4, op: "origDouble" },
    ],
    expect: 6800,
  },
  {
    name: "거대화가 절반 조건일 때",
    base: 1700,
    effects: [
      { cat: 4, op: "origHalf" },
      { cat: 6, op: "double" },
    ],
    expect: 1700,
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
  --gold:#A67C00;--cyan:#1B7E8C;--rose:#C2334C;--muted:#8A7B62;--onGold:#FFFDF7;
  --shadow:rgba(59,50,38,.05);
  background:var(--field);color:var(--ink);min-height:100vh;padding:28px 20px 60px;
  font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  font-size:14px;line-height:1.55;}
.yc[data-theme="dark"]{--field:#1B1813;--surface:#252118;--inset:#141109;--edge:#3D362A;
  --ink:#EDE4CE;--gold:#D8B34A;--cyan:#5CC6D6;--rose:#E8697F;--muted:#9A8F79;
  --onGold:#1B1813;--shadow:rgba(0,0,0,.28);}
.yc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
.yc-tools{display:flex;gap:8px;flex:0 0 auto;}
.yc-theme{flex:0 0 auto;height:36px;min-width:36px;padding:0 9px;border:1px solid var(--edge);
  border-radius:9px;background:var(--surface);color:var(--gold);cursor:pointer;
  display:grid;place-items:center;font:inherit;font-size:12px;white-space:nowrap;}
.yc-theme:hover{border-color:var(--gold);}
.yc-theme[data-on="1"]{background:var(--gold);color:var(--onGold);border-color:var(--gold);font-weight:700;}
.yc-theme:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.yc *{box-sizing:border-box;}
.yc-wrap{max-width:1040px;margin:0 auto;container-type:inline-size;}
/* 모바일 보기 — 폭만 좁혀도 아래 컨테이너 쿼리가 그대로 걸린다 */
.yc-wrap[data-narrow="1"]{max-width:372px;border:1px solid var(--edge);border-radius:14px;
  padding:10px;background:var(--field);box-shadow:0 6px 24px var(--shadow);}
.yc-eyebrow{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin:0 0 6px;}
.yc-h1{font-size:26px;font-weight:800;letter-spacing:-.01em;margin:0 0 4px;}
.yc-sub{color:var(--muted);font-size:13px;margin:0 0 26px;}
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
.yc-input:focus,.yc-sel:focus,.yc-btn:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.yc-sel[data-empty="1"]{color:var(--muted);}
.yc-sel:disabled{opacity:.45;cursor:not-allowed;}
.yc-sel{background:var(--inset);border:1px solid var(--edge);border-radius:6px;color:var(--ink);
  padding:9px 8px;font:inherit;width:100%;}
.yc-toggle{display:inline-flex;border:1px solid var(--edge);border-radius:6px;overflow:hidden;margin-bottom:18px;}
.yc-toggle button + button{border-left:1px solid var(--edge);}
.yc-toggle button{background:transparent;border:0;color:var(--muted);padding:7px 18px;font:inherit;cursor:pointer;}
.yc-toggle button[data-on="1"]{background:var(--gold);color:var(--onGold);font-weight:700;}
.yc-row{display:grid;
  grid-template-columns:24px 66px minmax(0,.85fr) minmax(0,1.25fr) 68px minmax(0,1.05fr) 66px;
  gap:8px;align-items:center;margin-bottom:8px;border-radius:6px;
  transition:transform .16s cubic-bezier(.2,.7,.3,1);}
.yc-row[data-num="0"]{
  grid-template-columns:24px 66px minmax(0,.85fr) minmax(0,1.25fr) minmax(0,1.05fr) 66px;}
.yc-input[data-hide="1"]{display:none;}
/* 실제 좁은 화면에서는 페이지 여백도 줄인다 */
@media(max-width:560px){.yc{padding:18px 12px 44px;}}
@container (max-width:560px){
  .yc-panel{padding:12px;}
  /* 일곱 칸을 한 줄에 넣으면 글자가 잘린다. 두 줄로 나누고
     순번과 손잡이·삭제는 양 끝에서 두 줄을 함께 차지한다.
     data-num 쪽 선택자가 더 강하므로 열 지정을 함께 덮어쓴다. */
  .yc-row,.yc-row[data-num="0"]{
    grid-template-columns:15px 58px minmax(0,1fr) minmax(0,1.5fr) 44px;}
  .yc-row{display:grid;gap:5px;align-items:stretch;
    grid-template-areas:"n t f g m"
                        "n v o o m";}
  /* 숫자칸이 없으면 연산칸이 그 자리까지 넓게 쓴다 */
  .yc-row[data-num="0"]{grid-template-areas:"n t f g m"
                                            "n o o o m";}
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
  .yc-input[data-hide="1"]{display:none;}
}
.yc-chip{width:100%;background:transparent;border:1px solid var(--edge);border-radius:5px;
  color:var(--muted);cursor:pointer;font:inherit;font-size:11.5px;padding:8px 0;white-space:nowrap;}
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
.yc-btn{background:transparent;border:1px solid var(--edge);border-radius:5px;color:var(--muted);
  cursor:pointer;font:inherit;font-size:12px;padding:6px 0;flex:1;}
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

const nextId = (() => { let n = 0; return () => ++n; })();

/** 아무것도 고르지 않은 새 행 */
const newEffect = () => ({
  id: nextId(), fire: null, grp: null, op: null, value: "", temp: false,
});

export default function StatusCalculator() {
  const STATS = ["공격력", "수비력"];

  const [on, setOn] = useState({ 공격력: true, 수비력: false });
  const [dark, setDark] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [traceTab, setTraceTab] = useState("now");
  const [bases, setBases] = useState({ 공격력: "2000", 수비력: "2000" });

  /* 효과 목록은 공격력·수비력이 각각 따로 가진다. */
  const [lists, setLists] = useState({
    공격력: [newEffect()],
    수비력: [newEffect()],
  });

  const active = STATS.filter((s) => on[s]);

  const results = useMemo(() => {
    const prep = (list) =>
      list
        // 세 칸을 다 고르지 않은 행은 아직 효과가 아니다
        .filter((e) => e.fire && e.grp && e.op)
        .map((e) => (e.op === "zero" ? { ...e, op: "fixed", value: "0" } : e))
        .filter((e) => !NEEDS_VALUE.includes(e.op) || String(e.value).trim() !== "")
        .map((e) => ({
          cat: catOf(e.grp, e.fire), op: e.op,
          value: Number(e.value) || 0, temp: !!e.temp,
        }));
    return Object.fromEntries(
      STATS.map((s) => [s, calcBoth(Number(bases[s]) || 0, prep(lists[s]))])
    );
  }, [bases, lists]);

  const setList = (s, updater) =>
    setLists((all) => ({ ...all, [s]: updater(all[s]) }));

  const patch = (s, id, next) =>
    setList(s, (list) => list.map((e) => (e.id === id ? { ...e, ...next } : e)));

  const toggleStat = (s) => {
    if (on[s] && active.length === 1) return; // 마지막 하나는 끌 수 없다
    setOn((o) => ({ ...o, [s]: !o[s] }));
  };

  /* 순서 바꾸기 — 포인터 이벤트라 마우스·터치·펜에서 모두 동작한다.
     끄는 행은 손가락을 따라가고, 사이 행들은 CSS 전환으로 밀린다.
     목록이 둘이므로 어느 쪽을 끌고 있는지도 함께 들고 있는다. */
  const listRefs = useRef({});
  const [drag, setDrag] = useState(null); // { stat, from, to, dy, rowH, startY }

  const onGripDown = (ev, s, i) => {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const kids = listRefs.current[s] ? Array.from(listRefs.current[s].children) : [];
    const a = kids[0]?.getBoundingClientRect();
    const b = kids[1]?.getBoundingClientRect();
    const rowH = b ? b.top - a.top : a ? a.height + 8 : 44;
    setDrag({ stat: s, from: i, to: i, dy: 0, rowH, startY: ev.clientY });
  };

  const onGripMove = (ev) =>
    setDrag((d) => {
      if (!d) return d;
      const dy = ev.clientY - d.startY;
      const len = lists[d.stat].length;
      const to = Math.max(0, Math.min(len - 1, d.from + Math.round(dy / d.rowH)));
      return { ...d, dy, to };
    });

  const onGripUp = () =>
    setDrag((d) => {
      if (d && d.from !== d.to) {
        setList(d.stat, (list) => {
          const copy = [...list];
          const [moved] = copy.splice(d.from, 1);
          copy.splice(d.to, 0, moved);
          return copy;
        });
      }
      return null;
    });

  /** 끄는 중일 때 각 행이 얼마나 밀려나야 하는지 */
  const rowStyle = (s, i) => {
    if (!drag || drag.stat !== s) return undefined;
    const { from, to, dy, rowH } = drag;
    if (i === from)
      return { transform: `translateY(${dy}px)`, transition: "none", position: "relative", zIndex: 2 };
    if (from < to && i > from && i <= to) return { transform: `translateY(${-rowH}px)` };
    if (from > to && i < from && i >= to) return { transform: `translateY(${rowH}px)` };
    return undefined;
  };

  /* ── 조각들 ─────────────────────────────────────────────── */

  const readout = (s, r) => (
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

  const effectRow = (s, e, i) => {
    const kind = kindOfGrp(e.grp);
    const ops = kind ? OPS[kind] : [];
    // 단순 증감을 고르면 바로, 그 외에는 「특정 수치가 된다」를 고를 때만
    const needsNum = e.grp === "delta" || e.op === "fixed";
    return (
      <div
        className="yc-row" key={e.id}
        data-num={needsNum ? "1" : "0"}
        data-drag={drag && drag.stat === s && drag.from === i ? "1" : "0"}
        style={rowStyle(s, i)}
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
          {FIRE.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>

        <select
          className="yc-sel yc-c-g" data-empty={e.grp ? "0" : "1"}
          value={e.grp ?? ""} aria-label={`${i + 1}번 종류`}
          onChange={(ev) => {
            const grp = ev.target.value;
            const keep = kindOfGrp(grp) === kind ? e.op : null;
            patch(s, e.id, { grp, op: keep });
          }}
        >
          <option value="" disabled>선택</option>
          {GRP.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>

        <input
          className="yc-input yc-c-v" inputMode="numeric" placeholder="—"
          aria-label={`${i + 1}번 수치`}
          data-hide={needsNum ? "0" : "1"}
          tabIndex={needsNum ? 0 : -1}
          aria-hidden={!needsNum}
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

        <div className="yc-mini yc-c-m">
          <button
            className="yc-btn yc-grip"
            title="끌어서 순서 바꾸기" aria-label="순서 바꾸기"
            onPointerDown={(ev) => onGripDown(ev, s, i)}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
          >≡</button>
          <button className="yc-btn"
            onClick={() => setList(s, (l) => l.filter((x) => x.id !== e.id))}
            aria-label="삭제">×</button>
        </div>
      </div>
    );
  };

  const inputPanel = (s) => (
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

      <div className="yc-list" ref={(el) => { listRefs.current[s] = el; }}>
        {lists[s].map((e, i) => effectRow(s, e, i))}
      </div>

      <button
        className="yc-add"
        onClick={() => setList(s, (l) => [...l, newEffect()])}
      >
        효과 추가
      </button>
    </div>
  );

  const outputPanel = (s) => {
    const r = results[s];
    const hasTemp = lists[s].some((e) => e.temp);
    return (
      <div className="yc-panel yc-out">
        {hasTemp ? (
          <>
            <div className="yc-block">
              <span className="yc-blocklab">턴 종료 전</span>
              {readout(s, r.now)}
            </div>
            <div className="yc-block yc-block--after">
              <span className="yc-blocklab">턴 종료 후</span>
              {readout(s, r.after)}
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
          <div className="yc-block">{readout(s, r.now)}</div>
        )}

        <ol className="yc-chain">
          {r[hasTemp ? traceTab : "now"].trace.map((t, i) => (
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
    );
  };

  /* ── 화면 ───────────────────────────────────────────────── */

  return (
    <div className="yc" data-theme={dark ? "dark" : "light"}>
      <style>{CSS}</style>
      <div className="yc-wrap" data-narrow={narrow ? "1" : "0"}>
        <div className="yc-head">
          <div>
            <h1 className="yc-h1">유희왕 공격력 / 수비력 계산기</h1>
            <p className="yc-sub">
              원래 수치를 넣고, 효과를 적용된 순서대로 쌓으면 최종 수치가 나옵니다.
            </p>
          </div>
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

        <div className="yc-toggle">
          {STATS.map((s) => (
            <button key={s} data-on={on[s] ? "1" : "0"}
              aria-pressed={on[s]} onClick={() => toggleStat(s)}>
              {s}
            </button>
          ))}
        </div>

        {active.map((s) => (
          <section className="yc-sec" key={s}>
            {active.length > 1 && <h2 className="yc-sechead">{s}</h2>}
            <div className="yc-grid">
              {inputPanel(s)}
              {outputPanel(s)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
