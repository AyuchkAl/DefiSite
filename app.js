// ================== AAVE CONFIG (ARBITRUM V3) =====================

// Pool: for getUserAccountData
const POOL_ABI = [
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

// Protocol Data Provider: per-reserve user data + config
const DATA_PROVIDER_ABI = [
  "function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)"
];

// Price Oracle
const ORACLE_ABI = [
  "function getAssetPrice(address asset) view returns (uint256)"
];

// Aave V3 contracts on Arbitrum One
const POOL_ADDRESS          = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
const DATA_PROVIDER_ADDRESS = "0x243Aa95cAC2a25651eda86e80bEe66114413c43b";
const ORACLE_ADDRESS        = "0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7";

// WETH underlying on Arbitrum
const WETH_ADDRESS = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
const WBTC_ADDRESS = "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f";

// ================== EDGE FUNCTIONS =================================
const MORPHO_HF_PROXY_URL = "https://spring-moon-4095.alexknikola.workers.dev/morpho-hf";
const PUELL_PROXY_URL = "https://falling-night-97fc.alexknikola.workers.dev/puell";
const CMC_FNG_PROXY_URL = "https://cmc-fng-proxy.alexknikola.workers.dev/fng";
const QUICK_PROCESSOR_URL = "https://vphdvuvofpkogemvejff.supabase.co/functions/v1/quick-processor";
const TA_DATA_READONLY_URL = "https://vphdvuvofpkogemvejff.supabase.co/functions/v1/ta-data-readonly";
const WEB_SITES_API_URL = "https://vphdvuvofpkogemvejff.supabase.co/functions/v1/ta_web_site_function";
const STRATEGY_FILES_API_URL = "https://vphdvuvofpkogemvejff.supabase.co/functions/v1/ta_strategy_file_function";

// ================== DOM REFERENCES =================================

const connectButton = document.getElementById("connectButton");
const connectLabel  = document.getElementById("connectLabel");
const walletMenu    = document.getElementById("walletMenu");
const disconnectBtn = document.getElementById("disconnectButton");

const statusDiv   = document.getElementById("status");
const resultDiv   = document.getElementById("result");
const addressSpan = document.getElementById("address");
const hfValueEl   = document.getElementById("hfValue");

const btcPriceEl  = document.getElementById("btcPrice");
const ethPriceEl  = document.getElementById("ethPrice");
const btcChangeEl = document.getElementById("btcChange");
const ethChangeEl = document.getElementById("ethChange");
const avgBtcValueEl = document.getElementById("avgBtcValue");
const avgEthValueEl = document.getElementById("avgEthValue");

const liqEthBottomEl = document.getElementById("liqEthBottom");
const liqBtcBottomEl = document.getElementById("liqBtcBottom");
const hfMainRowEl = document.querySelector(".hf-main-row");

const morphoHfValueEl = document.getElementById("morphoHfValue");
const morphoHfMainRowEl = document.querySelector(".morpho-hf-main-row");
const liqBtcMorphoEl = document.getElementById("liqBtcMorpho");

const fgValueEl = document.getElementById("fgValue");
const fgLabelEl = document.getElementById("fgLabel");
const fgNeedleEl = document.getElementById("fgNeedle");

let currentAddress = null;

// ================== Hold/Sell state ==================
let latestFgValue = null;
let latestBtc24h  = null;
let latestEth24h  = null;
let latestPuell   = null;

// Current spot prices
let currentBtcPrice = null;
let currentEthPrice = null;

// Current Morpho HF
let currentMorphoHf = null;

// ================== HELPERS ========================================

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function shortenNumber(n) {
  if (!Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString("en-US");
}

function setConnectedUI(addr) {
  currentAddress = addr;
  addressSpan.textContent = addr;
  connectLabel.textContent = shortenAddress(addr);
  resultDiv.classList.remove("hidden");
}

function setDisconnectedUI() {
  currentAddress = null;
  addressSpan.textContent = "";
  hfValueEl.textContent = "–";
  liqEthBottomEl.textContent = "ETH ~ –";
  liqBtcBottomEl.textContent = "BTC ~ –";

  if (morphoHfValueEl) morphoHfValueEl.textContent = "–";
  if (liqBtcMorphoEl) liqBtcMorphoEl.textContent = "BTC ~ –";

  currentMorphoHf = null;

  connectLabel.textContent = "Connect wallet";
  resultDiv.classList.add("hidden");
  walletMenu.classList.remove("visible");
  statusDiv.textContent = "";
  localStorage.removeItem("savedAddress");

  hfMainRowEl.classList.remove("safe", "warning", "danger");
  if (morphoHfMainRowEl) {
    morphoHfMainRowEl.classList.remove("safe", "warning", "danger");
  }
}

function setHealthFactorDisplay(hf) {
  hfValueEl.textContent = hf.toFixed(2);

  hfMainRowEl.classList.remove("safe", "warning", "danger");

  if (hf < 1.0) hfMainRowEl.classList.add("danger");
  else if (hf < 1.5) hfMainRowEl.classList.add("warning");
  else hfMainRowEl.classList.add("safe");
}

function setMorphoHealthFactorDisplay(hf) {
  if (!morphoHfValueEl || !morphoHfMainRowEl) return;

  if (!Number.isFinite(hf)) {
    morphoHfValueEl.textContent = "–";
    morphoHfMainRowEl.classList.remove("safe", "warning", "danger");
    return;
  }

  morphoHfValueEl.textContent = hf.toFixed(2);
  morphoHfMainRowEl.classList.remove("safe", "warning", "danger");

  if (hf < 1.0) morphoHfMainRowEl.classList.add("danger");
  else if (hf < 1.5) morphoHfMainRowEl.classList.add("warning");
  else morphoHfMainRowEl.classList.add("safe");
}

function updateMorphoLiqDisplay() {
  if (!liqBtcMorphoEl) return;

  let btcSpot = currentBtcPrice;

  if (!Number.isFinite(btcSpot) && btcPriceEl) {
    const raw = String(btcPriceEl.textContent || "").replace(/[^\d.]/g, "");
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) btcSpot = parsed;
  }

  if (!Number.isFinite(currentMorphoHf) || currentMorphoHf <= 0 || !Number.isFinite(btcSpot) || btcSpot <= 0) {
    liqBtcMorphoEl.textContent = "BTC ~ –";
    return;
  }

  const btcAtHF1 = btcSpot / currentMorphoHf;
  liqBtcMorphoEl.textContent = "BTC ~ " + shortenNumber(btcAtHF1);
}

function formatUsd(amount) {
  return (
    "$" +
    Math.round(Number(amount)).toLocaleString("de-DE", {
      maximumFractionDigits: 0,
      useGrouping: true,
    })
  );
}

function parseGvizJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Unexpected GVIZ response");
  return JSON.parse(text.slice(start, end + 1));
}

