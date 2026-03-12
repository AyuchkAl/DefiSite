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

const liqEthBottomEl = document.getElementById("liqEthBottom");
const liqBtcBottomEl = document.getElementById("liqBtcBottom");
const hfMainRowEl = document.querySelector(".hf-main-row");

// Fear & Greed (new)
const fgValueEl = document.getElementById("fgValue");
const fgLabelEl = document.getElementById("fgLabel");
const fgNeedleEl = document.getElementById("fgNeedle");

let currentAddress = null;

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

// Refresh occasionally (optional)
setInterval(loadPnlAssets, 10 * 60 * 1000);

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









