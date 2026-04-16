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

// Fear & Greed (new)
const fgValueEl = document.getElementById("fgValue");
const fgLabelEl = document.getElementById("fgLabel");
const fgNeedleEl = document.getElementById("fgNeedle");
const PUELL_PROXY_URL = "https://falling-night-97fc.alexknikola.workers.dev/puell";

let currentAddress = null;
// ================== Hold/Sell composite state ==================
let latestFgValue = null;  // 0..100
let latestBtc24h  = null;  // percent (e.g. -1.25)
let latestEth24h  = null;  // percent

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
  hfValueEl.classList.remove("hf-safe", "hf-warning", "hf-danger");
  connectLabel.textContent = "Connect wallet";
  resultDiv.classList.add("hidden");
  walletMenu.classList.remove("visible");
  statusDiv.textContent = "";
  localStorage.removeItem("savedAddress");
}

function setHealthFactorDisplay(hf) {
  hfValueEl.textContent = hf.toFixed(2);

  hfMainRowEl.classList.remove("safe", "warning", "danger");

  if (hf < 1.0) {
    hfMainRowEl.classList.add("danger");
  } else if (hf < 1.5) {
    hfMainRowEl.classList.add("warning");
  } else {
    hfMainRowEl.classList.add("safe");
  }
}

// ================== FEAR & GREED (new) =============================

// ================== FEAR & GREED (CoinMarketCap via Cloudflare Worker) ==================

const CMC_FNG_PROXY_URL = "https://cmc-fng-proxy.alexknikola.workers.dev/fng";

async function loadFearGreed() {
  try {
    const res = await fetch(CMC_FNG_PROXY_URL, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const value = Number(json.value); // 0..100
    latestFgValue = Number.isFinite(value) ? value : null;
updateHoldSellPanel();
    const label = String(json.label || "").toLowerCase();

    if (fgValueEl) fgValueEl.textContent = Number.isFinite(value) ? String(value) : "–";
    if (fgLabelEl) fgLabelEl.textContent = label ? label : "–";

    // Needle: map 0..100 => -90..+90 degrees
    if (fgNeedleEl && Number.isFinite(value)) {
      const deg = -90 + (value / 100) * 180;
      fgNeedleEl.setAttribute("transform", `rotate(${deg} 110 110)`);
    }
  } catch (e) {
    console.error("Failed to load Fear & Greed (CMC proxy)", e);
    if (fgValueEl) fgValueEl.textContent = "–";
    if (fgLabelEl) fgLabelEl.textContent = "Unavailable";
  }
}

// liquidationThreshold from config struct (not bitmask)
function getLiquidationThresholdFromConfig(cfg) {
  return Number(cfg.liquidationThreshold) / 10000; // 0..1
}

// Approx ETH liquidation price (USD) assuming only ETH moves
function computeEthLiqPrice({
  totalDebtUsd,
  totalCollateralBaseUsd,
  hlThreshold,
  ethCollateralAmount,
  ethLtv,
  ethPriceNow,
}) {
  if (ethCollateralAmount <= 0 || ethLtv <= 0) return null;

  const totalCollAtLT  = totalCollateralBaseUsd * hlThreshold;
  const ethCollAtLTNow = ethCollateralAmount * ethPriceNow * ethLtv;
  const otherCollAtLT  = Math.max(totalCollAtLT - ethCollAtLTNow, 0);
  const numerator      = totalDebtUsd - otherCollAtLT;
  if (numerator <= 0) return null;

  return numerator / (ethCollateralAmount * ethLtv);
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

updateHoldSellPanel();

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
  } catch (e) {
    console.error("Failed to load BTC/ETH prices", e);
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

// ================== WALLET CONNECTION / INIT ======================

async function connectAndLoad() {
  try {
    console.log("CONNECT CLICK");
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
    console.log("ACCOUNTS", accounts);
    if (!accounts || accounts.length === 0) {
      statusDiv.textContent = "No account returned from wallet.";
      return;
    }

    const userAddress = accounts[0];
    localStorage.setItem("savedAddress", userAddress);

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network  = await provider.getNetwork();
    console.log("NETWORK", network);
    if (Number(network.chainId) !== 42161) {
      statusDiv.textContent = "Please switch wallet to the Arbitrum One network and try again.";
      return;
    }

    statusDiv.textContent = "Reading your Aave account data...";
    await loadAaveDataForUser(userAddress, provider);
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
  if (!e.target.closest(".wallet-container")) {
    walletMenu.classList.remove("visible");
  }
});

// Auto‑restore + initial prices + Fear&Greed
window.addEventListener("load", () => {
  loadCryptoPrices();
  loadFearGreed();
  loadTotalAssets(
    async function loadTotalAssets() {
  try {
    if (!totalAssetsValueEl) return;

    console.log("Loading Total Assets from:", TOTAL_ASSETS_CELL_CSV_URL);

    const res = await fetch(TOTAL_ASSETS_CELL_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let text = (await res.text()).trim();
    console.log("Total Assets raw CSV:", text);

    text = text.replace(/^"+|"+$/g, "");
    text = text.replace(/\s/g, "");
    text = text.replace(/,/g, "");

    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error("Not a number: " + text);

    totalAssetsValueEl.textContent = formatUsd(value);
  } catch (err) {
    console.error("Failed to load Total Assets", err);
    totalAssetsValueEl.textContent = "Unavailable";
  }
}
  );

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
      setConnectedUI(saved);
      statusDiv.textContent = "Loaded from previous connection.";
    } catch (err) {
      console.error(err);
    }
  })();
});

