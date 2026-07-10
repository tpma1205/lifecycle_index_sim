let chartInstance = null;

function runSimulation() {
  // 獲取所有輸入值
  const currentAge = parseInt(document.getElementById("currentAge").value);
  const currentNW = parseFloat(document.getElementById("currentNW").value);
  const monthlyInv = parseFloat(document.getElementById("monthlyInv").value);
  const annualReturn =
    parseFloat(document.getElementById("annualReturn").value) / 100;
  const annualVolatility =
    parseFloat(document.getElementById("annualVolatility").value) / 100;
  const annualInflation =
    parseFloat(document.getElementById("annualInflation").value) / 100;
  const targetNW = parseFloat(document.getElementById("targetNW").value);
  const retireAge = parseInt(document.getElementById("retireAge").value);
  const withdrawAmount = parseFloat(
    document.getElementById("withdrawAmount").value,
  );

  const leverageSettings = {
    lev2025: parseFloat(document.getElementById("lev2025").value),
    lev2630: parseFloat(document.getElementById("lev2630").value),
    lev3135: parseFloat(document.getElementById("lev3135").value),
    lev3640: parseFloat(document.getElementById("lev3640").value),
    lev4145: parseFloat(document.getElementById("lev4145").value),
    lev4650: parseFloat(document.getElementById("lev4650").value),
    lev5155: parseFloat(document.getElementById("lev5155").value),
    lev5660: parseFloat(document.getElementById("lev5660").value),
    lev6165: parseFloat(document.getElementById("lev6165").value),
    lev66plus: parseFloat(document.getElementById("lev66plus").value),
  };

  // 驗證輸入
  if (!validateInputs(currentAge, currentNW, targetNW, retireAge)) {
    return;
  }

  // Hide empty state, Show dashboard
  const emptyState = document.getElementById("emptyState");
  if (emptyState) emptyState.style.display = "none";
  document.getElementById("resultsSection").style.display = "flex";

  // 執行模擬
  const results = simulate(
    currentAge,
    currentNW,
    monthlyInv,
    annualReturn,
    annualVolatility,
    annualInflation,
    targetNW,
    retireAge,
    withdrawAmount,
    leverageSettings,
  );

  window.lastSimulationResults = results;

  // 顯示結果
  displayResults(results);
}

function validateInputs(currentAge, currentNW, targetNW, retireAge) {
  if (currentAge < 20 || currentAge > 100) {
    alert("當前年齡應在 20-100 歲之間");
    return false;
  }
  if (currentNW < 0) {
    alert("淨資產不能為負數");
    return false;
  }
  if (targetNW < currentNW) {
    alert("目標淨資產應大於當前淨資產");
    return false;
  }
  if (retireAge <= currentAge || retireAge > 100) {
    alert("退休年齡應在當前年齡之後且不超過 100 歲");
    return false;
  }
  return true;
}

