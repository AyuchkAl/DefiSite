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
const DATA_PROVIDER_ADDRESS = "0x243Aa95cAC2a25651eda86e80bEe66114413c43b"; // lower-case form
const ORACLE_ADDRESS        = "0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7";

// WETH underlying on Arbitrum
const WETH_ADDRESS = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; // 18 decimals
const WBTC_ADDRESS = "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f";  // 8 decimals

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

// Fear & Greed
const fgValueEl = document.getElementById("fgValue");
const fgLabelEl = document.getElementById("fgLabel");
const fgNeedleEl = document.getElementById("fgNeedle");

// Puell proxy
const PUELL_PROXY_URL = "https://falling-night-97fc.alexknikola.workers.dev/puell";

// Morpho HF proxy
const MORPHO_HF_PROXY_URL = "https://spring-moon-4095.alexknikola.workers.dev/morpho-hf";

// Morpho DOM
const morphoHfValueEl = document.getElementById("morphoHfValue");
const morphoHfMainRowEl = document.querySelector(".morpho-hf-main-row");

let currentAddress = null;

// ================== Hold/Sell (CoinGlass-like peak signals) state ==================
let latestFgValue = null;    // 0..100
let latestBtc24h  = null;    // percent (e.g. -1.25)
let latestEth24h  = null;    // percent
let latestPuell   = null;    // number

// ================== HELPERS ========================================

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
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
  liqEthBottomEl.textContent = "–";
  liqBtcBottomEl.textContent = "–";
  if (morphoHfValueEl) morphoHfValueEl.textContent = "–";
  connectLabel.textContent = "Connect wallet";
  resultDiv.classList.add("hidden");
  walletMenu.classList.remove("visible");
  statusDiv.textContent = "";
  localStorage.removeItem("savedAddress");

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
  if (!morphoHfValueEl) return;

  if (!Number.isFinite(hf)) {
    morphoHfValueEl.textContent = "–";
    if (morphoHfMainRowEl) {
      morphoHfMainRowEl.classList.remove("safe", "warning", "danger");
    }
    return;
  }

  morphoHfValueEl.textContent = hf.toFixed(2);

  if (morphoHfMainRowEl) {
    morphoHfMainRowEl.classList.remove("safe", "warning", "danger");

    if (hf < 1.0) morphoHfMainRowEl.classList.add("danger");
    else if (hf < 1.5) morphoHfMainRowEl.classList.add("warning");
    else morphoHfMainRowEl.classList.add("safe");
  }
}

// ================== FEAR & GREED (CoinMarketCap via Cloudflare Worker) ==================

const CMC_FNG_PROXY_URL = "https://cmc-fng-proxy.alexknikola.workers.dev/fng";

async function loadFearGreed() {
  try {
    const res = await fetch(CMC_FNG_PROXY_URL, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const value = Number(json.value); // 0..100
    latestFgValue = Number.isFinite(value) ? value : null;

    const label = String(json.label || "").toLowerCase();

    if (fgValueEl) fgValueEl.textContent = Number.isFinite(value) ? String(value) : "–";
    if (fgLabelEl) fgLabelEl.textContent = label ? label : "–";

    // Needle: map 0..100 => -90..+90 degrees
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

// ================== MARKET PRICES (COINGECKO) ======================

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

    updateHoldSellPanel();
  } catch (e) {
    console.error("Failed to load BTC/ETH prices", e);
    latestBtc24h = null;
    latestEth24h = null;
    updateHoldSellPanel();
  }
}

// ================== AAVE LOGIC (HF + LIQ PRICE ETH) ===============

async function loadAaveDataForUser(userAddress, provider) {
  try {
    const pool   = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
    const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);

    // Global account data (base ≈ USD, 8 decimals)
    const ud = await pool.getUserAccountData(userAddress);
    const totalCollateralBase = Number(ethers.formatUnits(ud.totalCollateralBase, 8)); // USD
    const totalDebtBase       = Number(ethers.formatUnits(ud.totalDebtBase, 8));       // USD
    const hlThreshold         = Number(ud.currentLiquidationThreshold) / 10000;        // 0..1
    const healthFactor        = Number(ethers.formatUnits(ud.healthFactor, 18));

    setHealthFactorDisplay(healthFactor);

    // If no debt, no liquidation price
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

    // Get current ETH/BTC prices from the Aave oracle (8 decimals)
    const [ethPriceRaw, btcPriceRaw] = await Promise.all([
      oracle.getAssetPrice(WETH_ADDRESS),
      oracle.getAssetPrice(WBTC_ADDRESS),
    ]);

    const ethNow = Number(ethers.formatUnits(ethPriceRaw, 8)); // USD
    const btcNow = Number(ethers.formatUnits(btcPriceRaw, 8)); // USD

    // At HF=1 the whole market is scaled by dropFactor
    const ethAtHF1 = ethNow * dropFactor;
    const btcAtHF1 = btcNow * dropFactor;

    liqEthBottomEl.textContent = "ETH ~ " + ethAtHF1.toFixed(0).toLocaleString("en-US");
    liqBtcBottomEl.textContent = "BTC ~ " + btcAtHF1.toFixed(0).toLocaleString("en-US");
  } catch (e) {
    console.error("Failed to load Aave / liq price", e);
    liqEthBottomEl.textContent = "ETH ~ –";
    liqBtcBottomEl.textContent = "BTC ~ –";
  }
}

