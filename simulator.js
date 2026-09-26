// ============================================
// 模型設定
// ============================================
const SIMULATION_COUNT = 1000;
const QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9];

// 10 個年齡區間，各自對應一個槓桿輸入欄位
const LEVERAGE_BUCKETS = [
  { id: "lev2025", maxAge: 25 },
  { id: "lev2630", maxAge: 30 },
  { id: "lev3135", maxAge: 35 },
  { id: "lev3640", maxAge: 40 },
  { id: "lev4145", maxAge: 45 },
  { id: "lev4650", maxAge: 50 },
  { id: "lev5155", maxAge: 55 },
  { id: "lev5660", maxAge: 60 },
  { id: "lev6165", maxAge: 65 },
  { id: "lev66plus", maxAge: Infinity },
];

const bucketIndexForAge = (age) =>
  LEVERAGE_BUCKETS.findIndex((b) => age <= b.maxAge);

// 可重現的亂數產生器：相同種子得到相同的市場路徑
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================
// 蒙地卡羅模擬
// ============================================
function simulate(params, leverages) {
  const {
    currentAge,
    currentNW,
    monthlyInv,
    annualReturn,
    annualVolatility,
    annualInflation,
    targetNW,
    retireAge,
    withdrawAmount,
    seed,
  } = params;

  const rng = mulberry32(seed);
  function randn_bm() {
    let u = 0,
      v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  const ages = [];
  for (let a = currentAge; a <= 100; a++) ages.push(a);
  const years = ages.length;

  const arithmeticMeanReturn =
    annualReturn + (annualVolatility * annualVolatility) / 2;

  // columns[t][i]：第 i 條路徑在第 t 年初的資產
  const columns = ages.map(() => new Float64Array(SIMULATION_COUNT));
  const depletionAges = [];
  let successCount = 0;
  let targetReachedCount = 0;

  for (let i = 0; i < SIMULATION_COUNT; i++) {
    let balance = currentNW;
    let adjustedWithdraw = withdrawAmount;
    let hasReachedTarget = false;
    let depletedAt = null;

    for (let t = 0; t < years; t++) {
      const age = ages[t];
      columns[t][i] = balance;

      if (!hasReachedTarget && balance >= targetNW) {
        hasReachedTarget = true;
      }

      const lev = leverages[bucketIndexForAge(age)];
      const randomMarketReturn =
        arithmeticMeanReturn + annualVolatility * randn_bm();

      // Floor at -100%: a leveraged position can't lose more than the capital
      // at risk in a single period. Without this, effRet can go below -1,
      // making (1 + effRet) negative — multiplying two negatives together
      // (e.g. an already-negative balance in the withdrawal phase) flips the
      // sign back positive and silently "revives" a bankrupt path.
      const effRet = Math.max(lev * randomMarketReturn, -1);

      if (age < retireAge) {
        balance = balance * (1 + effRet) + (monthlyInv * 12) / 10000;
      } else {
        if (balance > 0) {
          balance = (balance - adjustedWithdraw) * (1 + effRet);
          adjustedWithdraw *= 1 + annualInflation;
        }
        if (balance <= 0) {
          balance = 0;
          // 資產在下一年初歸零
          if (depletedAt === null) depletedAt = age + 1;
        }
      }
    }

    if (hasReachedTarget) targetReachedCount++;
    if (depletedAt === null) successCount++;
    else depletionAges.push(depletedAt);
  }

  // 每一年的橫斷面分位數
  const quantilePaths = {};
  QUANTILES.forEach((q) => (quantilePaths[q] = []));
  columns.forEach((col) => {
    col.sort();
    QUANTILES.forEach((q) =>
      quantilePaths[q].push(col[Math.floor(SIMULATION_COUNT * q)]),
    );
  });

  function getPathKeyPoints(path) {
    let targetAgePoint = null;
    let targetValPoint = null;
    let deathAgePoint = null;

    for (let i = 0; i < path.length; i++) {
      const age = ages[i];
      const val = path[i];
      if (targetAgePoint === null && val >= targetNW) {
        targetAgePoint = age;
        targetValPoint = val;
      }
      if (deathAgePoint === null && val <= 0 && age >= retireAge) {
        deathAgePoint = age;
      }
    }

    return {
      targetAgePoint,
      targetValPoint,
      deathAgePoint,
      retireValPoint: path[retireAge - currentAge],
      endValPoint: path[path.length - 1],
    };
  }

  return {
    params,
    leverages,
    ages,
    quantilePaths,
    depletionAges,
    keyPoints: {
      p25: getPathKeyPoints(quantilePaths[0.25]),
      p50: getPathKeyPoints(quantilePaths[0.5]),
      p75: getPathKeyPoints(quantilePaths[0.75]),
    },
    successRate: (successCount / SIMULATION_COUNT) * 100,
    targetRate: (targetReachedCount / SIMULATION_COUNT) * 100,
    totalInvestmentCost: (monthlyInv * 12 * (retireAge - currentAge)) / 10000,
  };
}

// ============================================
// 自動建議槓桿（Ayres & Nalebuff：依人力資本 / 淨資產比例）
// ============================================
function suggestLeverage(params) {
  const { currentAge, currentNW, monthlyInv, annualReturn, annualInflation, retireAge } =
    params;
  const buckets = LEVERAGE_BUCKETS.map(() => []);
  const annualSavings = (monthlyInv * 12) / 10000;
  let simAge = currentAge;
  let netAsset = currentNW;

  while (simAge <= retireAge) {
    let humanCapital = 0;
    for (let t = 1; t <= retireAge - simAge; t++) {
      humanCapital += annualSavings / Math.pow(1 + annualInflation, t);
    }

    let leverage = 2.0;
    if (netAsset > 0) {
      const totalWealth = netAsset + humanCapital;
      leverage = Math.max(1.0, Math.min(2.0, totalWealth / netAsset));
    }
    buckets[bucketIndexForAge(simAge)].push(leverage);

    netAsset = netAsset + netAsset * leverage * annualReturn + annualSavings;
    simAge++;
  }

  return buckets.map((values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1.0,
  );
}

// ============================================
// 讀取與驗證輸入
// ============================================
const $ = (id) => document.getElementById(id);

const FIELD_IDS = [
  "currentAge",
  "currentNW",
  "monthlyInv",
  "annualReturn",
  "annualVolatility",
  "annualInflation",
  "retireAge",
  "targetNW",
  "withdrawAmount",
  "seed",
];

function readParams() {
  const num = (id) => parseFloat($(id).value);
  return {
    currentAge: Math.round(num("currentAge")),
    currentNW: num("currentNW"),
    monthlyInv: num("monthlyInv"),
    annualReturn: num("annualReturn") / 100,
    annualVolatility: num("annualVolatility") / 100,
    annualInflation: num("annualInflation") / 100,
    retireAge: Math.round(num("retireAge")),
    targetNW: num("targetNW"),
    withdrawAmount: num("withdrawAmount"),
    seed: Math.round(num("seed")),
  };
}

function readLeverages() {
  return LEVERAGE_BUCKETS.map(({ id }) => {
    const el = $(id);
    // 已經過去的年齡區間不會被模擬使用
    return el.disabled ? 1 : parseFloat(el.value);
  });
}

// 回傳 { field, message }，沒有錯誤時回傳 null
function validate(p, leverages) {
  const empty = FIELD_IDS.find((id) => isNaN(parseFloat($(id).value)));
  if (empty) return { field: empty, message: "這個欄位是空白的，請填入數字。" };
  if (p.currentAge < 20 || p.currentAge > 99)
    return { field: "currentAge", message: "當前年齡請介於 20 到 99 歲。" };
  if (p.currentNW < 0)
    return { field: "currentNW", message: "淨資產不能是負數。" };
  if (p.monthlyInv < 0)
    return { field: "monthlyInv", message: "每月投入不能是負數。" };
  if (p.annualVolatility < 0)
    return { field: "annualVolatility", message: "波動率不能是負數。" };
  if (p.retireAge <= p.currentAge || p.retireAge > 100)
    return {
      field: "retireAge",
      message: "退休年齡需大於當前年齡，且不超過 100 歲。",
    };
  if (p.targetNW < p.currentNW)
    return { field: "targetNW", message: "目標淨資產需大於當前淨資產。" };
  if (p.withdrawAmount < 0)
    return { field: "withdrawAmount", message: "首年提領不能是負數。" };
  if (p.seed < 1) return { field: "seed", message: "亂數種子請填 1 以上的整數。" };
  const badLev = leverages.findIndex((l) => isNaN(l) || l < 0 || l > 5);
  if (badLev >= 0)
    return {
      field: LEVERAGE_BUCKETS[badLev].id,
      message: "槓桿倍數請介於 0 到 5 倍。",
    };
  return null;
}

function showError(error) {
  document
    .querySelectorAll(".input-wrapper.invalid, .lev-item.invalid")
    .forEach((el) => el.classList.remove("invalid"));
  $("formError").textContent = error ? error.message : "";
  $("resultsSection").classList.toggle("is-stale", !!error);
  if (error) {
    const wrapper = $(error.field).closest(".input-wrapper, .lev-item");
    if (wrapper) wrapper.classList.add("invalid");
    $(error.field).setAttribute("aria-invalid", "true");
  }
  FIELD_IDS.concat(LEVERAGE_BUCKETS.map((b) => b.id)).forEach((id) => {
    if (!error || id !== error.field) $(id).removeAttribute("aria-invalid");
  });
}

// ============================================
// 格式化
// ============================================
const numFmt = new Intl.NumberFormat("zh-TW");

function formatMoney(v) {
  if (v === null || v === undefined) return "—";
  if (v >= 10000) return `${(v / 10000).toFixed(2)} 億`;
  return `${numFmt.format(Math.round(v))} 萬`;
}

function formatAxisMoney(v) {
  if (v >= 10000) return `${numFmt.format(+(v / 10000).toFixed(1))}億`;
  return `${numFmt.format(Math.round(v))}萬`;
}

function successLevel(rate) {
  if (rate >= 90) return "ok";
  if (rate >= 75) return "warn";
  return "crit";
}

// ============================================
// 結果呈現
// ============================================
const chartState = { log: true, results: null };

function displayResults(results) {
  renderSummary(results);
  renderScenarioTable(results);
  renderDepletion(results);
  drawChart();
}

function renderSummary(results) {
  const p = results.params;
  const mid = results.keyPoints.p50;
  const level = successLevel(results.successRate);

  const pill = $("verdictPill");
  pill.className = `pill ${level}`;
  pill.textContent = `${{ ok: "穩健", warn: "邊際", crit: "高風險" }[level]}：資金存活率`;

  $("verdictHeadline").innerHTML =
    `在 ${numFmt.format(SIMULATION_COUNT)} 條市場路徑中，<br>` +
    `<span class="big ${level}">${results.successRate.toFixed(1)}%</span> 的情境資金可撐到 100 歲`;

  const reach = mid.targetAgePoint
    ? `在 <b>${mid.targetAgePoint} 歲</b>達成 ${formatMoney(p.targetNW)}目標`
    : `<b>未能達成</b> ${formatMoney(p.targetNW)}目標`;
  const depleted = results.depletionAges;
  $("verdictSub").innerHTML =
    `中位數情境${reach}，退休時資產 <b>${formatMoney(mid.retireValPoint)}</b>。` +
    (depleted.length
      ? ` 失敗的 ${numFmt.format(depleted.length)} 條路徑中，最早在 <b>${Math.min(...depleted)} 歲</b>耗盡資金。`
      : " 沒有任何路徑在 100 歲前耗盡資金。");

  $("targetRateResult").innerHTML =
    `${results.targetRate.toFixed(1)}<small>%</small>`;
  $("targetRateNote").textContent = `目標 ${formatMoney(p.targetNW)}`;

  $("retireValueResult").textContent = formatMoney(mid.retireValPoint);
  $("retireValueNote").textContent = `${p.retireAge} 歲時的中位數`;

  const rate =
    mid.retireValPoint > 0
      ? (p.withdrawAmount / mid.retireValPoint) * 100
      : Infinity;
  const rateNote = $("withdrawRateNote");
  if (isFinite(rate)) {
    $("withdrawRateResult").innerHTML = `${rate.toFixed(1)}<small>%</small>`;
    const rateLevel = rate <= 4 ? "ok" : rate <= 6 ? "warn" : "crit";
    rateNote.className = `note ${rateLevel}`;
    rateNote.textContent = rate <= 4 ? "低於 4% 法則" : "高於 4% 法則";
  } else {
    $("withdrawRateResult").textContent = "—";
    rateNote.className = "note crit";
    rateNote.textContent = "退休時中位數資產為零";
  }

  $("totalInvestmentResult").textContent = formatMoney(
    results.totalInvestmentCost,
  );
  $("totalInvestmentNote").textContent =
    `${p.retireAge - p.currentAge} 年 × 每月 ${numFmt.format(p.monthlyInv)} 元`;

  const levs = results.leverages.filter(
    (_, i) => !$(LEVERAGE_BUCKETS[i].id).disabled,
  );
  const levText = levs.every((l) => l === levs[0])
    ? `全程 ${levs[0].toFixed(1)}x 槓桿`
    : `槓桿 ${Math.min(...levs).toFixed(2)}–${Math.max(...levs).toFixed(2)}x`;
  $("assumptions").innerHTML =
    `<b>${p.currentAge} 歲</b> · 淨資產 <b>${formatMoney(p.currentNW)}</b> · ` +
    `每月投入 <b>${numFmt.format(p.monthlyInv)} 元</b> · ` +
    `報酬 <b>${(p.annualReturn * 100).toFixed(1)}%</b> / 波動 <b>${(p.annualVolatility * 100).toFixed(1)}%</b> · ` +
    `<b>${p.retireAge} 歲</b>退休 · ${levText} · 種子 ${p.seed}`;
}

function renderScenarioTable(results) {
  const p = results.params;
  const cols = [
    { kp: results.keyPoints.p25, mid: false },
    { kp: results.keyPoints.p50, mid: true },
    { kp: results.keyPoints.p75, mid: false },
  ];
  const rows = [
    {
      label: `目標達成<small>首次 ≥ ${formatMoney(p.targetNW)}</small>`,
      cell: (k) =>
        k.targetAgePoint
          ? `${k.targetAgePoint} 歲<small>${formatMoney(k.targetValPoint)}</small>`
          : '<span class="chip muted">未達成</span>',
    },
    {
      label: `退休時資產<small>${p.retireAge} 歲</small>`,
      cell: (k) => formatMoney(k.retireValPoint),
    },
    {
      label: "100 歲時",
      cell: (k) =>
        k.deathAgePoint
          ? `<span class="chip crit">${k.deathAgePoint} 歲耗盡</span>`
          : formatMoney(k.endValPoint),
    },
  ];

  $("scenarioBody").innerHTML = rows
    .map(
      (row) =>
        `<tr><th scope="row">${row.label}</th>` +
        cols
          .map((c) => `<td${c.mid ? ' class="col-mid"' : ""}>${row.cell(c.kp)}</td>`)
          .join("") +
        "</tr>",
    )
    .join("");
}

function renderDepletion(results) {
  const ages = results.depletionAges;
  const box = $("depletionChart");
  const caption = $("depletionCaption");

  if (!ages.length) {
    caption.textContent = `${numFmt.format(SIMULATION_COUNT)} 條路徑都沒有在 100 歲前耗盡資金。`;
    box.innerHTML = '<p class="empty-hist">沒有失敗路徑</p>';
    return;
  }

  const bins = [];
  for (let a = results.params.retireAge; a <= 100; a += 5) {
    bins.push({ lo: a, hi: Math.min(a + 4, 100), n: 0 });
  }
  ages.forEach((a) => {
    const bin = bins.find((b) => a >= b.lo && a <= b.hi) || bins[bins.length - 1];
    bin.n++;
  });
  const max = Math.max(...bins.map((b) => b.n));

  caption.textContent =
    `${numFmt.format(ages.length)} 條路徑（${((ages.length / SIMULATION_COUNT) * 100).toFixed(1)}%）` +
    "在 100 歲前耗盡資金，依耗盡年齡分組：";
  box.innerHTML =
    '<div class="hist">' +
    bins
      .map((b) => {
        const h = b.n ? Math.max(3, (b.n / max) * 100) : 1;
        return `<div class="bar"><span class="c">${b.n || ""}</span><div class="fill${b.n ? "" : " zero"}" style="height:${h}%"></div></div>`;
      })
      .join("") +
    '</div><div class="hist-x">' +
    bins
      .map((b) => `<span>${b.lo}${b.hi > b.lo ? "–" + b.hi : ""}</span>`)
      .join("") +
    "</div>";
}

// ============================================
// 扇形圖（SVG）
// ============================================
const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(name, attrs, parent, text) {
  const el = document.createElementNS(SVG_NS, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (text !== undefined) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
}

function niceStep(max, count) {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

function drawChart() {
  const results = chartState.results;
  if (!results) return;

  const svg = $("fanChart");
  const container = $("chart");
  const tip = $("chartTip");
  const W = Math.max(300, container.clientWidth);
  const H = W < 600 ? 300 : 400;
  const m = { l: 62, r: 16, t: 22, b: 44 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("height", H);
  svg.innerHTML = "";
  tip.hidden = true;

  const { params: p, ages } = results;
  const series = results.quantilePaths;

  const x = (age) =>
    m.l + ((age - ages[0]) / (ages[ages.length - 1] - ages[0])) * iw;
  const top = Math.max(...series[0.9], p.targetNW);
  let y;
  const ticks = [];
  if (chartState.log) {
    const lo = 10;
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(top, 100))));
    const span = Math.log10(hi) - Math.log10(lo);
    y = (v) =>
      m.t + ih - ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / span) * ih;
    for (let t = lo; t <= hi; t *= 10) ticks.push(t);
  } else {
    const step = niceStep(top, 5);
    const hi = Math.ceil(top / step) * step;
    y = (v) => m.t + ih - (v / hi) * ih;
    for (let t = 0; t <= hi + 1e-9; t += step) ticks.push(t);
  }

  // Axes & grid
  const axes = svgEl("g", {}, svg);
  ticks.forEach((t, i) => {
    svgEl("line", {
      x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t),
      class: i === 0 ? "axis-line" : "grid-line",
    }, axes);
    svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, axes, formatAxisMoney(t));
  });
  const xStep = ages.length > 50 ? 10 : 5;
  ages.forEach((a) => {
    if (a % xStep !== 0) return;
    svgEl("line", { x1: x(a), x2: x(a), y1: m.t + ih, y2: m.t + ih + 4, class: "axis-line" }, axes);
    svgEl("text", { x: x(a), y: m.t + ih + 18, "text-anchor": "middle" }, axes, a);
  });
  svgEl("text", { x: m.l + iw, y: m.t + ih + 38, "text-anchor": "end", class: "lbl" }, axes, "年齡");

  // Percentile bands
  const band = (lo, hi, fill) => {
    const upper = ages.map((a, i) => `${x(a)},${y(series[hi][i])}`);
    const lower = ages.map((a, i) => `${x(a)},${y(series[lo][i])}`).reverse();
    svgEl("polygon", { points: upper.concat(lower).join(" "), fill, stroke: "none" }, svg);
  };
  band(0.1, 0.9, "var(--band-outer)");
  band(0.25, 0.75, "var(--band-inner)");

  // Retirement marker
  const rx = x(p.retireAge);
  svgEl("line", {
    x1: rx, x2: rx, y1: m.t, y2: m.t + ih,
    stroke: "var(--muted)", "stroke-width": 1.2, "stroke-dasharray": "4 4",
  }, svg);
  svgEl("text", { x: rx + 6, y: m.t + 4, class: "lbl" }, svg, `退休 ${p.retireAge} 歲`);

  // Target line
  const ty = y(p.targetNW);
  svgEl("line", {
    x1: m.l, x2: m.l + iw, y1: ty, y2: ty,
    stroke: "var(--target)", "stroke-width": 1.2, "stroke-dasharray": "6 4",
  }, svg);
  svgEl("text", {
    x: m.l + iw - 4, y: ty - 6, "text-anchor": "end", class: "lbl", style: "fill: var(--target)",
  }, svg,
    `目標 ${formatMoney(p.targetNW)}`);

  // Median line
  svgEl("polyline", {
    points: ages.map((a, i) => `${x(a)},${y(series[0.5][i])}`).join(" "),
    fill: "none", stroke: "var(--accent)", "stroke-width": 2.5, "stroke-linejoin": "round",
  }, svg);

  // Median reaches target
  const hitIdx = series[0.5].findIndex((v) => v >= p.targetNW);
  if (hitIdx >= 0) {
    const hx = x(ages[hitIdx]);
    const hy = y(series[0.5][hitIdx]);
    svgEl("circle", {
      cx: hx, cy: hy, r: 5,
      fill: "var(--surface)", stroke: "var(--target)", "stroke-width": 2.5,
    }, svg);
    svgEl("text", {
      x: hx - 8, y: hy - 10, "text-anchor": "end", class: "lbl", style: "fill: var(--ink)",
    }, svg, `P50 於 ${ages[hitIdx]} 歲達標`);
  }

  // Hover crosshair + tooltip
  const cross = svgEl("line", { y1: m.t, y2: m.t + ih, stroke: "var(--ink)", "stroke-width": 1, opacity: 0 }, svg);
  const dot = svgEl("circle", { r: 4, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 }, svg);
  const hitArea = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);

  const onMove = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(ages.length - 1,
      Math.round(((px - m.l) / iw) * (ages.length - 1))));
    const cx = x(ages[i]);
    cross.setAttribute("x1", cx);
    cross.setAttribute("x2", cx);
    cross.setAttribute("opacity", 0.35);
    dot.setAttribute("cx", cx);
    dot.setAttribute("cy", y(series[0.5][i]));
    dot.setAttribute("opacity", 1);

    const phase = ages[i] < p.retireAge ? "累積期" : "提領期";
    tip.innerHTML =
      `<div class="t">${ages[i]} 歲 · ${phase}</div>` +
      [[0.9, "P90"], [0.75, "P75"], [0.5, "P50"], [0.25, "P25"], [0.1, "P10"]]
        .map(([q, name]) =>
          `<div class="r${q === 0.5 ? " mid" : ""}"><span>${name}</span><b>${formatMoney(series[q][i])}</b></div>`)
        .join("");
    tip.hidden = false;
    const left = (cx / W) * rect.width;
    const tw = tip.offsetWidth;
    tip.style.left = `${left + 14 + tw > rect.width ? left - 14 - tw : left + 14}px`;
  };
  const onLeave = () => {
    tip.hidden = true;
    cross.setAttribute("opacity", 0);
    dot.setAttribute("opacity", 0);
  };
  hitArea.addEventListener("pointermove", onMove);
  hitArea.addEventListener("pointerdown", onMove);
  hitArea.addEventListener("pointerleave", onLeave);

  $("chartCaption").textContent =
    "金額皆為當年度金額，未扣除通膨。" +
    (chartState.log
      ? "對數刻度下，低於 10 萬的值貼齊底部。"
      : "線性刻度下，尾端的高報酬路徑會壓縮前期的差異。");
}

