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

  // 顯示結果
  displayResults(results);

  // 滾動到結果區域
  document.getElementById("resultsSection").style.display = "block";
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
  const SIMULATION_COUNT = 1000; // 模擬次數
  const allPaths = []; // 儲存所有模擬路徑
  const ages = [];
  for (let a = currentAge; a <= 100; a++) ages.push(a);

  // 統計數據
  let successCount = 0; // 資金維持到100歲的次數
  let targetReachedCount = 0; // 達成目標資產的次數

  // Box-Muller 轉換：產生標準常態分佈隨機數 (Mean=0, StdDev=1)
  function randn_bm() {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // 執行多次模擬
  for (let i = 0; i < SIMULATION_COUNT; i++) {
    let balance = currentNW;
    let adjustedWithdraw = withdrawAmount;
    const path = [];
    let hasReachedTarget = false;
    let isBankrupt = false;

    for (let age = currentAge; age <= 100; age++) {
      path.push(balance);

      // 檢查目標達成
      if (!hasReachedTarget && balance >= targetNW) {
        hasReachedTarget = true;
      }

      // --- 步驟 1: 確定當年度適用的槓桿倍數 ---
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

      // --- 步驟 2: 計算隨機市場報酬 ---
      // 隨機市場報酬 = 平均報酬 + 波動率 * 常態隨機數
      const randomMarketReturn = annualReturn + annualVolatility * randn_bm();

      // 有效報酬 = (槓桿 * 市場報酬) - (借貸成本)
      // 假設借貸成本 = 通膨率 (與 autoSetLeverage 邏輯一致)
      const effRet = lev * randomMarketReturn - (lev - 1) * annualInflation;

      // --- 步驟 3: 資金進出 ---
      if (age < retireAge) {
        // 累積階段
        balance = balance * (1 + effRet) + (monthlyInv * 12) / 10000;
      } else {
        // 退休階段
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

  // 計算分位數 (P10, P50, P90)
  const p25Path = []; // 悲觀 (第25百分位)
  const p50Path = []; // 中位數 (第50百分位)
  const p75Path = []; // 樂觀 (第75百分位)

  const years = 100 - currentAge + 1;
  for (let t = 0; t < years; t++) {
    // 取得該年度所有模擬的資產數值
    const yearValues = allPaths.map((p) => p[t]);
    // 排序
    yearValues.sort((a, b) => a - b);

    p25Path.push(yearValues[Math.floor(SIMULATION_COUNT * 0.25)]);
    p50Path.push(yearValues[Math.floor(SIMULATION_COUNT * 0.5)]);
    p75Path.push(yearValues[Math.floor(SIMULATION_COUNT * 0.75)]);
  }

  // Helper function to find key points for a given path
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

    const endValPoint = path[path.length - 1];

    return {
      targetAgePoint,
      targetValPoint,
      deathAgePoint,
      retireValPoint,
      endValPoint,
    };
  }

  const keyPointsP25 = getPathKeyPoints(p25Path, ages, targetNW, retireAge);
  const keyPointsP50 = getPathKeyPoints(p50Path, ages, targetNW, retireAge);
  const keyPointsP75 = getPathKeyPoints(p75Path, ages, targetNW, retireAge);

  // 計算總投入成本（工作年數 × 每月投入 × 12 個月 / 10000 轉為萬元）
  const totalInvestmentYears = retireAge - currentAge;
  const totalInvestmentCost = (monthlyInv * 12 * totalInvestmentYears) / 10000;

  return {
    ages: ages,
    p25Path: p25Path,
    p50Path: p50Path,
    p75Path: p75Path,
    p25: keyPointsP25,
    p50: keyPointsP50,
    p75: keyPointsP75,
    successRate: (successCount / SIMULATION_COUNT) * 100,
    targetRate: (targetReachedCount / SIMULATION_COUNT) * 100,
    currentAge: currentAge,
    retireAge: retireAge,
    totalInvestmentCost: totalInvestmentCost,
  };
}

function displayResults(results) {
  // Helper to format text for each scenario
  function formatScenarioText(points) {
    const fmt = (v) => (v !== null && v !== undefined ? v.toFixed(0) : "0");

    const targetText = points.targetAgePoint
      ? `${points.targetAgePoint} 歲，${fmt(points.targetValPoint)} 萬元`
      : "未達成";
    const deathText = points.deathAgePoint
      ? `${points.deathAgePoint} 歲資金耗盡`
      : `100 歲仍有 ${fmt(points.endValPoint)} 萬元`;

    const retireText = `${results.retireAge} 歲，${fmt(points.retireValPoint)} 萬元`;
    return { targetText, retireText, deathText };
  }

  // Populate results for all 3 scenarios
  const textP25 = formatScenarioText(results.p25);
  document.getElementById("targetResultP25").textContent = textP25.targetText;
  document.getElementById("retireResultP25").textContent = textP25.retireText;
  document.getElementById("deathResultP25").textContent = textP25.deathText;

  const textP50 = formatScenarioText(results.p50);
  document.getElementById("targetResultP50").textContent = textP50.targetText;
  document.getElementById("retireResultP50").textContent = textP50.retireText;
  document.getElementById("deathResultP50").textContent = textP50.deathText;

  const textP75 = formatScenarioText(results.p75);
  document.getElementById("targetResultP75").textContent = textP75.targetText;
  document.getElementById("retireResultP75").textContent = textP75.retireText;
  document.getElementById("deathResultP75").textContent = textP75.deathText;

  // Populate summary bar
  document.getElementById("totalInvestmentResult").textContent =
    `${results.totalInvestmentCost.toFixed(2)} 萬元`;
  document.getElementById("targetRateResult").textContent =
    `${results.targetRate.toFixed(1)}%`;
  document.getElementById("successRateResult").textContent =
    `${results.successRate.toFixed(1)}%`;

  // 繪製圖表
  drawChart(results);
}

function drawChart(results) {
  const ctx = document.getElementById("myChart").getContext("2d");

  // 銷毀舊圖表
  if (chartInstance) {
    chartInstance.destroy();
  }

  // 準備資料
  const maxVal = Math.max(...results.p75Path); // 使用 P75 作為最大值參考
  const useYi = maxVal >= 10000; // 是否顯示為億元

  // 用於標籤的格式化函數
  function formatValue(val) {
    if (useYi) {
      return (val / 10000).toFixed(1);
    }
    return val.toFixed(0);
  }

  const unitText = useYi ? "億元" : "萬元";

  // 創建新圖表
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: results.ages,
      datasets: [
        {
          label: "中位數 (P50)",
          data: results.p50Path,
          borderColor: "#1f77b4",
          backgroundColor: "transparent",
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 0,
        },
        {
          label: "樂觀情境 (P75)",
          data: results.p75Path,
          borderColor: "rgba(76, 175, 80, 0.5)",
          backgroundColor: "rgba(76, 175, 80, 0.1)",
          borderWidth: 1,
          tension: 0.4,
          pointRadius: 0,
          fill: false, // 不填充到底部
        },
        {
          label: "悲觀情境 (P25)",
          data: results.p25Path,
          borderColor: "rgba(244, 67, 54, 0.5)",
          backgroundColor: "rgba(31, 119, 180, 0.2)", // 填充顏色 (P10 到 P90 之間)
          borderWidth: 1,
          tension: 0.4,
          pointRadius: 0,
          fill: "-1", // 填充到上一個 dataset (即 P75)
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              let label = context.dataset.label || "";
              if (label) {
                label += ": ";
              }
              if (context.parsed.y !== null) {
                label += formatValue(context.parsed.y) + " " + unitText;
              }
              return label;
            },
          },
        },
        legend: {
          display: true,
          labels: {
            font: { size: 12 },
            padding: 15,
            generateLabels: function (chart) {
              // 基礎圖例項目
              const baseLabels =
                Chart.defaults.plugins.legend.labels.generateLabels(chart);

              // 保留 P50, P90, P10 的圖例
              const filteredLabels = baseLabels.slice(0, 3);

              // 新增自訂圖例項目（使用 pointStyle 显示為圓點）
              const customLabels = [
                {
                  text: "目標達成點",
                  fillStyle: "#FF9800",
                  strokeStyle: "#000",
                  lineWidth: 2,
                  hidden: false,
                  index: 3,
                  pointStyle: "circle",
                },
                {
                  text: "退休點",
                  fillStyle: "#4CAF50",
                  strokeStyle: "#000",
                  lineWidth: 2,
                  hidden: false,
                  index: 4,
                  pointStyle: "circle",
                },
                {
                  text: "資金耗盡點",
                  fillStyle: "#F44336",
                  strokeStyle: "#000",
                  lineWidth: 2,
                  hidden: false,
                  index: 5,
                  pointStyle: "circle",
                },
              ];

              return [...filteredLabels, ...customLabels];
            },
          },
        },
        title: {
          display: true,
          text: "蒙地卡羅模擬資產路徑 (1000次模擬)",
          font: { size: 16 },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return formatValue(value) + " " + unitText;
            },
            font: { size: 11 },
          },
          title: {
            display: true,
            text: `淨資產 (${unitText})`,
            font: { size: 12, weight: "bold" },
          },
        },
        x: {
          title: {
            display: true,
            text: "年齡",
            font: { size: 12, weight: "bold" },
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

          // 取得 X 軸標籤
          const xLabels = chart.data.labels;

          // 標記目標達成點
          if (results.p50.targetAgePoint) {
            const targetIndex = xLabels.indexOf(results.p50.targetAgePoint);
            if (targetIndex >= 0) {
              const targetX = xScale.getPixelForValue(targetIndex);
              const targetY = yScale.getPixelForValue(
                results.p50Path[targetIndex],
              );

              // 繪製點
              ctx.fillStyle = "#FF9800";
              ctx.beginPath();
              ctx.arc(targetX, targetY, 6, 0, 2 * Math.PI);
              ctx.fill();

              ctx.strokeStyle = "#000";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }

          // 標記資金耗盡點
          if (results.p50.deathAgePoint) {
            const deathIndex = xLabels.indexOf(results.p50.deathAgePoint);
            if (deathIndex >= 0) {
              const deathX = xScale.getPixelForValue(deathIndex);
              const deathY = yScale.getPixelForValue(0);

              ctx.fillStyle = "#F44336";
              ctx.beginPath();
              ctx.arc(deathX, deathY, 6, 0, 2 * Math.PI);
              ctx.fill();

              ctx.strokeStyle = "#000";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }

          // 標記退休點
          const retireIndex = xLabels.indexOf(results.retireAge);
          if (retireIndex >= 0) {
            const retireX = xScale.getPixelForValue(retireIndex);
            const retireY = yScale.getPixelForValue(results.p50.retireValPoint);
            ctx.fillStyle = "#4CAF50";
            ctx.beginPath();
            ctx.arc(retireX, retireY, 6, 0, 2 * Math.PI);
            ctx.fill();

            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
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
    isNaN(currentAge) ||
    isNaN(currentNW) ||
    isNaN(monthlyInv) ||
    isNaN(annualReturn) ||
    isNaN(annualInflation) ||
    isNaN(retireAge)
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
    netAsset =
      netAsset +
      exposure * annualReturn -
      (exposure - netAsset) * annualInflation +
      annualSavings;
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
      el.type = "text"; // 改為文字型態以顯示 "--"
      el.value = "--";
      el.disabled = true;
      el.style.backgroundColor = "#e9ecef"; // 灰底
    } else {
      el.disabled = false;
      el.style.backgroundColor = "";
      if (el.value === "--") {
        el.value = "1"; // 若原本是被鎖定的，解鎖時恢復預設值
      }
      el.type = "number"; // 恢復為數字輸入
    }
  });
}

// 初始化執行一次，確保載入時狀態正確
updateLeverageInputsState();