function simulate(
  currentAge,
  currentNW,
  monthlyInv,
  annualReturn,
  annualVolatility,
  annualInflation,
  targetNW,
  retireAge,
  withdrawAmount,
  leverageSettings,
) {
  const SIMULATION_COUNT = 1000;
  const allPaths = [];
  const ages = [];
  for (let a = currentAge; a <= 100; a++) ages.push(a);

  let successCount = 0;
  let targetReachedCount = 0;

  const arithmeticMeanReturn =
    annualReturn + (annualVolatility * annualVolatility) / 2;

  function randn_bm() {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  for (let i = 0; i < SIMULATION_COUNT; i++) {
    let balance = currentNW;
    let adjustedWithdraw = withdrawAmount;
    const path = [];
    let hasReachedTarget = false;
    let isBankrupt = false;

    for (let age = currentAge; age <= 100; age++) {
      path.push(balance);

      if (!hasReachedTarget && balance >= targetNW) {
        hasReachedTarget = true;
      }

      let lev;
      if (age <= 25) lev = leverageSettings.lev2025;
      else if (age <= 30) lev = leverageSettings.lev2630;
      else if (age <= 35) lev = leverageSettings.lev3135;
      else if (age <= 40) lev = leverageSettings.lev3640;
      else if (age <= 45) lev = leverageSettings.lev4145;
      else if (age <= 50) lev = leverageSettings.lev4650;
      else if (age <= 55) lev = leverageSettings.lev5155;
      else if (age <= 60) lev = leverageSettings.lev5660;
      else if (age <= 65) lev = leverageSettings.lev6165;
      else lev = leverageSettings.lev66plus;

      const randomMarketReturn =
        arithmeticMeanReturn + annualVolatility * randn_bm();

      // Simple logic without explicit cost logic for now
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
          isBankrupt = true;
        }
      }
    }

    allPaths.push(path);
    if (hasReachedTarget) targetReachedCount++;
    if (!isBankrupt) successCount++;
  }

  // Calculate quantiles
  const p25Path = [];
  const p50Path = [];
  const p75Path = [];

  const years = 100 - currentAge + 1;
  for (let t = 0; t < years; t++) {
    const yearValues = allPaths.map((p) => p[t]);
    yearValues.sort((a, b) => a - b);
    p25Path.push(yearValues[Math.floor(SIMULATION_COUNT * 0.25)]);
    p50Path.push(yearValues[Math.floor(SIMULATION_COUNT * 0.5)]);
    p75Path.push(yearValues[Math.floor(SIMULATION_COUNT * 0.75)]);
  }

  function getPathKeyPoints(path, ages, targetNW, retireAge) {
    let targetAgePoint = null;
    let targetValPoint = null;
    let deathAgePoint = null;
    let retireValPoint = 0;
    const retireIndex = retireAge - ages[0];

    if (retireIndex >= 0 && retireIndex < path.length) {
      retireValPoint = path[retireIndex];
    }

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
      retireValPoint,
      endValPoint: path[path.length - 1],
    };
  }

  const totalInvestmentCost =
    (monthlyInv * 12 * (retireAge - currentAge)) / 10000;

  return {
    ages: ages,
    p25Path: p25Path,
    p50Path: p50Path,
    p75Path: p75Path,
    p25: getPathKeyPoints(p25Path, ages, targetNW, retireAge),
    p50: getPathKeyPoints(p50Path, ages, targetNW, retireAge),
    p75: getPathKeyPoints(p75Path, ages, targetNW, retireAge),
    successRate: (successCount / SIMULATION_COUNT) * 100,
    targetRate: (targetReachedCount / SIMULATION_COUNT) * 100,
    currentAge: currentAge,
    retireAge: retireAge,
    totalInvestmentCost: totalInvestmentCost,
  };
}

function displayResults(results) {
  function formatScenarioText(points) {
    const formatMoney = (v) => {
      if (v === null || v === undefined) return "0";
      if (v >= 10000) return `${(v / 10000).toFixed(2)}億元`;
      return `${v.toFixed(0)}萬元`;
    };

    const targetText = points.targetAgePoint
      ? `${points.targetAgePoint}歲 / $${formatMoney(points.targetValPoint)}`
      : "未達成目標";
    const deathText = points.deathAgePoint
      ? `${points.deathAgePoint}歲 (破產)`
      : `遺留 $${formatMoney(points.endValPoint)}`;
    const retireText = `$${formatMoney(points.retireValPoint)}`;
    return { targetText, retireText, deathText };
  }

  const scenarios = [
    { key: "P25", raw: results.p25 },
    { key: "P50", raw: results.p50 },
    { key: "P75", raw: results.p75 },
  ];

  scenarios.forEach((s) => {
    const texts = formatScenarioText(s.raw);
    document.getElementById(`targetResult${s.key}`).textContent =
      texts.targetText;
    document.getElementById(`retireResult${s.key}`).textContent =
      texts.retireText;
    document.getElementById(`deathResult${s.key}`).textContent =
      texts.deathText;
  });

  const numFmt = new Intl.NumberFormat("en-US");
  document.getElementById("totalInvestmentResult").textContent = numFmt.format(
    results.totalInvestmentCost.toFixed(0),
  );
  document.getElementById("targetRateResult").textContent =
    `${results.targetRate.toFixed(1)}%`;
  document.getElementById("successRateResult").textContent =
    `${results.successRate.toFixed(1)}%`;

  drawChart(results);
}

