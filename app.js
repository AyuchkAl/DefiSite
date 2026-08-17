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

// ================== FEAR & GREED ==================

async function loadFearGreed() {
  try {
    const res = await fetch(CMC_FNG_PROXY_URL, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const value = Number(json.value);
    latestFgValue = Number.isFinite(value) ? value : null;

    const label = String(json.label || "").toLowerCase();

    if (fgValueEl) fgValueEl.textContent = Number.isFinite(value) ? String(value) : "–";
    if (fgLabelEl) fgLabelEl.textContent = label ? label : "–";

    if (fgNeedleEl && Number.isFinite(value)) {
      const deg = -90 + (value / 100) * 180;
      fgNeedleEl.setAttribute("transform", `rotate(${deg} 110 110)`);
    }

    updateHoldSellPanel();
  } catch (e) {
    console.error("Failed to load Fear & Greed (CMC proxy)", e);
    latestFgValue = null;
    if (fgValueEl) fgValueEl.textContent = "–";
    if (fgLabelEl) fgLabelEl.textContent = "Unavailable";
    updateHoldSellPanel();
  }
}

// ================== MARKET PRICES ======================

async function loadCryptoPrices() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&order=market_cap_desc&per_page=2&page=1&sparkline=false&price_change_percentage=24h"
    );
    const data = await res.json();
    const btc = data.find((c) => c.id === "bitcoin");
    const eth = data.find((c) => c.id === "ethereum");

    latestBtc24h = Number.isFinite(btc?.price_change_percentage_24h)
      ? btc.price_change_percentage_24h
      : null;

    latestEth24h = Number.isFinite(eth?.price_change_percentage_24h)
      ? eth.price_change_percentage_24h
      : null;

    currentBtcPrice = Number.isFinite(btc?.current_price) ? btc.current_price : null;
    currentEthPrice = Number.isFinite(eth?.current_price) ? eth.current_price : null;

    function setCoin(elPrice, elChange, coin) {
      if (!coin) return;

      if (elPrice) {
        elPrice.textContent =
          "$" + coin.current_price.toLocaleString(undefined, { maximumFractionDigits: 0 });
      }

      if (elChange) {
        const pct = coin.price_change_percentage_24h;
        const formatted = (pct > 0 ? "+" : "") + pct.toFixed(2) + "%";
        elChange.textContent = formatted;

        let cls;
        if (pct > 0.1) cls = "price-up";
        else if (pct < -0.1) cls = "price-down";
        else cls = "price-flat";

        [elPrice, elChange].forEach((el) => {
          if (!el) return;
          el.classList.remove("price-up", "price-down", "price-flat");
          el.classList.add(cls);
        });
      }
    }

    setCoin(btcPriceEl, btcChangeEl, btc);
    setCoin(ethPriceEl, ethChangeEl, eth);

    updateMorphoLiqDisplay();
    updateHoldSellPanel();
  } catch (e) {
    console.error("Failed to load BTC/ETH prices", e);
    latestBtc24h = null;
    latestEth24h = null;
    currentBtcPrice = null;
    currentEthPrice = null;
    updateMorphoLiqDisplay();
    updateHoldSellPanel();
  }
}

// ================== AAVE LOGIC ===============================

async function loadAaveDataForUser(userAddress, provider) {
  try {
    const pool   = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
    const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);

    const ud = await pool.getUserAccountData(userAddress);
    const totalCollateralBase = Number(ethers.formatUnits(ud.totalCollateralBase, 8));
    const totalDebtBase       = Number(ethers.formatUnits(ud.totalDebtBase, 8));
    const hlThreshold         = Number(ud.currentLiquidationThreshold) / 10000;
    const healthFactor        = Number(ethers.formatUnits(ud.healthFactor, 18));

    setHealthFactorDisplay(healthFactor);

    if (totalDebtBase === 0 || totalCollateralBase === 0) {
      liqEthBottomEl.textContent = "ETH ~ –";
      liqBtcBottomEl.textContent = "BTC ~ –";
      return;
    }

    const dropFactor = totalDebtBase / (hlThreshold * totalCollateralBase);

    if (dropFactor >= 1) {
      liqEthBottomEl.textContent = "ETH ~ current";
      liqBtcBottomEl.textContent = "BTC ~ current";
      return;
    }

    const [ethPriceRaw, btcPriceRaw] = await Promise.all([
      oracle.getAssetPrice(WETH_ADDRESS),
      oracle.getAssetPrice(WBTC_ADDRESS),
    ]);

    const ethNow = Number(ethers.formatUnits(ethPriceRaw, 8));
    const btcNow = Number(ethers.formatUnits(btcPriceRaw, 8));

    const ethAtHF1 = ethNow * dropFactor;
    const btcAtHF1 = btcNow * dropFactor;

    liqEthBottomEl.textContent = "ETH ~ " + shortenNumber(ethAtHF1);
    liqBtcBottomEl.textContent = "BTC ~ " + shortenNumber(btcAtHF1);
  } catch (e) {
    console.error("Failed to load Aave / liq price", e);
    liqEthBottomEl.textContent = "ETH ~ –";
    liqBtcBottomEl.textContent = "BTC ~ –";
  }
}

// ================== MORPHO LOGIC ==================================

async function loadMorphoHealthFactor(userAddress) {
  try {
    const res = await fetch(
      `${MORPHO_HF_PROXY_URL}?address=${encodeURIComponent(userAddress)}`,
      { cache: "no-store" }
    );
    const json = await res.json();

    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const hf = Number(json.healthFactor);
    if (!Number.isFinite(hf)) {
      currentMorphoHf = null;
      setMorphoHealthFactorDisplay(NaN);
      updateMorphoLiqDisplay();
      return;
    }

    currentMorphoHf = hf;
    setMorphoHealthFactorDisplay(hf);
    updateMorphoLiqDisplay();
  } catch (e) {
    console.error("Failed to load Morpho health factor", e);
    currentMorphoHf = null;
    setMorphoHealthFactorDisplay(NaN);
    updateMorphoLiqDisplay();
  }
}

// ================== WALLET CONNECTION ======================

async function connectAndLoad() {
  try {
    if (!window.ethereum) {
      statusDiv.textContent = "No browser wallet detected (MetaMask / Rabby).";
      return;
    }

    if (currentAddress) {
      walletMenu.classList.toggle("visible");
      return;
    }

    statusDiv.textContent = "Connecting wallet...";
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) {
      statusDiv.textContent = "No account returned from wallet.";
      return;
    }

    const userAddress = accounts[0];
    localStorage.setItem("savedAddress", userAddress);

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network  = await provider.getNetwork();
    if (Number(network.chainId) !== 42161) {
      statusDiv.textContent = "Please switch wallet to the Arbitrum One network and try again.";
      return;
    }

    statusDiv.textContent = "Reading your Aave account data...";
    await loadAaveDataForUser(userAddress, provider);
    await loadMorphoHealthFactor(userAddress);
    setConnectedUI(userAddress);
    statusDiv.textContent = "Done.";
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Error: " + (err.message || err);
  }
}

connectButton.addEventListener("click", connectAndLoad);

disconnectBtn.addEventListener("click", () => {
  setDisconnectedUI();
});

document.addEventListener("click", (e) => {
  if (!walletMenu.classList.contains("visible")) return;
  if (!e.target.closest(".wallet-container")) walletMenu.classList.remove("visible");
});

// ================== TOTAL ASSETS ==================

const TOTAL_ASSETS_SPREADSHEET_ID = "1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM";
const totalAssetsValueCardEl = document.getElementById("totalAssetsValueCard");
const TOTAL_ASSETS_GID = "0";