// Refresh BTC / ETH prices every 5 minutes
setInterval(loadCryptoPrices, 5 * 60 * 1000);

// Refresh Fear & Greed every 30 minutes (daily data anyway; this keeps it fresh)
setInterval(loadFearGreed, 30 * 60 * 1000);

// ================== TOTAL ASSETS (Google Sheet cell T2) ==================

// Your original spreadsheet ID (from the older link you shared)
const TOTAL_ASSETS_SPREADSHEET_ID = "1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM";
const totalAssetsValueCardEl = document.getElementById("totalAssetsValueCard");

// From your published link: gid=0
const TOTAL_ASSETS_GID = "0";

// Direct CSV export of just T2
const TOTAL_ASSETS_CELL_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${TOTAL_ASSETS_SPREADSHEET_ID}/export?format=csv&gid=${TOTAL_ASSETS_GID}&range=T2`;

//const totalAssetsValueEl = document.getElementById("totalAssetsValue");

function formatUsd(amount) {
  return (
    "$" +
    Math.round(Number(amount)).toLocaleString("de-DE", {
      maximumFractionDigits: 0,
      useGrouping: true,
    })
  );
}
// ✅ Then update loadTotalAssets() to set BOTH elements safely:

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

// DeFi Assets (Google Sheet: DEFI_invest!W2)
// ================== DEFI ASSETS (Google Sheet DEFI_invest!W2) ==================

const defiAssetsValueCardEl = document.getElementById("defiAssetsValueCard");

const DEFI_SHEET_ID = "1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM";
const DEFI_GID = "553100822"; // DEFI_invest
const DEFI_RANGE = "W2";

// GVIZ returns JS-like response, but with structured data
const DEFI_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  "&range=W2" +
  "&tqx=out:json";

function parseGvizJson(text) {
  // Response looks like: google.visualization.Query.setResponse({...});
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Unexpected GVIZ response");
  return JSON.parse(text.slice(start, end + 1));
}

function parseCurrencyLoose(rawValue) {
  // Accepts: 7900, "7900", "$7.900", "7,900", "7 900", "$7,900.25", "7.900,25"
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;

  let s = String(rawValue ?? "").trim();
  if (!s) return NaN;

  // Remove currency symbols/letters, keep digits and separators
  s = s.replace(/[^\d.,-]/g, "");

  // If both separators exist, decide decimal by last separator position
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Example: "1.234,56" => dot thousands, comma decimal
    // Example: "1,234.56" => comma thousands, dot decimal
    if (lastComma > lastDot) {
      // comma decimal
      s = s.replace(/\./g, "");     // remove thousands dots
      s = s.replace(/,/g, ".");     // decimal comma -> dot
    } else {
      // dot decimal
      s = s.replace(/,/g, "");      // remove thousands commas
      // keep dot as decimal
    }
  } else if (lastDot !== -1) {
    // Only dot present: could be thousands ("7.900") or decimal ("7.90")
    const fracLen = s.length - lastDot - 1;
    if (fracLen === 3) {
      // treat as thousands separator
      s = s.replace(/\./g, "");
    }
    // else treat as decimal dot (leave it)
  } else if (lastComma !== -1) {
    // Only comma present: could be thousands or decimal
    const fracLen = s.length - lastComma - 1;
    if (fracLen === 3) {
      // "7,900" thousands
      s = s.replace(/,/g, "");
    } else {
      // "7,90" decimal
      s = s.replace(/,/g, ".");
    }
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
    const v = cell?.v; // raw value
    const f = cell?.f; // formatted

    // Prefer raw numeric if available, else parse formatted string
    const num = (typeof v === "number" && Number.isFinite(v)) ? v : parseCurrencyLoose(f ?? v);

    if (!Number.isFinite(num)) {
      throw new Error("Not a number. v=" + String(v) + " f=" + String(f));
    }

    defiAssetsValueCardEl.textContent = formatUsd(num);
  } catch (err) {
    console.error("Failed to load DeFi Assets", err);
    defiAssetsValueCardEl.textContent = "Unavailable";
  }
}
window.addEventListener("load", () => {
  loadDefiAssets();
});

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

setInterval(loadDefiAssets, 10 * 60 * 1000);

// ================== PnL ASSETS (Google Sheet DEFI_invest!X2) ==================

const pnlAssetsValueCardEl = document.getElementById("pnlAssetsValueCard");

// Same sheet as DeFi Assets; just a different cell.
const PNL_RANGE = "X2";

const PNL_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  `&range=${encodeURIComponent(PNL_RANGE)}` +
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

    // Prefer raw numeric if present
    let num = (typeof v === "number" && Number.isFinite(v)) ? v : NaN;

    // Fallback: parse formatted string like "-$2.120"
    if (!Number.isFinite(num)) {
      let s = String(f ?? v ?? "").trim();
      s = s.replace(/[^\d.,-]/g, ""); // keep digits/separators/sign

      // Treat "2.120" as thousands when 3 digits after dot
      const lastDot = s.lastIndexOf(".");
      const lastComma = s.lastIndexOf(",");

      if (lastDot !== -1 && lastComma !== -1) {
        if (lastComma > lastDot) {
          s = s.replace(/\./g, "").replace(/,/g, ".");
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

      num = Number(s);
    }

    pnlAssetsValueCardEl.classList.remove("pnl-positive", "pnl-negative");

if (num > 0) pnlAssetsValueCardEl.classList.add("pnl-positive");
if (num < 0) pnlAssetsValueCardEl.classList.add("pnl-negative");

    if (!Number.isFinite(num)) {
      throw new Error("PnL cell is not a number. v=" + String(v) + " f=" + String(f));
    }

    // Show negative with minus sign like "-$2.120"
    // (formatUsd currently rounds and uses de-DE grouping; we keep consistent)
    const formatted = (num < 0 ? "-" : "") + formatUsd(Math.abs(num));
    pnlAssetsValueCardEl.textContent = formatted;
  } catch (err) {
    console.error("Failed to load PnL Assets", err);
    pnlAssetsValueCardEl.textContent = "Unavailable";
  }
}
// Call on load (add inside your existing load handler OR add a new one)
window.addEventListener("load", () => {
  loadPnlAssets();
});

window.addEventListener("load", () => {
  loadAvgBtc();
  loadAvgEth();
});

// Refresh occasionally (optional)
setInterval(loadPnlAssets, 10 * 60 * 1000);
setInterval(loadAvgBtc, 10 * 60 * 1000);
setInterval(loadAvgEth, 10 * 60 * 1000);

// ================== PERCENTAGE ASSETS (Google Sheet DEFI_invest!Y2) ==================

const pctAssetsValueCardEl = document.getElementById("pctAssetsValueCard");

const PCT_RANGE = "Y2";

const PCT_ASSETS_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/gviz/tq" +
  "?sheet=DEFI_invest" +
  `&range=${encodeURIComponent(PCT_RANGE)}` +
  "&tqx=out:json";

function parsePercentLoose(rawValue) {
  // Accepts: -0.2062, -20.62, "-20.62%", "+20,62%", "0.1" etc.
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;

  let s = String(rawValue ?? "").trim();
  if (!s) return NaN;

  // Keep digits, sign, separators, percent
  s = s.replace(/[^\d.,%\-\+]/g, "");

  const hasPercent = s.includes("%");
  s = s.replace(/[^\d.,%\-\+]/g, "");
 s = s.replace(/[^\d.,%\-\+]/g, ""); // Number() handles leading +, but safe

  // Normalize separators (treat comma as decimal when it's the only separator)
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Decide decimal by last separator
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      s = s.replace(/[^\d.,%\-\+]/g, "");
    }
  } else if (lastComma !== -1 && lastDot === -1) {
   s = s.replace(/[^\d.,%\-\+]/g, "");
  }

  let num = Number(s);
  if (!Number.isFinite(num)) return NaN;

  // If sheet returns 0.2062 and formatted as %, convert to 20.62 for display
  // Only do this when it clearly looks like a ratio.
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

    // If the sheet gives a ratio without %, convert to percent for display when it looks like ratio
    if (Number.isFinite(num) && Math.abs(num) <= 1) {
      num = num * 100;
    }

    if (!Number.isFinite(num)) {
      throw new Error("Percentage cell is not a number. v=" + String(v) + " f=" + String(f));
    }

    // Color
    pctAssetsValueCardEl.classList.remove("pct-positive", "pct-negative");
    if (num > 0) pctAssetsValueCardEl.classList.add("pct-positive");
    if (num < 0) pctAssetsValueCardEl.classList.add("pct-negative");

    // Format like +20.62% / -20.62%
    const sign = num < 0 ? "-" : "+";
    const formatted = `${sign}${Math.abs(num).toFixed(2)}%`;

    pctAssetsValueCardEl.textContent = formatted;
  } catch (err) {
    console.error("Failed to load Percentage Assets", err);
    pctAssetsValueCardEl.textContent = "Unavailable";
  }
}
// Call on load + refresh (add alongside your other loaders)
window.addEventListener("load", () => {
  loadPercentageAssets();
});

setInterval(loadPercentageAssets, 10 * 60 * 1000);

// ================== MY ASSETS MENU ==================
const myAssetsButton = document.getElementById("myAssetsButton");
const myAssetsMenu = document.getElementById("myAssetsMenu");

function closeMyAssetsMenu() {
  if (!myAssetsMenu) return;
  myAssetsMenu.classList.remove("visible");
  if (myAssetsButton) myAssetsButton.setAttribute("aria-expanded", "false");
}

if (myAssetsButton && myAssetsMenu) {
  myAssetsButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = myAssetsMenu.classList.toggle("visible");
    myAssetsButton.setAttribute("aria-expanded", String(isOpen));

    // Optional: close wallet menu if open
    walletMenu.classList.remove("visible");
  });

  document.addEventListener("click", (e) => {
    if (!myAssetsMenu.classList.contains("visible")) return;
    if (!e.target.closest(".my-assets-container")) closeMyAssetsMenu();
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMyAssetsMenu();
  });
}

// ================== DeFi MENU (right-click -> Add site / right-click item -> Delete) ==================
(function initDefiMenu() {
  const defiContainer = document.getElementById("defiContainer");
  const defiButton = document.getElementById("defiButton");
  const defiMenu = document.getElementById("defiMenu");
  const defiContextMenu = document.getElementById("defiContextMenu");
  const defiAddSiteBtn = document.getElementById("defiAddSiteBtn");

  // NEW: item delete context menu
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

  // NEW: Edge-like label generator (no manual label prompt)
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

    // defitracker -> DeFi tracker -> DeFi Tracker
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
      a.className = "my-assets-item"; // reuse same styling
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.href = link.url;

      // IMPORTANT: keep the label short like Edge
      a.textContent = link.label || makeEdgeLikeLabel(link.url);

      // IMPORTANT: used for delete
      a.dataset.url = link.url;

      defiMenu.appendChild(a);
    }
  }

  function openDefiMenu() {
    renderDefiMenu();
    defiMenu.classList.add("visible");
    defiButton.setAttribute("aria-expanded", "true");
  }

  function closeDefiMenu() {
    defiMenu.classList.remove("visible");
    defiButton.setAttribute("aria-expanded", "false");
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

  // NEW: Delete context menu show/hide
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

    // close My Assets + wallet menu if open
    if (typeof closeMyAssetsMenu === "function") closeMyAssetsMenu();
    if (walletMenu) walletMenu.classList.remove("visible");

    toggleDefiMenu();
  });

  // RIGHT CLICK on DeFi BUTTON/CONTAINER => Add site context menu (block Edge)
 function onDefiContextMenu(e) {
  // If RMB was on a DeFi menu item, do NOT show "Add site" here.
  // The item-specific handler will show "Delete site".
  const item = e.target?.closest?.("#defiMenu a[data-url]");
  if (item) {
    // Let the defiMenu contextmenu handler handle it
    return;
  }

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
// REMOVE the next line (important):
// defiContainer.addEventListener("contextmenu", onDefiContextMenu, true);
  
  // RIGHT CLICK on DeFi MENU ITEM => Delete site context menu (block Edge)
  function onDefiItemContextMenu(e) {
    const item = e.target?.closest?.("#defiMenu a[data-url]");
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    hideAddContextMenu();
    // keep the dropdown open
    showDeleteContextMenu(e.clientX, e.clientY, item.dataset.url);
    return false;
  }

  // Capture phase to suppress Edge menu on links
  defiMenu.addEventListener("contextmenu", onDefiItemContextMenu, true);

  // Add site action (NO manual label prompt)
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
    if (!label) return; // require label; remove this line if label can be empty

    const links = loadDefiLinks();
    links.push({ url: trimmedUrl, label });
    saveDefiLinks(links);

    openDefiMenu();
  });

  // Delete site action
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
    openDefiMenu(); // re-render and keep it open
  });

  // Close menus when clicking elsewhere
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

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDefiMenu();
      hideAllDefiContextMenus();
    }
  });

  // Also hide context menu on scroll/resize (nice UX)
  window.addEventListener("scroll", hideAllDefiContextMenus, true);
  window.addEventListener("resize", hideAllDefiContextMenus);

  // Initial render
  renderDefiMenu();
})();

// ================== Hold/Sell composite logic ==================

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// Map a value x in [-range..+range] to 0..1, where negative => more "sell" (risk-off)
function pctToSell01(x, range) {
  if (!Number.isFinite(x)) return null;
  // CONTRARIAN:
  // x = +range => sell=1, x=-range => sell=0
  return clamp((x + range) / (2 * range), 0, 1);
}

// Fear & Greed: higher greed => higher "sell"
function fgToSell01(fg) {
  if (!Number.isFinite(fg)) return null;
  return clamp(fg / 100, 0, 1);
}

function computeCompositeSellPct({ fg, btc24h, eth24h }) {
  // weights (tweak if you want)
  const wFg  = 0.55;
  const wBtc = 0.25;
  const wEth = 0.20;

  const sFg = fgToSell01(fg);          // 0..1
  const sB  = pctToSell01(btc24h, 8);  // +/-8% treated as "big move"
  const sE  = pctToSell01(eth24h, 10); // ETH moves more

  const parts = [
    { w: wFg,  v: sFg },
    { w: wBtc, v: sB },
    { w: wEth, v: sE },
  ].filter(p => p.v !== null);

  if (parts.length === 0) return null;

  const wSum = parts.reduce((a, p) => a + p.w, 0);
  const val  = parts.reduce((a, p) => a + p.w * p.v, 0) / wSum;

  return clamp(val * 100, 0, 100);
}

function updateHoldSellPanel() {
  const holdEl    = document.getElementById("hsHoldPct");
  const sellEl    = document.getElementById("hsSellPct");
  const markerEl  = document.getElementById("hsMarker");

  if (!holdEl || !sellEl || !markerEl) return;

  const sellPct = computeCompositeSellPct({
    fg: latestFgValue,
    btc24h: latestBtc24h,
    eth24h: latestEth24h,
  });

  if (!Number.isFinite(sellPct)) {
    holdEl.textContent = "–";
    sellEl.textContent = "–";
    return;
  }

  const holdPct = 100 - sellPct;

  holdEl.textContent = `${Math.round(holdPct)}%`;
  sellEl.textContent = `${Math.round(sellPct)}%`;
  markerEl.style.left = `${sellPct}%`;
}
async function loadPuell() {
  const statusEl = document.getElementById("puellStatus");
  const valueEl  = document.getElementById("puellValue");
  const markerEl = document.getElementById("puellMarker");

  try {
    const res = await fetch(PUELL_PROXY_URL, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

    const puell = Number(json.puell);

    if (valueEl) valueEl.textContent = Number.isFinite(puell) ? puell.toFixed(2) : "–";

    if (statusEl) {
      statusEl.textContent = json.status || "–";
      statusEl.classList.remove("is-green","is-yellow","is-orange","is-red");
      if (json.statusColor) statusEl.classList.add(`is-${json.statusColor}`);
    }

    if (markerEl && Number.isFinite(json.markerPct)) {
      markerEl.style.left = `${Math.max(0, Math.min(100, json.markerPct))}%`;
    }
  } catch (e) {
    console.error("Failed to load Puell", e);
    if (statusEl) statusEl.textContent = "Unavailable";
    if (valueEl) valueEl.textContent = "–";
  }
}
window.addEventListener("load", () => {
  loadPuell();
});
setInterval(loadPuell, 60 * 60 * 1000);