function parseCurrencyLoose(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;

  let s = String(rawValue ?? "").trim();
  if (!s) return NaN;

  s = s.replace(/[^\d.,-]/g, "");

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "");
      s = s.replace(/,/g, ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastDot !== -1) {
    const fracLen = s.length - lastDot - 1;
    if (fracLen === 3) s = s.replace(/\./g, "");
  } else if (lastComma !== -1) {
    const fracLen = s.length - lastComma - 1;
    if (fracLen === 3) s = s.replace(/,/g, "");
    else s = s.replace(/,/g, ".");
  }

  return Number(s);
}

function formatUsd0(num) {
  return "$" + Math.round(Number(num)).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function parsePercentLoose(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;

  let s = String(rawValue ?? "").trim();
  if (!s) return NaN;

  s = s.replace(/[^\d.,%\-\+]/g, "");
  const hasPercent = s.includes("%");

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(/,/g, ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma !== -1 && lastDot === -1) {
    const fracLen = s.length - lastComma - 1;
    if (fracLen !== 3) s = s.replace(/,/g, ".");
    else s = s.replace(/,/g, "");
  }

  let num = Number(s.replace("%", ""));
  if (!Number.isFinite(num)) return NaN;

  if (hasPercent && Math.abs(num) <= 1) num = num * 100;
  return num;
}

function hideTaChartTooltip() {
  if (!taChartTooltip) return;
  taChartTooltip.hidden = true;
  taChartTooltip.classList.remove("positive", "negative");
}

function showTaChartTooltip(x, y, valueText, isPositive) {
  if (!taChartTooltip) return;

  taChartTooltip.textContent = valueText;
  taChartTooltip.style.left = `${x}px`;
  taChartTooltip.style.top = `${y}px`;
  taChartTooltip.classList.remove("positive", "negative");
  taChartTooltip.classList.add(isPositive ? "positive" : "negative");
  taChartTooltip.hidden = false;
}

// ... all other existing code unchanged until TA chart ...

function formatTaDateLabel(value) {
  if (!value) return "";
  return String(value).trim().slice(0, 10);
}

function parseTaNumericValue(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function niceStep(range) {
  if (!Number.isFinite(range) || range <= 0) return 1;

  const rough = range / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;

  let step;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;

  return step * pow;
}

function computeSymmetricBounds(values) {
  let maxAbs = 1;

  for (const v of values) {
    const av = Math.abs(v);
    if (Number.isFinite(av) && av > maxAbs) maxAbs = av;
  }

  const step = niceStep(maxAbs * 2);
  const roundedMax = Math.ceil(maxAbs / step) * step;

  return {
    min: -roundedMax,
    max: roundedMax,
    step
  };
}

function drawLineSegment(ctx, x1, y1, x2, y2, color, width) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawCircle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawTaDataChart(rows) {
  if (!taChartCanvas) return;

  const ctx = taChartCanvas.getContext("2d");
  if (!ctx) return;

  taChartHoverPoints = [];

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = taChartCanvas.clientWidth || 1200;
  const cssHeight = 420;

  taChartCanvas.width = Math.floor(cssWidth * dpr);
  taChartCanvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const bg = "#0b1020";
  const grid = "rgba(255,255,255,0.10)";
  const axis = "rgba(255,255,255,0.28)";
  const text = "#cfd5ff";
  const zeroAxis = "rgba(255,255,255,0.45)";
  const green = "#16c784";
  const red = "#ea3943";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const margin = { top: 20, right: 20, bottom: 60, left: 70 };
  const plotX = margin.left;
  const plotY = margin.top;
  const plotW = cssWidth - margin.left - margin.right;
  const plotH = cssHeight - margin.top - margin.bottom;

  if (!rows.length) {
    ctx.fillStyle = text;
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("No data", plotX, plotY + 24);
    return;
  }

  const points = rows
    .map((row) => ({
      id: Number(row?.id),
      xLabel: formatTaDateLabel(row.created_at_minsk),
      rawValue: row.value,
      y: parseTaNumericValue(row.value)
    }))
    .filter((p) => Number.isFinite(p.y));

  if (!points.length) {
    ctx.fillStyle = text;
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("No numeric data", plotX, plotY + 24);
    return;
  }

  const bounds = computeSymmetricBounds(points.map((p) => p.y));
  const yMin = bounds.min;
  const yMax = bounds.max;
  const yStep = bounds.step;

  function yToPx(v) {
    const ratio = (v - yMin) / (yMax - yMin);
    return plotY + plotH - ratio * plotH;
  }

  function xToPx(i) {
    if (points.length === 1) return plotX + plotW * 0.02;
    if (points.length === 2) return plotX + plotW * 0.00 + i * (plotW * 0.03);
    if (points.length === 3) return plotX + plotW * 0.00 + i * (plotW * 0.04);
    if (points.length === 4) return plotX + plotW * 0.00 + i * (plotW * 0.06);

    const innerLeft = plotX + plotW * 0.05;
    const innerRight = plotX + plotW * 0.95;
    return innerLeft + (i / (points.length - 1)) * (innerRight - innerLeft);
  }

  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let v = yMin; v <= yMax + yStep / 2; v += yStep) {
    const yy = yToPx(v);

    ctx.beginPath();
    ctx.moveTo(plotX, yy);
    ctx.lineTo(plotX + plotW, yy);
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? zeroAxis : grid;
    ctx.lineWidth = Math.abs(v) < 1e-9 ? 1.5 : 1;
    ctx.stroke();

    ctx.fillStyle = text;
    ctx.fillText(v.toFixed(2), plotX - 10, yy);
  }

  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW, plotY + plotH);
  ctx.strokeStyle = axis;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const labelStep = Math.max(1, Math.ceil(points.length / 8));
  for (let i = 0; i < points.length; i += labelStep) {
    const xx = xToPx(i);
    const lbl = points[i].xLabel;

    ctx.beginPath();
    ctx.moveTo(xx, plotY + plotH);
    ctx.lineTo(xx, plotY + plotH + 6);
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.translate(xx, plotY + plotH + 10);
    ctx.rotate(-Math.PI / 5);
    ctx.fillStyle = text;
    ctx.fillText(lbl, 0, 0);
    ctx.restore();
  }

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];

    const x1 = xToPx(i - 1);
    const y1 = yToPx(p1.y);
    const x2 = xToPx(i);
    const y2 = yToPx(p2.y);

    if ((p1.y >= 0 && p2.y >= 0) || (p1.y <= 0 && p2.y <= 0)) {
      drawLineSegment(ctx, x1, y1, x2, y2, p2.y >= 0 ? green : red, 3);
    } else {
      const t = (0 - p1.y) / (p2.y - p1.y);
      const xZero = x1 + (x2 - x1) * t;
      const yZero = yToPx(0);

      drawLineSegment(ctx, x1, y1, xZero, yZero, p1.y >= 0 ? green : red, 3);
      drawLineSegment(ctx, xZero, yZero, x2, y2, p2.y >= 0 ? green : red, 3);
    }
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const xx = xToPx(i);
    const yy = yToPx(p.y);

    taChartHoverPoints.push({
      x: xx,
      y: yy,
      radius: 14,
      valueText: String(p.rawValue),
      isPositive: Number(p.y) >= 0
    });

    drawCircle(ctx, xx, yy, 4, p.y >= 0 ? green : red);
  }
}