const TOTAL_ASSETS_CELL_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${TOTAL_ASSETS_SPREADSHEET_ID}/export?format=csv&gid=${TOTAL_ASSETS_GID}&range=T2`;

async function loadTotalAssets() {
  try {
    if (!totalAssetsValueCardEl) return;

    const res = await fetch(TOTAL_ASSETS_CELL_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let text = (await res.text()).trim();
    text = text.replace(/^"+|"+$/g, "");
    text = text.replace(/\s/g, "");

    if (text.includes(",") && !text.includes(".")) {
      text = text.replace(",", ".");
    } else if (text.includes(",") && text.includes(".")) {
      const lastComma = text.lastIndexOf(",");
      const lastDot = text.lastIndexOf(".");
      if (lastComma > lastDot) {
        text = text.replace(/\./g, "");
        text = text.replace(",", ".");
      } else {
        text = text.replace(/,/g, "");
      }
    }

    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error("Not a number: " + text);

    totalAssetsValueCardEl.textContent =
      "$" + Math.trunc(value).toLocaleString("de-DE");
  } catch (err) {
    console.error("Failed to load Total Assets", err);
    if (totalAssetsValueCardEl) totalAssetsValueCardEl.textContent = "Unavailable";
  }
}

setInterval(loadTotalAssets, 10 * 60 * 1000);

// ================== DEFI ASSETS ==================

const defiAssetsValueCardEl = document.getElementById("defiAssetsValueCard");

const DEFI_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=W2" +
  "&tqx=out:json";

async function loadDefiAssets() {
  try {
    if (!defiAssetsValueCardEl) return;

    const res = await fetch(DEFI_ASSETS_GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.text();
    const data = parseGvizJson(raw);

    const cell = data?.table?.rows?.[0]?.c?.[0];
    const v = cell?.v;
    const f = cell?.f;

    const num = (typeof v === "number" && Number.isFinite(v)) ? v : parseCurrencyLoose(f ?? v);
    if (!Number.isFinite(num)) throw new Error("Not a number. v=" + String(v) + " f=" + String(f));

    defiAssetsValueCardEl.textContent = formatUsd(num);
  } catch (err) {
    console.error("Failed to load DeFi Assets", err);
    defiAssetsValueCardEl.textContent = "Unavailable";
  }
}

setInterval(loadDefiAssets, 10 * 60 * 1000);

// ================== AVG BTC / AVG ETH ==================

const AVG_BTC_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=S2" +
  "&tqx=out:json";

const AVG_ETH_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=L2" +
  "&tqx=out:json";

async function loadAvgBtc() {
  try {
    if (!avgBtcValueEl) return;

    const res = await fetch(AVG_BTC_GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.text();
    const data = parseGvizJson(raw);

    const cell = data?.table?.rows?.[0]?.c?.[0];
    const v = cell?.v;
    const f = cell?.f;

    const num = (typeof v === "number" && Number.isFinite(v)) ? v : parseCurrencyLoose(f ?? v);
    if (!Number.isFinite(num)) throw new Error("AVG BTC not a number");

    avgBtcValueEl.textContent = formatUsd0(num);
  } catch (err) {
    console.error("Failed to load AVG BTC", err);
    if (avgBtcValueEl) avgBtcValueEl.textContent = "–";
  }
}

async function loadAvgEth() {
  try {
    if (!avgEthValueEl) return;

    const res = await fetch(AVG_ETH_GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.text();
    const data = parseGvizJson(raw);

    const cell = data?.table?.rows?.[0]?.c?.[0];
    const v = cell?.v;
    const f = cell?.f;

    const num = (typeof v === "number" && Number.isFinite(v)) ? v : parseCurrencyLoose(f ?? v);
    if (!Number.isFinite(num)) throw new Error("AVG ETH not a number");

    avgEthValueEl.textContent = formatUsd0(num);
  } catch (err) {
    console.error("Failed to load AVG ETH", err);
    if (avgEthValueEl) avgEthValueEl.textContent = "–";
  }
}

setInterval(loadAvgBtc, 10 * 60 * 1000);
setInterval(loadAvgEth, 10 * 60 * 1000);

// ================== PnL ASSETS ==================

const pnlAssetsValueCardEl = document.getElementById("pnlAssetsValueCard");

const PNL_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=X2" +
  "&tqx=out:json";

async function loadPnlAssets() {
  try {
    if (!pnlAssetsValueCardEl) return;

    const res = await fetch(PNL_ASSETS_GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.text();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const data = JSON.parse(raw.slice(start, end + 1));

    const cell = data?.table?.rows?.[0]?.c?.[0];
    const v = cell?.v;
    const f = cell?.f;

    let num = (typeof v === "number" && Number.isFinite(v)) ? v : NaN;

    if (!Number.isFinite(num)) {
      let s = String(f ?? v ?? "").trim();
      s = s.replace(/[^\d.,-]/g, "");

      const lastDot = s.lastIndexOf(".");
      const lastComma = s.lastIndexOf(",");

      if (lastDot !== -1 && lastComma !== -1) {
        if (lastComma > lastDot) s = s.replace(/\./g, "").replace(/,/g, ".");
        else s = s.replace(/,/g, "");
      } else if (lastDot !== -1) {
        const fracLen = s.length - lastDot - 1;
        if (fracLen === 3) s = s.replace(/\./g, "");
      } else if (lastComma !== -1) {
        const fracLen = s.length - lastComma - 1;
        if (fracLen === 3) s = s.replace(/,/g, "");
        else s = s.replace(/,/g, ".");
      }

      num = Number(s);
    }

    pnlAssetsValueCardEl.classList.remove("pnl-positive", "pnl-negative");
    if (num > 0) pnlAssetsValueCardEl.classList.add("pnl-positive");
    if (num < 0) pnlAssetsValueCardEl.classList.add("pnl-negative");

    if (!Number.isFinite(num)) throw new Error("PnL cell is not a number. v=" + String(v) + " f=" + String(f));

    const formatted = (num < 0 ? "-" : "") + formatUsd(Math.abs(num));
    pnlAssetsValueCardEl.textContent = formatted;
  } catch (err) {
    console.error("Failed to load PnL Assets", err);
    pnlAssetsValueCardEl.textContent = "Unavailable";
  }
}

setInterval(loadPnlAssets, 10 * 60 * 1000);

// ================== PERCENTAGE ASSETS ==================

const pctAssetsValueCardEl = document.getElementById("pctAssetsValueCard");

const PCT_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=Y2" +
  "&tqx=out:json";

async function loadPercentageAssets() {
  try {
    if (!pctAssetsValueCardEl) return;

    const res = await fetch(PCT_ASSETS_GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.text();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const data = JSON.parse(raw.slice(start, end + 1));

    const cell = data?.table?.rows?.[0]?.c?.[0];
    const v = cell?.v;
    const f = cell?.f;

    let num = (typeof v === "number" && Number.isFinite(v)) ? v : parsePercentLoose(f ?? v);
    if (Number.isFinite(num) && Math.abs(num) <= 1) num = num * 100;

    if (!Number.isFinite(num)) throw new Error("Percentage cell is not a number. v=" + String(v) + " f=" + String(f));

    pctAssetsValueCardEl.classList.remove("pct-positive", "pct-negative");
    if (num > 0) pctAssetsValueCardEl.classList.add("pct-positive");
    if (num < 0) pctAssetsValueCardEl.classList.add("pct-negative");

    const sign = num < 0 ? "-" : "+";
    pctAssetsValueCardEl.textContent = `${sign}${Math.abs(num).toFixed(2)}%`;
  } catch (err) {
    console.error("Failed to load Percentage Assets", err);
    pctAssetsValueCardEl.textContent = "Unavailable";
  }
}

setInterval(loadPercentageAssets, 10 * 60 * 1000);

// ================== MY ASSETS MENU ==================

const myAssetsButton = document.getElementById("myAssetsButton");
const myAssetsMenu = document.getElementById("myAssetsMenu");

function closeMyAssetsMenu() {
  if (!myAssetsMenu) return;
  myAssetsMenu.classList.remove("visible");
  myAssetsMenu.style.left = "";
  myAssetsMenu.style.top = "";
  if (myAssetsButton) myAssetsButton.setAttribute("aria-expanded", "false");
}

function repositionMyAssetsMenuIfOpen() {
  if (!myAssetsMenu || !myAssetsButton) return;
  if (!myAssetsMenu.classList.contains("visible")) return;

  const r = myAssetsButton.getBoundingClientRect();
  const menuW = myAssetsMenu.offsetWidth || 190;

  let left = r.left + (r.width / 2) - (menuW / 2);
  left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
  const top = r.bottom + 10;

  myAssetsMenu.style.left = `${Math.round(left)}px`;
  myAssetsMenu.style.top  = `${Math.round(top)}px`;
}

if (myAssetsButton && myAssetsMenu) {
  myAssetsButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !myAssetsMenu.classList.contains("visible");

    walletMenu.classList.remove("visible");

    if (!willOpen) {
      closeMyAssetsMenu();
      return;
    }

    myAssetsMenu.classList.add("visible");
    myAssetsButton.setAttribute("aria-expanded", "true");
    repositionMyAssetsMenuIfOpen();
  });

  document.addEventListener("click", (e) => {
    if (!myAssetsMenu.classList.contains("visible")) return;
    if (!e.target.closest(".my-assets-container")) closeMyAssetsMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMyAssetsMenu();
  });

  window.addEventListener("scroll", repositionMyAssetsMenuIfOpen, true);
  window.addEventListener("resize", repositionMyAssetsMenuIfOpen);

  function closeMyAssetsOnLinkClick(e) {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    setTimeout(closeMyAssetsMenu, 0);
  }
  myAssetsMenu.addEventListener("click", closeMyAssetsOnLinkClick, true);
}

// ================== DeFi MENU ==================
if (window.__defiMenuInitialized) {
  console.warn("DeFi menu already initialized; skipping duplicate init.");
} else {
  window.__defiMenuInitialized = true;

  (function initDefiMenu() {
    const defiContainer = document.getElementById("defiContainer");
    const defiButton = document.getElementById("defiButton");
    const defiMenu = document.getElementById("defiMenu");
    const defiContextMenu = document.getElementById("defiContextMenu");
    const defiAddSiteBtn = document.getElementById("defiAddSiteBtn");
    const defiAddFolderBtn = document.getElementById("defiAddFolderBtn");

    const defiItemContextMenu = document.getElementById("defiItemContextMenu");
    const defiRenameFolderBtn = document.getElementById("defiRenameFolderBtn");
    const defiDeleteFolderBtn = document.getElementById("defiDeleteFolderBtn");
    const defiDeleteSiteBtn = document.getElementById("defiDeleteSiteBtn");

    const siteDialogBackdrop = document.getElementById("siteDialogBackdrop");
    const siteDialogTitle = document.getElementById("siteDialogTitle");
    const siteUrlInput = document.getElementById("siteUrlInput");
    const siteLabelInput = document.getElementById("siteLabelInput");
    const siteDialogCancelBtn = document.getElementById("siteDialogCancelBtn");
    const siteDialogSaveBtn = document.getElementById("siteDialogSaveBtn");
    const siteDialogError = document.getElementById("siteDialogError");

    if (
      !defiContainer ||
      !defiButton ||
      !defiMenu ||
      !defiContextMenu ||
      !defiAddSiteBtn ||
      !defiAddFolderBtn ||
      !defiItemContextMenu ||
      !defiRenameFolderBtn ||
      !defiDeleteFolderBtn ||
      !defiDeleteSiteBtn ||
      !siteDialogBackdrop ||
      !siteDialogTitle ||
      !siteUrlInput ||
      !siteLabelInput ||
      !siteDialogCancelBtn ||
      !siteDialogSaveBtn ||
      !siteDialogError
    ) return;

    let pendingDeleteSiteId = null;
    let pendingDeleteFolderId = null;
    let pendingRenameFolderId = null;
    let pendingMoveSiteId = null;
    let pendingMoveSiteCurrentFolderId = null;

    let dialogMode = "site"; // "site" | "folder" | "folder_rename"

    let defiFoldersCache = [];
    let defiSitesCache = [];
    let defiViewMode = "folders"; // "folders" | "sites"
    let currentFolderId = null;
    let renderSeq = 0;

    // dynamic move submenu elements
    let moveFolderBtn = null;
    let moveFolderList = null;

    function isValidHttpUrl(s) {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }

    function edgeStyleFromDomain(hostname) {
      let h = String(hostname || "").replace(/^www\./i, "");
      if (!h) return "Site";

      const parts = h.split(".");
      let base = parts.length >= 2 ? parts[0] : h;

      base = base
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/defi/ig, "DeFi")
        .replace(/devops/ig, "DevOps")
        .replace(/tracker/ig, "Tracker")
        .replace(/[-_]+/g, " ")
        .trim();

      base = base.replace(/DeFi([A-Za-z]+)/, "DeFi $1").trim();

      base = base
        .split(/\s+/)
        .map(w => (w === "DeFi" || w === "DevOps") ? w : (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join(" ")
        .trim();

      return base || h;
    }

    function makeEdgeLikeLabel(url) {
      try {
        const u = new URL(url);
        const name = edgeStyleFromDomain(u.hostname);
        const max = 22;
        return name.length > max ? name.slice(0, max - 1) + "…" : name;
      } catch {
        return "Site";
      }
    }

    function ensureMoveFolderUi() {
      if (moveFolderBtn && moveFolderList) return;

      moveFolderBtn = document.createElement("button");
      moveFolderBtn.type = "button";
      moveFolderBtn.className = "defi-context-btn";
      moveFolderBtn.id = "defiMoveFolderBtn";
      moveFolderBtn.textContent = "Move to folder";

      moveFolderList = document.createElement("div");
      moveFolderList.id = "defiMoveFolderList";
      moveFolderList.style.marginTop = "4px";
      moveFolderList.style.paddingTop = "4px";
      moveFolderList.style.borderTop = "1px solid rgba(255,255,255,0.08)";
      moveFolderList.style.maxHeight = "220px";
      moveFolderList.style.overflowY = "auto";
      moveFolderList.style.display = "none";

      moveFolderBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        moveFolderList.style.display = moveFolderList.style.display === "none" ? "block" : "none";
      });

      // Insert before delete site button for better UX
      defiItemContextMenu.insertBefore(moveFolderBtn, defiDeleteSiteBtn);
      defiItemContextMenu.insertBefore(moveFolderList, defiDeleteSiteBtn);
    }

    function resetMoveState() {
      pendingMoveSiteId = null;
      pendingMoveSiteCurrentFolderId = null;
      if (moveFolderList) {
        moveFolderList.innerHTML = "";
        moveFolderList.style.display = "none";
      }
    }

    function openSiteDialog(mode = "site", presetName = "") {
      dialogMode = mode;
      siteDialogError.textContent = "";
      siteUrlInput.value = "";
      siteLabelInput.value = "";

      if (mode === "site") {
        siteDialogTitle.textContent = "Add site";
        siteUrlInput.style.display = "";
        siteUrlInput.previousElementSibling.style.display = "";
        siteUrlInput.placeholder = "https://example.com";
        siteLabelInput.previousElementSibling.textContent = "Enter label";
        siteLabelInput.placeholder = "Site label";
      } else if (mode === "folder") {
        siteDialogTitle.textContent = "Add folder";
        siteUrlInput.style.display = "none";
        siteUrlInput.previousElementSibling.style.display = "none";
        siteLabelInput.previousElementSibling.textContent = "Enter folder name";
        siteLabelInput.placeholder = "Folder name";
      } else {
        siteDialogTitle.textContent = "Rename folder";
        siteUrlInput.style.display = "none";
        siteUrlInput.previousElementSibling.style.display = "none";
        siteLabelInput.previousElementSibling.textContent = "Enter new folder name";
        siteLabelInput.placeholder = "New folder name";
        siteLabelInput.value = presetName || "";
      }

      siteDialogBackdrop.classList.remove("hidden");
      siteDialogBackdrop.setAttribute("aria-hidden", "false");
      setTimeout(() => siteLabelInput.focus(), 0);
    }

    function closeSiteDialog() {
      siteDialogBackdrop.classList.add("hidden");
      siteDialogBackdrop.setAttribute("aria-hidden", "true");
      siteDialogError.textContent = "";
      pendingRenameFolderId = null;
    }

    async function parseApiJson(res) {
      const text = await res.text();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON from API: ${text.slice(0, 200)}`);
      }
    }

    async function fetchDefiData() {
      const res = await fetch(WEB_SITES_API_URL, {
        method: "GET",
        cache: "no-store"
      });

      const json = await parseApiJson(res);

      if (!res.ok) {
        throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
      }

      if (json?.data && typeof json.data === "object") {
        return {
          folders: Array.isArray(json.data.folders) ? json.data.folders : [],
          sites: Array.isArray(json.data.sites) ? json.data.sites : [],
        };
      }

      return {
        folders: Array.isArray(json?.folders) ? json.folders : [],
        sites: Array.isArray(json?.sites) ? json.sites : [],
      };
    }

    async function insertDefiLink(url, label, folderId = null) {
      const res = await fetch(WEB_SITES_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          label,
          folder_id: folderId
        })
      });

      const json = await parseApiJson(res);
      if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
      return json;
    }

    async function insertFolder(name) {
      const res = await fetch(WEB_SITES_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "folder",
          name
        })
      });

      const json = await parseApiJson(res);
      if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
      return json;
    }

    async function renameFolder(folderId, name) {
      const res = await fetch(WEB_SITES_API_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "folder_rename",
          id: folderId,
          name
        })
      });

      const json = await parseApiJson(res);
      if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
      return json;
    }

    async function moveSiteToFolder(siteId, folderIdOrNull) {
      const res = await fetch(WEB_SITES_API_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: siteId,
          folder_id: folderIdOrNull == null ? null : folderIdOrNull
        })
      });

      const json = await parseApiJson(res);
      if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
      return json;
    }

    async function deleteDefiLink(id) {
      const res = await fetch(WEB_SITES_API_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });

      const json = await parseApiJson(res);
      if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
      return json;
    }

    async function deleteFolder(folderId) {
      const res = await fetch(WEB_SITES_API_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "folder",
          id: folderId
        })
      });

      const json = await parseApiJson(res);
      if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
      return json;
    }

    function closeDefiMenu() {
      defiMenu.classList.remove("visible");
      defiMenu.style.left = "";
      defiMenu.style.top = "";
      defiButton.setAttribute("aria-expanded", "false");
    }

    function repositionDefiMenuIfOpen() {
      if (!defiMenu.classList.contains("visible")) return;

      const r = defiButton.getBoundingClientRect();
      const menuW = defiMenu.offsetWidth || 190;

      let left = r.left + (r.width / 2) - (menuW / 2);
      left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
      const top = r.bottom + 10;

      defiMenu.style.left = `${Math.round(left)}px`;
      defiMenu.style.top = `${Math.round(top)}px`;
    }

    function hideAddContextMenu() {
      defiContextMenu.classList.remove("visible");
      defiContextMenu.style.left = "-9999px";
      defiContextMenu.style.top = "-9999px";
    }

    function showAddContextMenu(x, y) {
      const strategyButton = document.getElementById("strategyButton");
      const menuWidth = defiContextMenu.offsetWidth || 190;
      const menuHeight = defiContextMenu.offsetHeight || 52;

      let left = x;
      let top = y + 10;

      if (strategyButton) {
        const r = strategyButton.getBoundingClientRect();
        const overlapsHorizontally = left < r.right && (left + menuWidth) > r.left;
        const overlapsVertically = top < r.bottom && (top + menuHeight) > r.top;

        if (overlapsHorizontally && overlapsVertically) {
          top = r.bottom + 8;
        }
      }

      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));

      defiContextMenu.style.left = `${Math.round(left)}px`;
      defiContextMenu.style.top = `${Math.round(top)}px`;
      defiContextMenu.classList.add("visible");
    }

    function hideItemContextMenu() {
      defiItemContextMenu.classList.remove("visible");
      defiItemContextMenu.style.left = "-9999px";
      defiItemContextMenu.style.top = "-9999px";

      pendingDeleteSiteId = null;
      pendingDeleteFolderId = null;
      pendingRenameFolderId = null;
      resetMoveState();
    }

    function setItemContextMode(mode) {
      // mode: "site" | "folder"
      if (mode === "site") {
        defiRenameFolderBtn.style.display = "none";
        defiDeleteFolderBtn.style.display = "none";
        defiDeleteSiteBtn.style.display = "block";
        if (moveFolderBtn) moveFolderBtn.style.display = "block";
        if (moveFolderList) moveFolderList.style.display = "none";
      } else {
        defiRenameFolderBtn.style.display = "block";
        defiDeleteFolderBtn.style.display = "block";
        defiDeleteSiteBtn.style.display = "none";
        if (moveFolderBtn) moveFolderBtn.style.display = "none";
        if (moveFolderList) moveFolderList.style.display = "none";
      }
    }

    function buildMoveFolderList() {
      if (!moveFolderList) return;
      moveFolderList.innerHTML = "";

      // Unassigned first
      const unassignedBtn = document.createElement("button");
      unassignedBtn.type = "button";
      unassignedBtn.className = "defi-context-btn";
      unassignedBtn.textContent = "Unassigned";
      unassignedBtn.style.fontSize = "12px";
      unassignedBtn.style.padding = "7px 10px";
      unassignedBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pendingMoveSiteId == null) return;
        if (pendingMoveSiteCurrentFolderId == null) {
          hideItemContextMenu();
          return;
        }
        try {
          await moveSiteToFolder(pendingMoveSiteId, null);
          hideItemContextMenu();
          await openDefiMenu();
        } catch (err) {
          console.error("Failed to move site to Unassigned", err);
          alert("Failed to move site: " + (err?.message || err));
        }
      });
      moveFolderList.appendChild(unassignedBtn);

      const folders = [...defiFoldersCache]
        .filter((f) => f && f.id != null)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      for (const folder of folders) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "defi-context-btn";
        btn.textContent = folder.name || "Folder";
        btn.style.fontSize = "12px";
        btn.style.padding = "7px 10px";

        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (pendingMoveSiteId == null) return;
          const targetId = Number(folder.id);
          const currentId = pendingMoveSiteCurrentFolderId == null ? null : Number(pendingMoveSiteCurrentFolderId);

          // No-op if same folder
          if (currentId != null && currentId === targetId) {
            hideItemContextMenu();
            return;
          }

          try {
            await moveSiteToFolder(pendingMoveSiteId, targetId);
            hideItemContextMenu();
            await openDefiMenu();
          } catch (err) {
            console.error("Failed to move site", err);
            alert("Failed to move site: " + (err?.message || err));
          }
        });

        moveFolderList.appendChild(btn);
      }
    }

    function showSiteItemContextMenu(x, y, siteId, siteFolderId) {
      setItemContextMode("site");
      pendingDeleteSiteId = siteId;
      pendingDeleteFolderId = null;
      pendingRenameFolderId = null;

      pendingMoveSiteId = siteId;
      pendingMoveSiteCurrentFolderId = siteFolderId == null || siteFolderId === "" ? null : Number(siteFolderId);

      buildMoveFolderList();

      defiItemContextMenu.style.left = `${x}px`;
      defiItemContextMenu.style.top = `${y}px`;
      defiItemContextMenu.classList.add("visible");
    }

    function showFolderItemContextMenu(x, y, folderId) {
      if (folderId == null || folderId === "") return; // Unassigned => no menu

      setItemContextMode("folder");
      pendingDeleteFolderId = Number(folderId);
      pendingRenameFolderId = Number(folderId);
      pendingDeleteSiteId = null;
      resetMoveState();

      defiItemContextMenu.style.left = `${x}px`;
      defiItemContextMenu.style.top = `${y}px`;
      defiItemContextMenu.classList.add("visible");
    }

    function hideAllDefiContextMenus() {
      hideAddContextMenu();
      hideItemContextMenu();
    }

    function getSitesForFolder(folderId) {
      if (folderId == null) return defiSitesCache.filter((s) => s.folder_id == null);
      return defiSitesCache.filter((s) => String(s.folder_id) === String(folderId));
    }

    function showFoldersView() {
      defiViewMode = "folders";
      currentFolderId = null;
      renderDefiMenu();
    }

    function showSitesView(folderId) {
      defiViewMode = "sites";
      currentFolderId = folderId;
      renderDefiMenu();
    }

    function createSiteElement(site) {
      const a = document.createElement("a");
      a.className = "my-assets-item defi-site-item";
      a.href = String(site.url || "#");
      a.textContent = String(site.label || makeEdgeLikeLabel(site.url));
      a.dataset.id = String(site.id);
      a.dataset.folderId = site.folder_id == null ? "" : String(site.folder_id);

      a.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      return a;
    }

    async function renderDefiMenu() {
      const seq = ++renderSeq;
      defiMenu.innerHTML = "";

      try {
        const data = await fetchDefiData();
        if (seq !== renderSeq) return;

        defiFoldersCache = Array.isArray(data.folders) ? data.folders : [];
        defiSitesCache = Array.isArray(data.sites) ? data.sites : [];

        const folders = [...defiFoldersCache]
          .filter((f) => f && f.id != null)
          .filter((f, index, arr) => arr.findIndex((x) => String(x.id) === String(f.id)) === index)
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        const unassignedFolder = { id: null, name: "Unassigned" };

        if (defiViewMode === "folders") {
          if (folders.length === 0) {
            const empty = document.createElement("div");
            empty.style.padding = "9px 10px";
            empty.style.color = "rgba(245,245,245,0.70)";
            empty.style.fontSize = "13px";
            empty.textContent = "No folders yet";
            defiMenu.appendChild(empty);
          } else {
            for (const folder of folders) {
              const row = document.createElement("button");
              row.type = "button";
              row.className = "my-assets-item defi-folder-row";
              row.textContent = folder.name || "Folder";
              row.dataset.folderId = String(folder.id);

              row.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showSitesView(folder.id);
              });

              defiMenu.appendChild(row);
            }
          }

          const unassignedRow = document.createElement("button");
          unassignedRow.type = "button";
          unassignedRow.className = "my-assets-item defi-folder-row";
          unassignedRow.textContent = "Unassigned";
          unassignedRow.dataset.folderId = "";
          unassignedRow.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showSitesView(null);
          });

          defiMenu.appendChild(unassignedRow);
          return;
        }

        const folder =
          currentFolderId == null
            ? unassignedFolder
            : defiFoldersCache.find((f) => String(f.id) === String(currentFolderId));

        if (!folder) {
          showFoldersView();
          return;
        }

        const backRow = document.createElement("button");
        backRow.type = "button";
        backRow.className = "my-assets-item defi-folder-row";
        backRow.textContent = "← Back";
        backRow.dataset.folderId = "__BACK__";
        backRow.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          showFoldersView();
        });
        defiMenu.appendChild(backRow);

        const headerRow = document.createElement("div");
        headerRow.className = "defi-folder";
        const header = document.createElement("div");
        header.className = "defi-folder-header";
        header.textContent = folder.name || "Unassigned";
        header.style.cursor = "default";
        headerRow.appendChild(header);
        defiMenu.appendChild(headerRow);

        const sites = getSitesForFolder(currentFolderId);

        if (sites.length === 0) {
          const empty = document.createElement("div");
          empty.className = "defi-folder";
          const body = document.createElement("div");
          body.className = "defi-folder-body";
          const emptyText = document.createElement("div");
          emptyText.className = "defi-folder-empty";
          emptyText.textContent = "No sites in this folder";
          body.appendChild(emptyText);
          empty.appendChild(body);
          defiMenu.appendChild(empty);
          return;
        }

        for (const site of sites) {
          const section = document.createElement("div");
          section.className = "defi-folder";
          const body = document.createElement("div");
          body.className = "defi-folder-body";
          body.appendChild(createSiteElement(site));
          section.appendChild(body);
          defiMenu.appendChild(section);
        }
      } catch (e) {
        console.error("Failed to render DeFi menu", e);

        const err = document.createElement("div");
        err.style.padding = "9px 10px";
        err.style.color = "#ff97aa";
        err.style.fontSize = "13px";
        err.textContent = "Failed to load sites";
        defiMenu.appendChild(err);
      }
    }

    async function openDefiMenu() {
      await renderDefiMenu();
      defiMenu.classList.add("visible");
      defiButton.setAttribute("aria-expanded", "true");
      repositionDefiMenuIfOpen();
    }

    // init dynamic move UI
    ensureMoveFolderUi();

    // --- OPEN/CLOSE ---
    defiButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      hideAllDefiContextMenus();

      if (typeof closeMyAssetsMenu === "function") closeMyAssetsMenu();
      if (walletMenu) walletMenu.classList.remove("visible");

      defiViewMode = "folders";
      currentFolderId = null;

      if (defiMenu.classList.contains("visible")) {
        closeDefiMenu();
        return;
      }

      await renderDefiMenu();
      defiMenu.classList.add("visible");
      defiButton.setAttribute("aria-expanded", "true");
      repositionDefiMenuIfOpen();
    });

    // --- GLOBAL ADD MENU (ONLY on DeFi button RMB) ---
    function onDefiButtonContextMenu(e) {
      if (!e.target?.closest?.("#defiButton")) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (typeof closeMyAssetsMenu === "function") closeMyAssetsMenu();
      if (walletMenu) walletMenu.classList.remove("visible");

      closeDefiMenu();
      hideItemContextMenu();
      showAddContextMenu(e.clientX, e.clientY);
      return false;
    }

    defiButton.addEventListener("contextmenu", onDefiButtonContextMenu, true);

    // --- ITEM/FOLDER RMB MENU (capturing hard block) ---
    defiMenu.addEventListener("contextmenu", (e) => {
      const siteItem = e.target.closest("a[data-id]");
      const folderRow = e.target.closest(".defi-folder-row");

      if (!siteItem && !folderRow) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      hideAddContextMenu();

      if (siteItem) {
        const siteId = Number(siteItem.dataset.id);
        const siteFolderId = siteItem.dataset.folderId;
        showSiteItemContextMenu(e.clientX, e.clientY, siteId, siteFolderId);
        return;
      }

      // folder row case
      const raw = folderRow.dataset.folderId;

      // Back row: no context menu
      if (raw === "__BACK__") {
        hideItemContextMenu();
        return;
      }

      // Unassigned: no context menu
      if (raw === "" || raw == null) {
        hideItemContextMenu();
        return;
      }

      showFolderItemContextMenu(e.clientX, e.clientY, Number(raw));
    }, true);

    // --- Add menu actions ---
    defiAddSiteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideAddContextMenu();
      openSiteDialog("site");
    });

    defiAddFolderBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideAddContextMenu();
      openSiteDialog("folder");
    });

    // --- Item menu actions ---
    defiRenameFolderBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (pendingRenameFolderId == null) {
        hideItemContextMenu();
        return;
      }

      const folder = defiFoldersCache.find((f) => String(f.id) === String(pendingRenameFolderId));
      const currentName = folder?.name || "";

      // keep id for save; just close menu
      defiItemContextMenu.classList.remove("visible");
      openSiteDialog("folder_rename", currentName);
    });

    defiDeleteFolderBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (pendingDeleteFolderId == null) {
        hideItemContextMenu();
        return;
      }

      try {
        await deleteFolder(pendingDeleteFolderId);
        hideItemContextMenu();
        await openDefiMenu();
      } catch (err) {
        console.error("Failed to delete folder", err);
        alert("Failed to delete folder: " + (err?.message || err));
      }
    });

    defiDeleteSiteBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!pendingDeleteSiteId) {
        hideItemContextMenu();
        return;
      }

      try {
        await deleteDefiLink(pendingDeleteSiteId);
        hideItemContextMenu();
        await openDefiMenu();
      } catch (err) {
        console.error("Failed to delete site", err);
        alert("Failed to delete site: " + (err?.message || err));
      }
    });

    // --- Dialog actions ---
    siteDialogCancelBtn.addEventListener("click", () => {
      closeSiteDialog();
    });

    siteDialogBackdrop.addEventListener("click", (e) => {
      if (e.target === siteDialogBackdrop) {
        closeSiteDialog();
      }
    });

    siteDialogSaveBtn.addEventListener("click", async () => {
      const label = siteLabelInput.value.trim();
      const trimmedUrl = siteUrlInput.value.trim();

      try {
        siteDialogSaveBtn.disabled = true;
        siteDialogCancelBtn.disabled = true;
        siteDialogError.textContent = "";

        if (dialogMode === "folder") {
          if (!label) {
            siteDialogError.textContent = "Folder name is required.";
            siteLabelInput.focus();
            return;
          }

          await insertFolder(label);
          closeSiteDialog();
          await openDefiMenu();
          return;
        }

        if (dialogMode === "folder_rename") {
          if (pendingRenameFolderId == null) {
            siteDialogError.textContent = "Folder id is missing.";
            return;
          }

          if (!label) {
            siteDialogError.textContent = "New folder name is required.";
            siteLabelInput.focus();
            return;
          }

          await renameFolder(pendingRenameFolderId, label);
          closeSiteDialog();
          await openDefiMenu();
          return;
        }

        if (!trimmedUrl) {
          siteDialogError.textContent = "URL is required.";
          siteUrlInput.focus();
          return;
        }

        if (!isValidHttpUrl(trimmedUrl)) {
          siteDialogError.textContent = "Invalid URL. Please enter a full URL starting with https://";
          siteUrlInput.focus();
          return;
        }

        if (!label) {
          siteDialogError.textContent = "Label is required.";
          siteLabelInput.focus();
          return;
        }

        await insertDefiLink(trimmedUrl, label, null);

        closeSiteDialog();
        await openDefiMenu();
      } catch (err) {
        console.error("Failed to save item", err);
        siteDialogError.textContent = "Failed to save: " + (err?.message || err);
      } finally {
        siteDialogSaveBtn.disabled = false;
        siteDialogCancelBtn.disabled = false;
      }
    });

    // --- Outside/escape handlers ---
    document.addEventListener("click", (e) => {
      if (defiMenu.classList.contains("visible") && !e.target.closest("#defiContainer")) {
        closeDefiMenu();
      }
      if (defiContextMenu.classList.contains("visible") && !e.target.closest("#defiContextMenu")) {
        hideAddContextMenu();
      }
      if (defiItemContextMenu.classList.contains("visible") && !e.target.closest("#defiItemContextMenu")) {
        hideItemContextMenu();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (!siteDialogBackdrop.classList.contains("hidden")) {
        if (e.key === "Escape") {
          closeSiteDialog();
          return;
        }

        if (e.key === "Enter") {
          if (document.activeElement === siteUrlInput || document.activeElement === siteLabelInput) {
            e.preventDefault();
            siteDialogSaveBtn.click();
            return;
          }
        }
      }

      if (e.key === "Escape") {
        closeDefiMenu();
        hideAllDefiContextMenus();
      }
    });

    window.addEventListener("scroll", () => {
      hideAllDefiContextMenus();
      repositionDefiMenuIfOpen();
    }, true);

    window.addEventListener("resize", () => {
      hideAllDefiContextMenus();
      repositionDefiMenuIfOpen();
    });

    // initial render (cache warm)
    renderDefiMenu();
  })();
}