// ================== MORPHO LOGIC (HF via Cloudflare Worker) =======

async function loadMorphoHealthFactor(userAddress) {
  try {
    if (!MORPHO_HF_PROXY_URL) {
      setMorphoHealthFactorDisplay(NaN);
      return;
    }

    const res = await fetch(
      `${MORPHO_HF_PROXY_URL}?address=${encodeURIComponent(userAddress)}`,
      { cache: "no-store" }
    );
    const json = await res.json();

    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const hf = Number(json?.healthFactor);
    if (!Number.isFinite(hf)) {
      setMorphoHealthFactorDisplay(NaN);
      return;
    }

    setMorphoHealthFactorDisplay(hf);
  } catch (e) {
    console.error("Failed to load Morpho health factor", e);
    setMorphoHealthFactorDisplay(NaN);
  }
}

// ================== WALLET CONNECTION / INIT ======================

async function connectAndLoad() {
  try {
    if (!window.ethereum) {
      statusDiv.textContent = "No browser wallet detected (MetaMask / Rabby).";
      return;
    }

    // If already connected, just toggle menu
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

// ================== TOTAL ASSETS (Google Sheet cell T2) ==================

const TOTAL_ASSETS_SPREADSHEET_ID = "1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM";
const totalAssetsValueCardEl = document.getElementById("totalAssetsValueCard");
const TOTAL_ASSETS_GID = "0";

const TOTAL_ASSETS_CELL_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${TOTAL_ASSETS_SPREADSHEET_ID}/export?format=csv&gid=${TOTAL_ASSETS_GID}&range=T2`;

function formatUsd(amount) {
  return (
    "$" +
    Math.round(Number(amount)).toLocaleString("de-DE", {
      maximumFractionDigits: 0,
      useGrouping: true,
    })
  );
}

async function loadTotalAssets() {
  try {
    if (!totalAssetsValueCardEl) return;

    const res = await fetch(TOTAL_ASSETS_CELL_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let text = (await res.text()).trim();
    text = text.replace(/^"+|"+$/g, "");
    text = text.replace(/\s/g, "");
    text = text.replace(/,/g, "");

    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error("Not a number: " + text);

    totalAssetsValueCardEl.textContent = formatUsd(value);
  } catch (err) {
    console.error("Failed to load Total Assets", err);
    if (totalAssetsValueCardEl) totalAssetsValueCardEl.textContent = "Unavailable";
  }
}

setInterval(loadTotalAssets, 10 * 60 * 1000);

// ================== DEFI ASSETS (Google Sheet DEFI_invest!W2) ==================

const defiAssetsValueCardEl = document.getElementById("defiAssetsValueCard");

const DEFI_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=W2" +
  "&tqx=out:json";

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

// ================== AVG BTC / AVG ETH (Google Sheet DEFI_invest!S2 / L2) ==================

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

function formatUsd0(num) {
  return "$" + Math.round(Number(num)).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

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

// ================== PnL ASSETS (Google Sheet DEFI_invest!X2) ==================

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

// ================== PERCENTAGE ASSETS (Google Sheet DEFI_invest!Y2) ==================

const pctAssetsValueCardEl = document.getElementById("pctAssetsValueCard");

const PCT_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=Y2" +
  "&tqx=out:json";

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

// ================== MY ASSETS MENU (fixed-position dropdown + close on link click) ==================
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

    // close wallet menu if open
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

  // ✅ Close My Assets menu when a link is activated BUT DO NOT block navigation
  // The previous pointerdown handler could cancel the default click in some browsers.
  function closeMyAssetsOnLinkClick(e) {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    // close after click so default navigation isn't affected
    setTimeout(closeMyAssetsMenu, 0);
  }
  myAssetsMenu.addEventListener("click", closeMyAssetsOnLinkClick, true);
}

// ================== DeFi MENU (fixed-position dropdown + close on link click) ==================
(function initDefiMenu() {
  const defiContainer = document.getElementById("defiContainer");
  const defiButton = document.getElementById("defiButton");
  const defiMenu = document.getElementById("defiMenu");
  const defiContextMenu = document.getElementById("defiContextMenu");
  const defiAddSiteBtn = document.getElementById("defiAddSiteBtn");

  const defiItemContextMenu = document.getElementById("defiItemContextMenu");
  const defiDeleteSiteBtn = document.getElementById("defiDeleteSiteBtn");

  if (
    !defiContainer ||
    !defiButton ||
    !defiMenu ||
    !defiContextMenu ||
    !defiAddSiteBtn ||
    !defiItemContextMenu ||
    !defiDeleteSiteBtn
  ) return;

  const DEFI_LINKS_KEY = "defiLinks_v1";
  let pendingDeleteUrl = null;

  function loadDefiLinks() {
    try {
      const raw = localStorage.getItem(DEFI_LINKS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(x => x && typeof x.url === "string") : [];
    } catch {
      return [];
    }
  }

  function saveDefiLinks(links) {
    localStorage.setItem(DEFI_LINKS_KEY, JSON.stringify(links));
  }

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

  function renderDefiMenu() {
    const links = loadDefiLinks();
    defiMenu.innerHTML = "";

    if (links.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "9px 10px";
      empty.style.color = "rgba(245,245,245,0.70)";
      empty.style.fontSize = "13px";
      empty.textContent = "No sites yet";
      defiMenu.appendChild(empty);
      return;
    }

    for (const link of links) {
      const a = document.createElement("a");
      a.className = "my-assets-item";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.href = link.url;
      a.textContent = link.label || makeEdgeLikeLabel(link.url);
      a.dataset.url = link.url;
      defiMenu.appendChild(a);
    }
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
    defiMenu.style.top  = `${Math.round(top)}px`;
  }

  function openDefiMenu() {
    renderDefiMenu();
    defiMenu.classList.add("visible");
    defiButton.setAttribute("aria-expanded", "true");
    repositionDefiMenuIfOpen();
  }

  function toggleDefiMenu() {
    if (defiMenu.classList.contains("visible")) closeDefiMenu();
    else openDefiMenu();
  }

  function hideAddContextMenu() {
    defiContextMenu.classList.remove("visible");
    defiContextMenu.style.left = "-9999px";
    defiContextMenu.style.top = "-9999px";
  }

  function showAddContextMenu(x, y) {
    defiContextMenu.style.left = `${x}px`;
    defiContextMenu.style.top = `${y}px`;
    defiContextMenu.classList.add("visible");
  }

  function hideDeleteContextMenu() {
    defiItemContextMenu.classList.remove("visible");
    defiItemContextMenu.style.left = "-9999px";
    defiItemContextMenu.style.top = "-9999px";
    pendingDeleteUrl = null;
  }

  function showDeleteContextMenu(x, y, urlToDelete) {
    pendingDeleteUrl = urlToDelete;
    defiItemContextMenu.style.left = `${x}px`;
    defiItemContextMenu.style.top = `${y}px`;
    defiItemContextMenu.classList.add("visible");
  }

  function hideAllDefiContextMenus() {
    hideAddContextMenu();
    hideDeleteContextMenu();
  }

  // LEFT CLICK => open dropdown
  defiButton.addEventListener("click", (e) => {
    e.stopPropagation();
    hideAllDefiContextMenus();

    if (typeof closeMyAssetsMenu === "function") closeMyAssetsMenu();
    if (walletMenu) walletMenu.classList.remove("visible");

    toggleDefiMenu();
  });

  // ✅ Close DeFi dropdown on link click AFTER default navigation
  function closeDefiOnLinkClick(e) {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    setTimeout(closeDefiMenu, 0);
  }
  defiMenu.addEventListener("click", closeDefiOnLinkClick, true);

  // RIGHT CLICK on DeFi button => Add site context menu
  function onDefiContextMenu(e) {
    const item = e.target?.closest?.("#defiMenu a[data-url]");
    if (item) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    closeDefiMenu();
    hideDeleteContextMenu();

    if (typeof closeMyAssetsMenu === "function") closeMyAssetsMenu();
    if (walletMenu) walletMenu.classList.remove("visible");

    showAddContextMenu(e.clientX, e.clientY);
    return false;
  }

  defiButton.addEventListener("contextmenu", onDefiContextMenu, true);

  // RIGHT CLICK on DeFi menu item => Delete site context menu
  function onDefiItemContextMenu(e) {
    const item = e.target?.closest?.("#defiMenu a[data-url]");
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    hideAddContextMenu();
    showDeleteContextMenu(e.clientX, e.clientY, item.dataset.url);
    return false;
  }

  defiMenu.addEventListener("contextmenu", onDefiItemContextMenu, true);

  defiAddSiteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideAddContextMenu();

    const url = prompt("Enter site URL (https://...):");
    if (!url) return;

    const trimmedUrl = url.trim();
    if (!isValidHttpUrl(trimmedUrl)) {
      alert("Invalid URL. Please enter a full URL starting with https://");
      return;
    }

    const label = (prompt("Enter label:") || "").trim();
    if (!label) return;

    const links = loadDefiLinks();
    links.push({ url: trimmedUrl, label });
    saveDefiLinks(links);

    openDefiMenu();
  });

  defiDeleteSiteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!pendingDeleteUrl) {
      hideDeleteContextMenu();
      return;
    }

    const links = loadDefiLinks();
    const next = links.filter((l) => l.url !== pendingDeleteUrl);
    saveDefiLinks(next);

    hideDeleteContextMenu();
    openDefiMenu();
  });

  document.addEventListener("click", (e) => {
    if (defiMenu.classList.contains("visible") && !e.target.closest("#defiContainer")) {
      closeDefiMenu();
    }
    if (defiContextMenu.classList.contains("visible") && !e.target.closest("#defiContextMenu")) {
      hideAddContextMenu();
    }
    if (defiItemContextMenu.classList.contains("visible") && !e.target.closest("#defiItemContextMenu")) {
      hideDeleteContextMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
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

  renderDefiMenu();
})();

// ================== Hold/Sell (CoinGlass-like peak signals) ==================

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

// ================== PUELL MULTIPLE ==================

async function loadPuell() {
  const statusEl = document.getElementById("puellStatus");
  const valueEl  = document.getElementById("puellValue");
  const markerEl = document.getElementById("puellMarker");

  try {
    const res = await fetch(PUELL_PROXY_URL, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const puell = Number(json.puell);
    latestPuell = Number.isFinite(puell) ? puell : null;

    if (valueEl) valueEl.textContent = Number.isFinite(puell) ? puell.toFixed(2) : "–";

    if (statusEl) {
      statusEl.textContent = json.status || "–";
      statusEl.classList.remove("is-green", "is-yellow", "is-orange", "is-red");
      if (json.statusColor) statusEl.classList.add(`is-${json.statusColor}`);
    }

    if (markerEl && Number.isFinite(json.markerPct)) {
      markerEl.style.left = `${Math.max(0, Math.min(100, json.markerPct))}%`;
    }

    updateHoldSellPanel();
  } catch (e) {
    console.error("Failed to load Puell", e);
    latestPuell = null;
    if (statusEl) statusEl.textContent = "Unavailable";
    if (valueEl) valueEl.textContent = "–";
    updateHoldSellPanel();
  }
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