async function loadTaDataGraph() {
  if (!taChartCanvas) return;

  try {
    setTaChartStatus("Loading…");

    const res = await fetch(TA_DATA_READONLY_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    const rawText = await res.text();

    let json;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error("Invalid JSON returned by ta-data-readonly");
    }

    if (!res.ok) {
      throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
    }

    const rows = Array.isArray(json?.data) ? json.data : [];
    const filteredRows = rows
      .filter((row) => Number(row?.id) >= 13)
      .map((row) => ({
        ...row,
        __createdAt: new Date(row?.created_at_minsk || 0).getTime(),
      }))
      .filter((row) => Number.isFinite(row.__createdAt))
      .sort((a, b) => {
        if (a.__createdAt !== b.__createdAt) return a.__createdAt - b.__createdAt;
        return Number(a?.id) - Number(b?.id);
      });

    const latestRow = filteredRows.length ? filteredRows[filteredRows.length - 1] : null;
    if (latestRow) {
      console.log("Latest TA row:", latestRow.id, latestRow.created_at_minsk, latestRow.value);
      setTaChartStatus(`Latest date: ${formatTaDateLabel(latestRow.created_at_minsk)}`);
    }

    drawTaDataChart(filteredRows);
  } catch (e) {
    console.error("Failed to load TA chart", e);
    setTaChartStatus(`Error: ${e?.message || e}`);
    drawTaDataChart([]);
  }
}