// ================== Strategy MENU ==================
(function initStrategyMenu() {
  const strategyContainer = document.getElementById("strategyContainer");
  const strategyButton = document.getElementById("strategyButton");
  const strategyMenu = document.getElementById("strategyMenu");
  const strategyItemContextMenu = document.getElementById("strategyItemContextMenu");
  const strategyDeleteFileBtn = document.getElementById("strategyDeleteFileBtn");

  if (!strategyContainer || !strategyButton || !strategyMenu || !strategyItemContextMenu || !strategyDeleteFileBtn) return;

  let pendingDeleteId = null;
  let strategyFilesCache = [];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fileKindFromNameAndType(name, mime) {
    const lower = String(name || "").toLowerCase().trim();
    const type = String(mime || "").toLowerCase().trim();

    if (lower.endsWith(".svg") || type === "image/svg+xml") return "svg";
    if (lower.endsWith(".txt") || type === "text/plain") return "txt";
    return null;
  }

  async function parseStrategyApiJson(res) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ta_strategy_file_function: ${text.slice(0, 200)}`);
    }
  }

  async function fetchStrategyFiles() {
    const res = await fetch(STRATEGY_FILES_API_URL, {
      method: "GET",
      cache: "no-store"
    });

    const json = await parseStrategyApiJson(res);

    if (!res.ok) {
      throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
    }

    const files =
      Array.isArray(json) ? json :
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.rows) ? json.rows :
      [];

    strategyFilesCache = files;
    return files;
  }

  async function insertStrategyFile({ name, kind, content }) {
    const res = await fetch(STRATEGY_FILES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, kind, content })
    });

    const json = await parseStrategyApiJson(res);

    if (!res.ok) {
      throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
    }

    return json;
  }

  async function deleteStrategyFile(fileId) {
    const res = await fetch(STRATEGY_FILES_API_URL, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id: fileId })
    });

    const json = await parseStrategyApiJson(res);

    if (!res.ok) {
      throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
    }

    return json;
  }

  async function renderStrategyMenu() {
    const files = await fetchStrategyFiles();
    strategyMenu.innerHTML = "";

    if (files.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "9px 10px";
      empty.style.color = "rgba(245,245,245,0.70)";
      empty.style.fontSize = "13px";
      empty.textContent = "No SVG/TXT files yet";
      strategyMenu.appendChild(empty);
      return;
    }

    for (const f of files) {
      const a = document.createElement("a");
      a.className = "my-assets-item";
      a.href = "#";
      a.textContent = f.name;
      a.dataset.fileId = String(f.id);
      strategyMenu.appendChild(a);
    }
  }

  function closeStrategyMenu() {
    strategyMenu.classList.remove("visible");
    strategyMenu.style.left = "";
    strategyMenu.style.top = "";
    strategyButton.setAttribute("aria-expanded", "false");
  }

  function repositionStrategyMenuIfOpen() {
    if (!strategyMenu.classList.contains("visible")) return;

    const r = strategyButton.getBoundingClientRect();
    const menuW = strategyMenu.offsetWidth || 190;

    let left = r.left + (r.width / 2) - (menuW / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    const top = r.bottom + 10;

    strategyMenu.style.left = `${Math.round(left)}px`;
    strategyMenu.style.top  = `${Math.round(top)}px`;
  }

  async function openStrategyMenu() {
    try {
      await renderStrategyMenu();
    } catch (e) {
      console.error("Failed to render Strategy menu", e);
      strategyMenu.innerHTML = "";
      const err = document.createElement("div");
      err.style.padding = "9px 10px";
      err.style.color = "#ff97aa";
      err.style.fontSize = "13px";
      err.textContent = "Failed to load files";
      strategyMenu.appendChild(err);
    }

    strategyMenu.classList.add("visible");
    strategyButton.setAttribute("aria-expanded", "true");
    repositionStrategyMenuIfOpen();
  }

  function toggleStrategyMenu() {
    if (strategyMenu.classList.contains("visible")) closeStrategyMenu();
    else openStrategyMenu();
  }

  function hideStrategyItemContextMenu() {
    strategyItemContextMenu.classList.remove("visible");
    strategyItemContextMenu.style.left = "-9999px";
    strategyItemContextMenu.style.top = "-9999px";
    pendingDeleteId = null;
  }

  function showStrategyItemContextMenu(x, y, fileId) {
    pendingDeleteId = fileId;
    strategyItemContextMenu.style.left = `${x}px`;
    strategyItemContextMenu.style.top = `${y}px`;
    strategyItemContextMenu.classList.add("visible");
  }

  function pickAndUploadFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,.txt,image/svg+xml,text/plain";
    input.style.display = "none";

    input.addEventListener("change", async () => {
      try {
        const file = input.files && input.files[0];
        if (!file) return;

        const kind = fileKindFromNameAndType(file.name, file.type);
        if (!kind) {
          alert("Please select an SVG (*.svg) or TXT (*.txt) file.");
          return;
        }

        const content = await file.text();

        if (kind === "svg" && !/<svg[\s>]/i.test(content)) {
          alert("Selected SVG file does not look valid.");
          return;
        }

        await insertStrategyFile({
          name: file.name,
          kind,
          content
        });

        await openStrategyMenu();
      } catch (e) {
        console.error("Failed to upload file", e);
        alert("Failed to upload file: " + (e?.message || e));
      } finally {
        input.remove();
      }
    });

    document.body.appendChild(input);
    input.click();
  }

  function openStoredFileById(fileId) {
    const f = strategyFilesCache.find(x => String(x.id) === String(fileId));
    if (!f) return;

    let html = "";

    if (f.kind === "svg") {
      html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(f.name)}</title>
</head>
<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;">
${f.content}
</body>
</html>`;
    } else {
      html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(f.name)}</title>
</head>
<body style="margin:0;background:#0b1020;color:#e9eeff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
<pre style="margin:0;padding:20px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(f.content)}</pre>
</body>
</html>`;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  strategyButton.addEventListener("click", (e) => {
    e.stopPropagation();

    if (typeof closeMyAssetsMenu === "function") closeMyAssetsMenu();
    if (walletMenu) walletMenu.classList.remove("visible");

    const defiMenu = document.getElementById("defiMenu");
    if (defiMenu) defiMenu.classList.remove("visible");

    const defiContextMenu = document.getElementById("defiContextMenu");
    if (defiContextMenu) {
      defiContextMenu.classList.remove("visible");
      defiContextMenu.style.left = "-9999px";
      defiContextMenu.style.top = "-9999px";
    }

    const defiItemContextMenu = document.getElementById("defiItemContextMenu");
    if (defiItemContextMenu) {
      defiItemContextMenu.classList.remove("visible");
      defiItemContextMenu.style.left = "-9999px";
      defiItemContextMenu.style.top = "-9999px";
    }

    hideStrategyItemContextMenu();
    toggleStrategyMenu();
  });

  strategyButton.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    closeStrategyMenu();
    hideStrategyItemContextMenu();

    pickAndUploadFile();
    return false;
  }, true);

  strategyMenu.addEventListener("click", (e) => {
    const item = e.target?.closest?.("#strategyMenu a[data-file-id]");
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();

    openStoredFileById(item.dataset.fileId);
    setTimeout(closeStrategyMenu, 0);
  }, true);

  strategyMenu.addEventListener("contextmenu", (e) => {
    const item = e.target?.closest?.("#strategyMenu a[data-file-id]");
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    showStrategyItemContextMenu(e.clientX, e.clientY, item.dataset.fileId);
    return false;
  }, true);

  strategyDeleteFileBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!pendingDeleteId) {
      hideStrategyItemContextMenu();
      return;
    }

    try {
      await deleteStrategyFile(pendingDeleteId);
      hideStrategyItemContextMenu();
      await openStrategyMenu();
    } catch (e2) {
      console.error("Failed to delete file", e2);
      alert("Failed to delete file: " + (e2?.message || e2));
    }
  });

  document.addEventListener("click", (e) => {
    if (strategyMenu.classList.contains("visible") && !e.target.closest("#strategyContainer")) {
      closeStrategyMenu();
    }
    if (strategyItemContextMenu.classList.contains("visible") && !e.target.closest("#strategyItemContextMenu")) {
      hideStrategyItemContextMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeStrategyMenu();
      hideStrategyItemContextMenu();
    }
  });

  window.addEventListener("scroll", () => {
    hideStrategyItemContextMenu();
    repositionStrategyMenuIfOpen();
  }, true);

  window.addEventListener("resize", () => {
    hideStrategyItemContextMenu();
    repositionStrategyMenuIfOpen();
  });

  renderStrategyMenu().catch((e) => {
    console.error("Initial Strategy render failed", e);
  });
})();

// ================== Hold/Sell ==================

function computePeakSignals({ fg, puell, btc24h, eth24h }) {
  return [
    { name: "FearGreed >= 80", on: Number.isFinite(fg) && fg >= 80 },
    { name: "Puell >= 2.0", on: Number.isFinite(puell) && puell >= 2.0 },
    { name: "BTC 24h >= +8%", on: Number.isFinite(btc24h) && btc24h >= 8 },
    { name: "ETH 24h >= +10%", on: Number.isFinite(eth24h) && eth24h >= 10 },
  ];
}

function updateHoldSellPanel() {
  const holdEl   = document.getElementById("hsHoldPct");
  const sellEl   = document.getElementById("hsSellPct");
  const markerEl = document.getElementById("hsMarker");
  if (!holdEl || !sellEl || !markerEl) return;

  const anyKnown =
    Number.isFinite(latestFgValue) ||
    Number.isFinite(latestPuell) ||
    Number.isFinite(latestBtc24h) ||
    Number.isFinite(latestEth24h);

  if (!anyKnown) {
    holdEl.textContent = "–";
    sellEl.textContent = "–";
    markerEl.style.left = "50%";
    return;
  }

  const signals = computePeakSignals({
    fg: latestFgValue,
    puell: latestPuell,
    btc24h: latestBtc24h,
    eth24h: latestEth24h,
  });

  const total = signals.length || 1;
  const onCount = signals.filter(s => s.on).length;

  const sellPct = Math.round((onCount / total) * 100);
  const holdPct = 100 - sellPct;

  holdEl.textContent = `${holdPct}%`;
  sellEl.textContent = `${sellPct}%`;
  markerEl.style.left = `${sellPct}%`;
}

// ================== PUELL ==================

function normalizePuellPayload(json) {
  const candidates = [
    json?.puell,
    json?.value,
    json?.puellMultiple,
    json?.puell_multiple,
    json?.data?.puell,
    json?.data?.value,
    json?.data?.puellMultiple,
    json?.data?.puell_multiple,
  ];

  let puell = null;
  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num)) {
      puell = num;
      break;
    }
  }

  let status =
    json?.status ??
    json?.label ??
    json?.state ??
    json?.data?.status ??
    json?.data?.label ??
    null;

  if (status != null) status = String(status);

  let statusColor =
    json?.statusColor ??
    json?.color ??
    json?.status_color ??
    json?.data?.statusColor ??
    json?.data?.color ??
    json?.data?.status_color ??
    null;

  if (statusColor != null) statusColor = String(statusColor).toLowerCase();

  let markerPct = [
    json?.markerPct,
    json?.marker,
    json?.markerPercent,
    json?.data?.markerPct,
    json?.data?.marker,
    json?.data?.markerPercent,
  ]
    .map(Number)
    .find(Number.isFinite);

  if (!Number.isFinite(markerPct) && Number.isFinite(puell)) {
    markerPct = Math.max(0, Math.min(100, (puell / 4) * 100));
  }

  return {
    puell,
    status,
    statusColor,
    markerPct,
    source: json?.source ?? json?.data?.source ?? null,
    updatedAt: json?.updatedAt ?? json?.data?.updatedAt ?? null,
  };
}

async function fetchJsonStrict(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
  }

  return json;
}

async function fetchPuellWithFallback() {
  try {
    return await fetchJsonStrict(PUELL_PROXY_URL);
  } catch (cachedErr) {
    console.warn("Cached Puell fetch failed, trying refresh=1", cachedErr);
    return await fetchJsonStrict(`${PUELL_PROXY_URL}?refresh=1`);
  }
}

async function loadPuell() {
  const statusEl = document.getElementById("puellStatus");
  const valueEl  = document.getElementById("puellValue");
  const markerEl = document.getElementById("puellMarker");

  const previousPuell = latestPuell;
  const previousValueText = valueEl ? valueEl.textContent : "";
  const previousStatusText = statusEl ? statusEl.textContent : "";
  const previousMarkerLeft = markerEl ? markerEl.style.left : "";
  const previousStatusClasses = statusEl
    ? ["is-green", "is-yellow", "is-orange", "is-red"].filter(cls => statusEl.classList.contains(cls))
    : [];

  try {
    const json = await fetchPuellWithFallback();
    const result = normalizePuellPayload(json);

    if (!Number.isFinite(result.puell)) {
      throw new Error("Proxy JSON does not contain a numeric puell value");
    }

    const puell = Number(result.puell);
    latestPuell = puell;

    if (valueEl) valueEl.textContent = puell.toFixed(2);

    if (statusEl) {
      statusEl.textContent = result.status || "Available";
      statusEl.classList.remove("is-green", "is-yellow", "is-orange", "is-red");
      if (result.statusColor && ["green", "yellow", "orange", "red"].includes(result.statusColor)) {
        statusEl.classList.add(`is-${result.statusColor}`);
      }
    }

    if (markerEl && Number.isFinite(result.markerPct)) {
      markerEl.style.left = `${Math.max(0, Math.min(100, result.markerPct))}%`;
    }

    updateHoldSellPanel();
  } catch (e) {
    console.error("Failed to load Puell", e);

    if (Number.isFinite(previousPuell)) {
      latestPuell = previousPuell;

      if (valueEl) valueEl.textContent = previousValueText || previousPuell.toFixed(2);

      if (statusEl) {
        statusEl.textContent = previousStatusText || "Temporary issue";
        statusEl.classList.remove("is-green", "is-yellow", "is-orange", "is-red");
        previousStatusClasses.forEach(cls => statusEl.classList.add(cls));
      }

      if (markerEl && previousMarkerLeft) {
        markerEl.style.left = previousMarkerLeft;
      }
    } else {
      latestPuell = null;

      if (statusEl) {
        statusEl.textContent = "Unavailable";
        statusEl.classList.remove("is-green", "is-yellow", "is-orange", "is-red");
      }

      if (valueEl) valueEl.textContent = "–";
      if (markerEl) markerEl.style.left = "50%";
    }

    updateHoldSellPanel();
  }
}

// ================== LOAD TA DATA ==================

const loadTaDataBtn = document.getElementById("loadTaDataBtn");
const loadTaDataStatus = document.getElementById("loadTaDataStatus");

let loadStatusTimer = null;

function setLoadStatus(text, mode = "") {
  if (!loadTaDataStatus) return;
  loadTaDataStatus.textContent = text;
  loadTaDataStatus.classList.remove("ok", "err");
  if (mode) loadTaDataStatus.classList.add(mode);
}

function clearLoadStatusTimer() {
  if (loadStatusTimer) {
    clearTimeout(loadStatusTimer);
    loadStatusTimer = null;
  }
}

async function triggerQuickProcessor() {
  if (!loadTaDataBtn) return;

  try {
    clearLoadStatusTimer();
    loadTaDataBtn.disabled = true;
    setLoadStatus("Loading");

    const res = await fetch(QUICK_PROCESSOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    setLoadStatus("Saved ✔", "ok");

    loadStatusTimer = setTimeout(() => {
      setLoadStatus("");
    }, 5000);

    await loadTaDataGraph();
  } catch (e) {
    setLoadStatus(`Error: ${e?.message || e}`, "err");
  } finally {
    loadTaDataBtn.disabled = false;
  }
}

if (loadTaDataBtn) {
  loadTaDataBtn.onclick = triggerQuickProcessor;
}

// ================== TA DATA GRAPH ==================

const taChartCanvas = document.getElementById("taDataChart");
const taChartStatus = document.getElementById("taChartStatus");
const reloadTaChartBtn = document.getElementById("reloadTaChartBtn");
const taChartTooltip = document.getElementById("taChartTooltip");

let taChartHoverPoints = [];

function setTaChartStatus(text) {
  if (!taChartStatus) return;
  taChartStatus.textContent = text;
}

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
  const labelIndexes = new Set();

  for (let i = 0; i < points.length; i += labelStep) {
    labelIndexes.add(i);
  }

  labelIndexes.add(points.length - 1);

  for (const i of Array.from(labelIndexes).sort((a, b) => a - b)) {
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
      .filter((row) => row?.created_at_minsk)
      .sort((a, b) => {
        const aTime = new Date(a.created_at_minsk).getTime();
        const bTime = new Date(b.created_at_minsk).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return Number(a?.id) - Number(b?.id);
      });

    const latestRow = filteredRows.length ? filteredRows[filteredRows.length - 1] : null;

    if (latestRow) {
      setTaChartStatus(`Latest date: ${formatTaDateLabel(latestRow.created_at_minsk)}`);
    } else {
      setTaChartStatus("");
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