function drawChart(results) {
  const canvas = document.getElementById("myChart");
  const ctx = canvas.getContext("2d");

  if (chartInstance) {
    chartInstance.destroy();
  }

  const maxVal = Math.max(...results.p75Path);
  const useYi = maxVal >= 10000;

  function formatValue(val) {
    if (useYi) return (val / 10000).toFixed(1);
    return val.toFixed(0);
  }

  const unitText = useYi ? "億" : "萬";

  // Neumorphism-compatible chart colors
  const chartGridColor = "#D1D5DB";
  const chartTextColor = "#6B7280";
  const bgColor = "#E0E5EC";
  const fgColor = "#3D4852";

  // Accent-colored gradient fill for P50
  const gradP50 = ctx.createLinearGradient(0, 0, 0, 400);
  gradP50.addColorStop(0, "rgba(108, 99, 255, 0.35)");
  gradP50.addColorStop(1, "rgba(108, 99, 255, 0.02)");

  Chart.defaults.color = chartTextColor;
  Chart.defaults.font.family = "'DM Sans', sans-serif";

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: results.ages,
      datasets: [
        {
          label: "平均中位數 (P50)",
          data: results.p50Path,
          borderColor: "#6C63FF",
          backgroundColor: gradP50,
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 0,
          fill: true,
        },
        {
          label: "樂觀情境 (P75)",
          data: results.p75Path,
          borderColor: "rgba(56, 178, 172, 0.7)",
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0,
          fill: false,
        },
        {
          label: "悲觀情境 (P25)",
          data: results.p25Path,
          borderColor: "rgba(252, 129, 129, 0.7)",
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        tooltip: {
          backgroundColor: bgColor,
          titleColor: fgColor,
          bodyColor: chartTextColor,
          borderColor: chartGridColor,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          callbacks: {
            label: function (context) {
              return `${context.dataset.label}: ${formatValue(context.parsed.y)}${unitText}`;
            },
          },
        },
        legend: {
          display: true,
          position: "top",
          labels: {
            font: { size: 12, family: "'DM Sans', sans-serif" },
            usePointStyle: true,
            padding: 20,
            color: fgColor,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: chartGridColor, drawBorder: false },
          ticks: {
            callback: function (value) {
              return `$${formatValue(value)}${unitText}`;
            },
            font: { size: 11 },
            color: chartTextColor,
          },
        },
        x: {
          grid: { color: chartGridColor, drawBorder: false },
          title: {
            display: true,
            text: "Age",
            font: { size: 12, family: "'DM Sans', sans-serif" },
            color: chartTextColor,
          },
          ticks: {
            color: chartTextColor,
          },
        },
      },
    },
    plugins: [
      {
        id: "markPoints",
        afterDatasetsDraw: (chart) => {
          const ctx = chart.ctx;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;
          const xLabels = chart.data.labels;

          function drawPoint(age, value, color) {
            const idx = xLabels.indexOf(age);
            if (idx >= 0 && value !== undefined) {
              const px = xScale.getPixelForValue(idx);
              const py = yScale.getPixelForValue(value);

              // Outer glow
              ctx.beginPath();
              ctx.arc(px, py, 12, 0, 2 * Math.PI);
              ctx.fillStyle = color
                .replace(")", ", 0.2)")
                .replace("rgb", "rgba");
              ctx.fill();

              // Main dot
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(px, py, 6, 0, 2 * Math.PI);
              ctx.fill();

              // Inner highlight
              ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }

          if (results.p50.targetAgePoint) {
            drawPoint(
              results.p50.targetAgePoint,
              results.p50.targetValPoint,
              "rgb(246, 173, 85)",
            );
          }
          drawPoint(
            results.retireAge,
            results.p50.retireValPoint,
            "rgb(56, 178, 172)",
          );
        },
      },
    ],
  });
}