if (reloadTaChartBtn) {
  reloadTaChartBtn.addEventListener("click", loadTaDataGraph);
}

if (taChartCanvas) {
  taChartCanvas.addEventListener("mouseleave", () => {
    hideTaChartTooltip();
  });

  taChartCanvas.addEventListener("mousemove", (e) => {
    const rect = taChartCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let hit = null;
    let bestDist = Infinity;

    for (const p of taChartHoverPoints) {
      const dx = mouseX - p.x;
      const dy = mouseY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= p.radius && dist < bestDist) {
        bestDist = dist;
        hit = p;
      }
    }

    if (!hit) {
      hideTaChartTooltip();
      return;
    }

    showTaChartTooltip(hit.x, hit.y, `${hit.valueText}`, hit.isPositive);
  });
}

// ================== INITIAL LOADS / REFRESH ==================

window.addEventListener("load", () => {
  loadCryptoPrices();
  loadFearGreed();
  loadPuell();

  loadTotalAssets();
  loadDefiAssets();
  loadAvgBtc();
  loadAvgEth();
  loadPnlAssets();
  loadPercentageAssets();
  loadTaDataGraph();

  if (!window.ethereum) return;
  const saved = localStorage.getItem("savedAddress");
  if (!saved) return;

  (async () => {
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts.includes(saved)) return;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network  = await provider.getNetwork();
      if (Number(network.chainId) !== 42161) return;

      statusDiv.textContent = "Reading your Aave account data...";
      await loadAaveDataForUser(saved, provider);
      await loadMorphoHealthFactor(saved);
      setConnectedUI(saved);
      statusDiv.textContent = "Loaded from previous connection.";
    } catch (err) {
      console.error(err);
    }
  })();
});

// Refresh intervals
setInterval(loadCryptoPrices, 5 * 60 * 1000);
setInterval(loadFearGreed, 30 * 60 * 1000);
setInterval(loadPuell, 60 * 60 * 1000);
setInterval(() => {
  if (currentAddress) loadMorphoHealthFactor(currentAddress);
}, 30 * 60 * 1000);