// ============================================
// 今日購買力提示
// ============================================
// 首年提領與目標淨資產都以退休當年的金額填寫，這裡換算成今天的購買力
function updateTodayValueHints() {
  const p = readParams();
  const years = p.retireAge - p.currentAge;
  const valid =
    [p.currentAge, p.retireAge, p.annualInflation].every((v) => !isNaN(v)) &&
    years > 0 &&
    p.annualInflation >= 0;
  const toToday = (v) => v / Math.pow(1 + p.annualInflation, years);

  $("withdrawToday").textContent =
    valid && !isNaN(p.withdrawAmount)
      ? `以 ${p.retireAge} 歲退休計，約等於今天的 ${formatMoney(toToday(p.withdrawAmount))}購買力。`
      : "";
  $("hintTarget").textContent =
    valid && !isNaN(p.targetNW)
      ? `以 ${p.retireAge} 歲計，約等於今天的 ${formatMoney(toToday(p.targetNW))}購買力。`
      : "";
}

// ============================================
// 槓桿欄位
// ============================================
function updateLeverageInputsState() {
  const currentAge = parseInt($("currentAge").value) || 0;
  LEVERAGE_BUCKETS.forEach(({ id, maxAge }) => {
    const el = $(id);
    const isPast = currentAge > maxAge;
    el.closest(".lev-item").classList.toggle("is-past", isPast);
    if (isPast) {
      el.disabled = true;
      el.value = "";
      el.placeholder = "—";
    } else {
      el.disabled = false;
      el.placeholder = "";
      if (el.value === "") el.value = "1";
    }
  });
}