function autoSetLeverage() {
  const currentAge = parseInt(document.getElementById("currentAge").value);
  const currentNW = parseFloat(document.getElementById("currentNW").value);
  const monthlyInv = parseFloat(document.getElementById("monthlyInv").value);
  const annualReturn =
    parseFloat(document.getElementById("annualReturn").value) / 100;
  const annualInflation =
    parseFloat(document.getElementById("annualInflation").value) / 100;
  const retireAge = parseInt(document.getElementById("retireAge").value);

  if (
    [
      currentAge,
      currentNW,
      monthlyInv,
      annualReturn,
      annualInflation,
      retireAge,
    ].some(isNaN)
  ) {
    alert("請先填寫正確的基本資料");
    return;
  }

  let simAge = currentAge;
  let netAsset = currentNW;
  const annualSavings = (monthlyInv * 12) / 10000;

  const buckets = {
    lev2025: [],
    lev2630: [],
    lev3135: [],
    lev3640: [],
    lev4145: [],
    lev4650: [],
    lev5155: [],
    lev5660: [],
    lev6165: [],
    lev66plus: [],
  };

  while (simAge <= retireAge) {
    let humanCapital = 0;
    const remainingYears = retireAge - simAge;
    if (remainingYears > 0) {
      for (let t = 1; t <= remainingYears; t++) {
        humanCapital += annualSavings / Math.pow(1 + annualInflation, t);
      }
    }

    let leverage = 2.0;
    if (netAsset > 0) {
      const totalWealth = netAsset + humanCapital;
      leverage = Math.max(1.0, Math.min(2.0, totalWealth / netAsset));
    }

    if (simAge <= 25) buckets.lev2025.push(leverage);
    else if (simAge <= 30) buckets.lev2630.push(leverage);
    else if (simAge <= 35) buckets.lev3135.push(leverage);
    else if (simAge <= 40) buckets.lev3640.push(leverage);
    else if (simAge <= 45) buckets.lev4145.push(leverage);
    else if (simAge <= 50) buckets.lev4650.push(leverage);
    else if (simAge <= 55) buckets.lev5155.push(leverage);
    else if (simAge <= 60) buckets.lev5660.push(leverage);
    else if (simAge <= 65) buckets.lev6165.push(leverage);
    else buckets.lev66plus.push(leverage);

    const exposure = netAsset * leverage;
    netAsset = netAsset + exposure * annualReturn + annualSavings;
    simAge++;
  }

  for (const [id, values] of Object.entries(buckets)) {
    const avg =
      values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 1.0;
    document.getElementById(id).value = avg.toFixed(2);
  }
  updateLeverageInputsState();
}

function resetLeverage() {
  [
    "lev2025",
    "lev2630",
    "lev3135",
    "lev3640",
    "lev4145",
    "lev4650",
    "lev5155",
    "lev5660",
    "lev6165",
    "lev66plus",
  ].forEach((id) => {
    document.getElementById(id).value = "1";
  });
  updateLeverageInputsState();
}

function updateLeverageInputsState() {
  const currentAge = parseInt(document.getElementById("currentAge").value) || 0;
  const ranges = [
    { id: "lev2025", end: 26 },
    { id: "lev2630", end: 31 },
    { id: "lev3135", end: 36 },
    { id: "lev3640", end: 41 },
    { id: "lev4145", end: 46 },
    { id: "lev4650", end: 51 },
    { id: "lev5155", end: 56 },
    { id: "lev5660", end: 61 },
    { id: "lev6165", end: 66 },
    { id: "lev66plus", end: 999 },
  ];

  ranges.forEach((range) => {
    const el = document.getElementById(range.id);
    if (!el) return;
    if (currentAge >= range.end) {
      el.type = "text";
      el.value = "--";
      el.disabled = true;
    } else {
      el.disabled = false;
      if (el.value === "--") el.value = "1";
      el.type = "number";
    }
  });
}

updateLeverageInputsState();
