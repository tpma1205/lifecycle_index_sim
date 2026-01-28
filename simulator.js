let chartInstance = null;

function runSimulation() {
  // 獲取所有輸入值
  const currentAge = parseInt(document.getElementById("currentAge").value);
  const currentNW = parseFloat(document.getElementById("currentNW").value);
  const monthlyInv = parseFloat(document.getElementById("monthlyInv").value);
  const annualReturn =
    parseFloat(document.getElementById("annualReturn").value) / 100;
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
  document
    .getElementById("resultsSection")
    .scrollIntoView({ behavior: "smooth" });
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
  annualInflation,
  targetNW,
  retireAge,
  withdrawAmount,
  leverageSettings,
) {
  const ages = [];
  const netWorths = [];
  let balance = currentNW;

  let targetAgePoint = null;
  let targetValPoint = 0;
  let retireValPoint = 0;
  let deathAgePoint = null;

  // 計算退休時的初始調整提領額 (將現值通膨調整至退休那一年)
  let adjustedWithdraw =
    withdrawAmount * Math.pow(1 + annualInflation, retireAge - currentAge);

  // 主模擬迴圈
  for (let age = currentAge; age <= 100; age++) {
    ages.push(age);
    netWorths.push(balance);

    // 紀錄目標達成點
    if (targetAgePoint === null && balance >= targetNW) {
      targetAgePoint = age;
      targetValPoint = balance;
    }

    // --- 步驟 1: 確定當年度適用的槓桿倍數 ---
    let lev;
    if (age <= 25) {
      lev = leverageSettings.lev2025;
    } else if (age <= 30) {
      lev = leverageSettings.lev2630;
    } else if (age <= 35) {
      lev = leverageSettings.lev3135;
    } else if (age <= 40) {
      lev = leverageSettings.lev3640;
    } else if (age <= 45) {
      lev = leverageSettings.lev4145;
    } else if (age <= 50) {
      lev = leverageSettings.lev4650;
    } else if (age <= 55) {
      lev = leverageSettings.lev5155;
    } else if (age <= 60) {
      lev = leverageSettings.lev5660;
    } else if (age <= 65) {
      lev = leverageSettings.lev6165;
    } else {
      lev = leverageSettings.lev66plus;
    }

    // --- 步驟 2: 計算有效報酬率 ---
    // 公式: 有效報酬 = 槓桿倍數 * 市場報酬
    const effRet = lev * annualReturn;

    // --- 步驟 3: 根據是否退休執行資金進出 ---
    if (age < retireAge) {
      // 累積階段：本金複利 + 年底投入儲蓄
      balance = balance * (1 + effRet) + (monthlyInv * 12) / 10000;
    } else {
      // 退休階段
      if (age === retireAge) {
        retireValPoint = balance;
      }

      // 檢查資產是否還有剩餘
      if (balance > 0) {
        // 邏輯：年初先提領生活費，剩餘資金以"有效報酬率"繼續複利
        balance = (balance - adjustedWithdraw) * (1 + effRet);

        // 通膨調整下一年提領額
        adjustedWithdraw *= 1 + annualInflation;

        // 資金耗盡檢查
        if (balance < 0) {
          balance = 0;
          if (deathAgePoint === null) {
            deathAgePoint = age;
          }
        }
      } else {
        // 資金已耗盡，保持為0
        if (deathAgePoint === null) {
          deathAgePoint = age;
        }
        balance = 0;
      }
    }
  }

  // 計算總投入成本（工作年數 × 每月投入 × 12 個月 / 10000 轉為萬元）
  const totalInvestmentYears = retireAge - currentAge;
  const totalInvestmentCost = (monthlyInv * 12 * totalInvestmentYears) / 10000;

  return {
    ages: ages,
    netWorths: netWorths,
    targetAgePoint: targetAgePoint,
    targetValPoint: targetValPoint,
    retireValPoint: retireValPoint,
    deathAgePoint: deathAgePoint,
    currentAge: currentAge,
    retireAge: retireAge,
    totalInvestmentCost: totalInvestmentCost,
  };
}

function displayResults(results) {
  // 顯示關鍵數值
  let targetText = results.targetAgePoint
    ? `${results.targetAgePoint} 歲達成，資產 ${results.targetValPoint.toFixed(0)} 萬元`
    : "未達成目標淨資產";

  let retireText = `${results.retireValPoint.toFixed(2)} 萬元`;

  let deathText = results.deathAgePoint
    ? `${results.deathAgePoint} 歲（可支撐 ${results.deathAgePoint - results.retireAge} 年）`
    : "資產足以支撐至 100 歲以上";

  let totalInvestmentText = `${results.totalInvestmentCost.toFixed(2)} 萬元`;

  document.getElementById("targetResult").textContent = targetText;
  document.getElementById("retireResult").textContent = retireText;
  document.getElementById("deathResult").textContent = deathText;
  document.getElementById("totalInvestmentResult").textContent =
    totalInvestmentText;

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
  const maxVal = Math.max(...results.netWorths);
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
          label: "淨資產動態路徑",
          data: results.netWorths,
          borderColor: "#1f77b4",
          backgroundColor: "rgba(31, 119, 180, 0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            font: { size: 12 },
            padding: 15,
            generateLabels: function (chart) {
              // 基礎圖例項目 - 第一個 dataset（淨資產動態路徑）保持原樣
              const baseLabels =
                Chart.defaults.plugins.legend.labels.generateLabels(chart);

              // 移除後續的圖例項目，只保留第一個
              const filteredLabels = baseLabels.slice(0, 1);

              // 新增自訂圖例項目（使用 pointStyle 显示為圓點）
              const customLabels = [
                {
                  text: "目標達成點",
                  fillStyle: "#FF9800",
                  strokeStyle: "#000",
                  lineWidth: 2,
                  hidden: false,
                  index: 1,
                  pointStyle: "circle",
                },
                {
                  text: "退休點",
                  fillStyle: "#4CAF50",
                  strokeStyle: "#000",
                  lineWidth: 2,
                  hidden: false,
                  index: 2,
                  pointStyle: "circle",
                },
                {
                  text: "資金耗盡點",
                  fillStyle: "#F44336",
                  strokeStyle: "#000",
                  lineWidth: 2,
                  hidden: false,
                  index: 3,
                  pointStyle: "circle",
                },
              ];

              return [...filteredLabels, ...customLabels];
            },
          },
        },
        title: {
          display: true,
          text: "生命週期投資計畫關鍵節點模擬",
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
          if (results.targetAgePoint) {
            const targetIndex = xLabels.indexOf(results.targetAgePoint);
            if (targetIndex >= 0) {
              const targetX = xScale.getPixelForValue(targetIndex);
              const targetY = yScale.getPixelForValue(results.targetValPoint);

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
          if (results.deathAgePoint) {
            const deathIndex = xLabels.indexOf(results.deathAgePoint);
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
            const retireY = yScale.getPixelForValue(results.retireValPoint);
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