function autoSetLeverage() {
  const p = readParams();
  const needed = ["currentAge", "currentNW", "monthlyInv", "annualReturn", "annualInflation", "retireAge"];
  const missing = needed.find((id) => isNaN(parseFloat($(id).value)));
  if (missing) {
    showError({ field: missing, message: "請先填寫這個欄位，才能計算建議槓桿。" });
    return;
  }
  suggestLeverage(p).forEach((lev, i) => {
    $(LEVERAGE_BUCKETS[i].id).value = lev.toFixed(2);
  });
  updateLeverageInputsState();
  runSimulation();
}

function resetLeverage() {
  LEVERAGE_BUCKETS.forEach(({ id }) => ($(id).value = "1"));
  updateLeverageInputsState();
  runSimulation();
}

// ============================================
// 流程
// ============================================
function runSimulation() {
  const params = readParams();
  const leverages = readLeverages();
  const error = validate(params, leverages);
  showError(error);
  if (error) return; // 保留上一次的結果，並以淡化表示已過期

  chartState.results = simulate(params, leverages);
  window.lastSimulationResults = chartState.results;
  displayResults(chartState.results);
}

let debounceTimer = null;
function scheduleSimulation() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSimulation, 250);
}

function bindSegmented(onId, offId, key, value) {
  $(onId).addEventListener("click", () => {
    chartState[key] = value;
    $(onId).setAttribute("aria-pressed", "true");
    $(offId).setAttribute("aria-pressed", "false");
    drawChart();
  });
}

function init() {
  $("paramsForm").addEventListener("input", (ev) => {
    if (ev.target.id === "currentAge") updateLeverageInputsState();
    updateTodayValueHints();
    scheduleSimulation();
  });
  $("paramsForm").addEventListener("submit", (ev) => ev.preventDefault());
  $("autoLevBtn").addEventListener("click", autoSetLeverage);
  $("resetLevBtn").addEventListener("click", resetLeverage);
  $("resampleBtn").addEventListener("click", () => {
    $("seed").value = 1 + Math.floor(Math.random() * 99999);
    runSimulation();
  });

  bindSegmented("toggleLinear", "toggleLog", "log", false);
  bindSegmented("toggleLog", "toggleLinear", "log", true);

  if (window.ResizeObserver) {
    let lastWidth = 0;
    new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w !== lastWidth) {
        lastWidth = w;
        drawChart();
      }
    }).observe($("chart"));
  } else {
    window.addEventListener("resize", drawChart);
  }

  updateLeverageInputsState();
  updateTodayValueHints();
  runSimulation();
}

init();
