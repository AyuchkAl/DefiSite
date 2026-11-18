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
// quick-processor is now triggered only by the Supabase daily scheduler (Load button removed from UI)
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

// ================== GAS TRACKER (Ethereum mainnet) ==================
// Low / Avg / High gas price in Gwei, shown next to the wallet button.
// Calculated like Etherscan's gas oracle, straight from Ethereum mainnet (no API key):
//   eth_feeHistory(last 20 blocks, percentiles 25/50/75)
//   next base fee + median priority tip at 25% / 50% / 75%  → Low / Avg / High
// Public RPC endpoints are tried in order; refresh every 30 s. Click → etherscan.io/gastracker.

const GAS_RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://1rpc.io/eth"
];
const GAS_REFRESH_MS = 30 * 1000;
const GAS_BLOCKS = 20;

const gasTrackerEl = document.getElementById("gasTracker");
const gasLowEl  = document.getElementById("gasLow");
const gasAvgEl  = document.getElementById("gasAvg");
const gasHighEl = document.getElementById("gasHigh");

async function gasRpc(url, method, params) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "RPC error");
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

const weiHexToGwei = (hex) => Number(BigInt(hex)) / 1e9;

function medianOf(arr) {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function fetchGasOracle() {
  const errors = [];
  for (const url of GAS_RPC_URLS) {
    try {
      const fh = await gasRpc(url, "eth_feeHistory", ["0x" + GAS_BLOCKS.toString(16), "latest", [25, 50, 75]]);
      const baseFees = fh?.baseFeePerGas || [];
      const rewards = fh?.reward || [];
      if (!baseFees.length) throw new Error("no baseFeePerGas");

      const nextBase = weiHexToGwei(baseFees[baseFees.length - 1]); // base fee of the next block
      const tip = (i) => medianOf(rewards.map((r) => (r && r[i] ? weiHexToGwei(r[i]) : NaN)));

      const low = nextBase + tip(0);
      const avg = nextBase + tip(1);
      const high = nextBase + tip(2);
      const block = Number(BigInt(fh.oldestBlock)) + baseFees.length - 2;

      return { low, avg, high: Math.max(high, avg), base: nextBase, block, source: new URL(url).host };
    } catch (e) {
      errors.push(`${url}: ${e?.message || e}`);
    }
  }
  throw new Error("All gas RPC endpoints failed — " + errors.join("; "));
}

function formatGwei(v) {
  if (!Number.isFinite(v)) return "–";
  if (v < 1) return v.toFixed(3);
  if (v < 10) return v.toFixed(2);
  if (v < 100) return v.toFixed(1);
  return Math.round(v).toString();
}

function gasLevelClass(v) {
  if (!Number.isFinite(v)) return "";
  if (v < 2) return "gas-low";
  if (v < 10) return "gas-mid";
  return "gas-high";
}

async function loadGasTracker() {
  if (!gasTrackerEl) return;
  try {
    const g = await fetchGasOracle();

    gasLowEl.textContent = formatGwei(g.low);
    gasAvgEl.textContent = formatGwei(g.avg);
    gasHighEl.textContent = formatGwei(g.high);

    for (const [el, v] of [[gasLowEl, g.low], [gasAvgEl, g.avg], [gasHighEl, g.high]]) {
      el.classList.remove("gas-low", "gas-mid", "gas-high");
      const cls = gasLevelClass(v);
      if (cls) el.classList.add(cls);
    }

    gasTrackerEl.classList.remove("is-error");
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    gasTrackerEl.title =
      `Ethereum gas (Gwei)\n` +
      `Low ${formatGwei(g.low)} · Avg ${formatGwei(g.avg)} · High ${formatGwei(g.high)}\n` +
      `Base fee ${formatGwei(g.base)} · block ${g.block}\n` +
      `Source: ${g.source} · updated ${time}\n` +
      `Click to open Etherscan Gas Tracker`;
  } catch (e) {
    console.warn("Gas tracker:", e);
    gasTrackerEl.classList.add("is-error");
    gasTrackerEl.title = "Gas data unavailable — click to open Etherscan Gas Tracker";
    // keep last known values on screen
  }
}

setInterval(loadGasTracker, GAS_REFRESH_MS);

// ================== MARKET PRICES ======================
// Price sources are tried in order; the first one that answers wins.
// (CoinGecko free API often returns 429 / CORS errors — then Binance / Coinbase are used.)

const PRICE_FETCH_TIMEOUT_MS = 8000;
let priceRetryTimer = null;

async function fetchJsonWithTimeout(url, timeoutMs = PRICE_FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function validPriceQuote(q) {
  return q && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(q.pct);
}

// Each provider returns { btc: {price, pct}, eth: {price, pct} }
const PRICE_PROVIDERS = [
  {
    name: "CoinGecko",
    async load() {
      const data = await fetchJsonWithTimeout(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&order=market_cap_desc&per_page=2&page=1&sparkline=false&price_change_percentage=24h"
      );
      if (!Array.isArray(data)) throw new Error("Unexpected CoinGecko response");
      const pick = (id) => {
        const c = data.find((x) => x.id === id);
        return c ? { price: Number(c.current_price), pct: Number(c.price_change_percentage_24h) } : null;
      };
      return { btc: pick("bitcoin"), eth: pick("ethereum") };
    }
  },
  {
    name: "Binance",
    async load() {
      const symbols = encodeURIComponent(JSON.stringify(["BTCUSDT", "ETHUSDT"]));
      const data = await fetchJsonWithTimeout(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbols}`);
      if (!Array.isArray(data)) throw new Error("Unexpected Binance response");
      const pick = (sym) => {
        const c = data.find((x) => x.symbol === sym);
        return c ? { price: Number(c.lastPrice), pct: Number(c.priceChangePercent) } : null;
      };
      return { btc: pick("BTCUSDT"), eth: pick("ETHUSDT") };
    }
  },
  {
    name: "Coinbase",
    async load() {
      const pick = async (product) => {
        const s = await fetchJsonWithTimeout(`https://api.exchange.coinbase.com/products/${product}/stats`);
        const last = Number(s.last);
        const open = Number(s.open);
        return { price: last, pct: open > 0 ? ((last - open) / open) * 100 : NaN };
      };
      const [btc, eth] = await Promise.all([pick("BTC-USD"), pick("ETH-USD")]);
      return { btc, eth };
    }
  }
];

async function fetchBtcEthQuotes() {
  const errors = [];
  for (const p of PRICE_PROVIDERS) {
    try {
      const q = await p.load();
      if (validPriceQuote(q?.btc) && validPriceQuote(q?.eth)) {
        return { ...q, source: p.name };
      }
      throw new Error("incomplete data");
    } catch (e) {
      errors.push(`${p.name}: ${e?.message || e}`);
      console.warn(`Prices: ${p.name} failed`, e);
    }
  }
  throw new Error("All price sources failed — " + errors.join("; "));
}

async function loadCryptoPrices() {
  try {
    const { btc, eth, source } = await fetchBtcEthQuotes();

    if (priceRetryTimer) { clearTimeout(priceRetryTimer); priceRetryTimer = null; }

    latestBtc24h = btc.pct;
    latestEth24h = eth.pct;
    currentBtcPrice = btc.price;
    currentEthPrice = eth.price;

    function setCoin(elPrice, elChange, coin) {
      if (!coin) return;

      if (elPrice) {
        elPrice.textContent =
          "$" + coin.price.toLocaleString(undefined, { maximumFractionDigits: 0 });
        elPrice.title = `Source: ${source}`;
      }

      if (elChange) {
        const pct = coin.pct;
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
    if (typeof renderAllocation === "function") renderAllocation();
  } catch (e) {
    console.error("Failed to load BTC/ETH prices", e);
    // Keep last known prices on screen if we had them; otherwise leave "–"
    if (currentBtcPrice == null) {
      latestBtc24h = null;
      latestEth24h = null;
    }
    updateMorphoLiqDisplay();
    updateHoldSellPanel();

    // Retry sooner than the normal 5-min interval
    if (!priceRetryTimer) {
      priceRetryTimer = setTimeout(() => { priceRetryTimer = null; loadCryptoPrices(); }, 60 * 1000);
    }
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
    loadAllocation(userAddress);
    statusDiv.textContent = "Done.";
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Error: " + (err.message || err);
  }
}

connectButton.addEventListener("click", connectAndLoad);

disconnectBtn.addEventListener("click", () => {
  setDisconnectedUI();
  loadAllocation(null);
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

// ================== ASSETS ROW: LAST UPDATED (Google Sheet "Date of check") ==================
// "Last Updated: YYYY-MM-DD" above Total Assets / DeFi / PnL / Percentage / Allocation cards.
// Source: Google Sheet DEFI_and_Earns, tab gid=573713211, cell S2 (header S1 = "Date of check").
// (Sheet1 S3 was tried 2026-10-02 but that cell is empty.)
// (Assets Performance graph keeps its own "Last Updated" from the latest ta_data row.)
//
// Read order:
//   1) CSV export  — returns the cell text exactly as displayed (same method as Total Assets T2).
//      GVIZ can drop values whose type differs from the rest of the column.
//   2) GVIZ JSON   — fallback.
const ASSETS_LAST_UPDATED_SHEET_ID = "1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM";
const ASSETS_LAST_UPDATED_GID = "573713211";
const ASSETS_LAST_UPDATED_CELL = "S2";

const ASSETS_LAST_UPDATED_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${ASSETS_LAST_UPDATED_SHEET_ID}/export?format=csv` +
  `&gid=${ASSETS_LAST_UPDATED_GID}&range=${ASSETS_LAST_UPDATED_CELL}`;

const ASSETS_LAST_UPDATED_GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${ASSETS_LAST_UPDATED_SHEET_ID}/gviz/tq` +
  `?gid=${ASSETS_LAST_UPDATED_GID}&range=${ASSETS_LAST_UPDATED_CELL}&headers=0&tqx=out:json`;

const assetsLastUpdatedEl = document.getElementById("assetsLastUpdated");
const assetsLastUpdatedDateEl = document.getElementById("assetsLastUpdatedDate");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fullYear(y) {
  const n = Number(y);
  return n < 100 ? 2000 + n : n; // "25" -> 2025
}

// Converts Google Sheet date value/text to YYYY-MM-DD (or "" if not a date)
function sheetValueToIsoDate(v, f) {
  // GVIZ date cell: "Date(2026,8,29)" or "Date(2026,8,29,15,0,0)" (month is 0-based)
  const m0 = /^Date\((\d{4}),(\d{1,2}),(\d{1,2})/.exec(String(v ?? ""));
  if (m0) return `${m0[1]}-${pad2(Number(m0[2]) + 1)}-${pad2(m0[3])}`;

  // Serial number (days since 1899-12-30)
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }

  for (const raw of [f, v]) {
    const s = String(raw ?? "").trim();
    if (!s) continue;

    let m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);                  // 2026-09-29
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

    m = /(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/.exec(s);                // 29.09.2026 / 29.09.26
    if (m) return `${fullYear(m[3])}-${pad2(m[2])}-${pad2(m[1])}`;

    m = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/.exec(s);                // 9/29/2026 or 29/9/2026
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      const [mon, day] = a > 12 ? [b, a] : [a, b];
      return `${fullYear(m[3])}-${pad2(mon)}-${pad2(day)}`;
    }

    // Numeric text that is a serial date, e.g. "46294" or "46294,5"
    const num = Number(s.replace(",", "."));
    if (Number.isFinite(num) && num > 20000 && num < 80000) return sheetValueToIsoDate(num, null);
  }
  return "";
}

// 1) CSV export -> { text }
async function readLastUpdatedCsv() {
  const res = await fetch(ASSETS_LAST_UPDATED_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
  let text = (await res.text()).trim();
  text = text.replace(/^"+|"+$/g, "").trim();
  return { v: text, f: text };
}

// 2) GVIZ JSON -> { v, f }
async function readLastUpdatedGviz() {
  const res = await fetch(ASSETS_LAST_UPDATED_GVIZ_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`GVIZ HTTP ${res.status}`);
  const raw = await res.text();
  const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  const cell = data?.table?.rows?.[0]?.c?.[0];
  if (cell) return { v: cell.v, f: cell.f };
  // If GVIZ treated the single cell as a header row, the value is in the column label
  const label = data?.table?.cols?.[0]?.label;
  return { v: label ?? "", f: label ?? "" };
}

async function loadAssetsLastUpdated() {
  if (!assetsLastUpdatedEl || !assetsLastUpdatedDateEl) return;

  let lastRawText = "";
  const errors = [];

  for (const [name, reader] of [["CSV", readLastUpdatedCsv], ["GVIZ", readLastUpdatedGviz]]) {
    try {
      const cell = await reader();
      const iso = sheetValueToIsoDate(cell.v, cell.f);
      if (iso) {
        assetsLastUpdatedDateEl.textContent = iso;
        assetsLastUpdatedEl.classList.remove("is-error");
        assetsLastUpdatedEl.title = `Source: Google Sheet DEFI_and_Earns, "Date of check" (gid ${ASSETS_LAST_UPDATED_GID}, cell ${ASSETS_LAST_UPDATED_CELL}, ${name})`;
        return;
      }
      const txt = String(cell.f ?? cell.v ?? "").trim();
      if (txt && !lastRawText) lastRawText = txt;
      errors.push(`${name}: ${txt ? `not a date ("${txt}")` : "cell is empty"}`);
    } catch (e) {
      errors.push(`${name}: ${e?.message || e}`);
    }
  }

  console.warn(`Assets Last Updated: cell ${ASSETS_LAST_UPDATED_CELL} not read as date —`, errors.join("; "));

  // Show the raw text if there is any (so it is visible what the cell contains), otherwise "–"
  assetsLastUpdatedDateEl.textContent = lastRawText ? lastRawText.slice(0, 24) : "–";
  assetsLastUpdatedEl.classList.add("is-error");
  assetsLastUpdatedEl.title = `Google Sheet cell ${ASSETS_LAST_UPDATED_CELL}: ` + errors.join("; ");
}

setInterval(loadAssetsLastUpdated, 10 * 60 * 1000);

// ================== ALLOCATION (donut) ==================
// BTC%  = (BTC supplied on Aave [Arbitrum] + BTC collateral on Morpho [Base]) * BTC price
// ETH%  = (ETH supplied on Aave [Arbitrum]) * ETH price
// USD%  = USDC + USDT supplied (deposits only, borrowed ignored) on Aave + Morpho
// 100%  = BTC + ETH + USD

const ALLOC_ARBITRUM_RPC_URL = "https://arb1.arbitrum.io/rpc";
const ALLOC_MORPHO_API_URL = "https://api.morpho.org/graphql";
const ALLOC_MORPHO_CHAIN_ID = 8453; // Base

// Aave V3 Arbitrum reserves counted in allocation (supplied aToken balance)
const ALLOC_AAVE_ASSETS = [
  { group: "BTC", symbol: "WBTC",   address: WBTC_ADDRESS,                                   decimals: 8  },
  { group: "BTC", symbol: "tBTC",   address: "0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40", decimals: 18 },
  { group: "ETH", symbol: "WETH",   address: WETH_ADDRESS,                                   decimals: 18 },
  { group: "USD", symbol: "USDC",   address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6  },
  { group: "USD", symbol: "USDC.e", address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6  },
  { group: "USD", symbol: "USDT",   address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6  }
];

const ALLOC_COLORS = { BTC: "#f5d547", ETH: "#2ebac6", USD: "#16c784" };

const allocationChartEl = document.getElementById("allocationChart");

// Last loaded quantities (re-rendered when prices refresh)
let allocationQty = null; // { btc, eth, usd }

function allocGroupFromSymbol(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (s.includes("BTC")) return "BTC";                       // WBTC, cbBTC, tBTC, LBTC...
  if (s === "USDC" || s === "USDT" || s === "USDC.E" || s === "USDT0" || s === "USD₮0") return "USD";
  return null;
}

function allocUnits(raw, decimals) {
  if (raw == null) return 0;
  try {
    return Number(ethers.formatUnits(BigInt(String(raw).split(".")[0]), Number(decimals) || 0));
  } catch {
    const n = Number(raw);
    return Number.isFinite(n) ? n / Math.pow(10, Number(decimals) || 0) : 0;
  }
}

function setAllocationMessage(text) {
  if (!allocationChartEl) return;
  allocationChartEl.innerHTML = "";
  const div = document.createElement("div");
  div.className = "allocation-msg";
  div.textContent = text;
  allocationChartEl.appendChild(div);
}

// ---- Aave (Arbitrum) supplied balances ----
async function loadAaveAllocationQty(userAddress) {
  const provider = new ethers.JsonRpcProvider(ALLOC_ARBITRUM_RPC_URL, 42161, { staticNetwork: true });
  const dp = new ethers.Contract(DATA_PROVIDER_ADDRESS, DATA_PROVIDER_ABI, provider);

  const results = await Promise.allSettled(
    ALLOC_AAVE_ASSETS.map((a) => dp.getUserReserveData(a.address, userAddress))
  );

  const out = { btc: 0, eth: 0, usd: 0 };
  results.forEach((r, i) => {
    const a = ALLOC_AAVE_ASSETS[i];
    if (r.status !== "fulfilled") {
      console.warn(`Allocation: Aave ${a.symbol} not read`, r.reason?.shortMessage || r.reason);
      return;
    }
    const qty = Number(ethers.formatUnits(r.value.currentATokenBalance, a.decimals));
    if (!Number.isFinite(qty)) return;
    if (a.group === "BTC") out.btc += qty;
    else if (a.group === "ETH") out.eth += qty;
    else out.usd += qty;
  });
  return out;
}

// ---- Morpho: BTC collateral + USDC/USDT supplied — ALL chains ----
// 1) REST API (new, all chains):  GET /v0/blue/users/{addr}/positions  → chain_id, market_id, supply_shares, collateral_assets
//    market tokens: /v0/blue/markets/{chain}:{market}   token info: /v0/tokens/{chain}:{token}
//    supply assets = supply_shares × total_supply_assets / total_supply_shares  (/state)
// 2) Fallback: GraphQL (being retired 29-Jan-2027) per chain.
// Vault deposits (USDC/USDT) via GraphQL vaultPositions (optional).
const MORPHO_REST_BASE = "https://api.morpho.org/v0";
const MORPHO_GQL_CHAINS = [8453, 1, 42161]; // Base, Ethereum, Arbitrum
const MORPHO_CHAIN_NAMES = { 1: "Ethereum", 8453: "Base", 42161: "Arbitrum", 130: "Unichain", 137: "Polygon", 10: "Optimism", 747474: "Katana", 999: "HyperEVM" };

async function morphoGql(query, variables) {
  const res = await fetch(ALLOC_MORPHO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store"
  });
  const json = await res.json();
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message || `HTTP ${res.status}`);
  }
  return json.data;
}

async function morphoRest(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(MORPHO_REST_BASE + path, { headers: { accept: "application/json" }, cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
    return (await res.json())?.data;
  } finally {
    clearTimeout(t);
  }
}

const morphoMarketCache = {};
const morphoTokenCache = {};
async function morphoMarket(chainId, marketId) {
  const k = `${chainId}:${marketId}`;
  if (!morphoMarketCache[k]) morphoMarketCache[k] = morphoRest(`/blue/markets/${k}`);
  return morphoMarketCache[k];
}
async function morphoToken(chainId, address) {
  const k = `${chainId}:${address}`;
  if (!morphoTokenCache[k]) morphoTokenCache[k] = morphoRest(`/tokens/${k}`);
  return morphoTokenCache[k];
}

// REST: market positions on all chains
async function loadMorphoMarketsRest(userAddress, out) {
  const rows = await morphoRest(`/blue/users/${userAddress}/positions?active_only=true&limit=100`);
  if (!Array.isArray(rows)) throw new Error("Unexpected Morpho REST response");

  for (const r of rows) {
    const chain = Number(r.chain_id);
    const chainName = MORPHO_CHAIN_NAMES[chain] || `chain ${chain}`;
    const collateralRaw = BigInt(r.collateral_assets || "0");
    const supplyShares = BigInt(r.supply_shares || "0");
    if (collateralRaw === 0n && supplyShares === 0n) continue;

    const m = await morphoMarket(chain, r.market_id);

    if (collateralRaw > 0n && m?.collateral_token) {
      const tok = await morphoToken(chain, m.collateral_token);
      const isBtc = allocGroupFromSymbol(tok?.symbol) === "BTC" || (tok?.tags || []).includes("btc");
      if (isBtc) {
        const qty = Number(ethers.formatUnits(collateralRaw, Number(tok.decimals)));
        out.btc += qty;
        out.details.push(`Morpho ${chainName} ${tok.symbol} collateral: ${qty.toFixed(6)}`);
      }
    }

    if (supplyShares > 0n && m?.loan_token) {
      const tok = await morphoToken(chain, m.loan_token);
      if (allocGroupFromSymbol(tok?.symbol) === "USD") {
        const st = await morphoRest(`/blue/markets/${chain}:${r.market_id}/state`);
        const tsa = BigInt(st?.total_supply_assets || "0");
        const tss = BigInt(st?.total_supply_shares || "0");
        const assets = tss > 0n ? (supplyShares * tsa) / tss : 0n;
        const qty = Number(ethers.formatUnits(assets, Number(tok.decimals)));
        out.usd += qty;
        out.details.push(`Morpho ${chainName} ${tok.symbol} supplied: ${qty.toFixed(2)}`);
      }
    }
  }
}

// GraphQL fallback: market positions on one chain
async function loadMorphoMarketsGql(userAddress, chainId, out) {
  try {
    const data = await morphoGql(`
      query ($address: String!, $chainId: Int!) {
        userByAddress(address: $address, chainId: $chainId) {
          marketPositions {
            market {
              loanAsset { symbol decimals }
              collateralAsset { symbol decimals }
            }
            state { collateral supplyAssets }
          }
        }
      }`, { address: userAddress, chainId });

    const chainName = MORPHO_CHAIN_NAMES[chainId] || `chain ${chainId}`;
    for (const p of data?.userByAddress?.marketPositions || []) {
      const col = p?.market?.collateralAsset;
      const loan = p?.market?.loanAsset;
      if (col && allocGroupFromSymbol(col.symbol) === "BTC") {
        const qty = allocUnits(p?.state?.collateral, col.decimals);
        if (qty > 0) { out.btc += qty; out.details.push(`Morpho ${chainName} ${col.symbol} collateral: ${qty.toFixed(6)}`); }
      }
      if (loan && allocGroupFromSymbol(loan.symbol) === "USD") {
        const qty = allocUnits(p?.state?.supplyAssets, loan.decimals);
        if (qty > 0) { out.usd += qty; out.details.push(`Morpho ${chainName} ${loan.symbol} supplied: ${qty.toFixed(2)}`); }
      }
    }
  } catch (e) {
    // "No results matching given parameters" = no Morpho positions on this chain
    if (!/no results/i.test(String(e?.message))) throw e;
  }
}

// GraphQL: vault (V1) USDC/USDT/BTC deposits on one chain (optional)
async function loadMorphoVaultsGql(userAddress, chainId, out) {
  try {
    const data = await morphoGql(`
      query ($address: String!, $chainId: Int!) {
        userByAddress(address: $address, chainId: $chainId) {
          vaultPositions {
            vault { asset { symbol decimals } }
            state { assets }
          }
        }
      }`, { address: userAddress, chainId });

    const chainName = MORPHO_CHAIN_NAMES[chainId] || `chain ${chainId}`;
    for (const p of data?.userByAddress?.vaultPositions || []) {
      const asset = p?.vault?.asset;
      const group = asset && allocGroupFromSymbol(asset.symbol);
      const qty = asset ? allocUnits(p?.state?.assets, asset.decimals) : 0;
      if (!(qty > 0)) continue;
      if (group === "USD") { out.usd += qty; out.details.push(`Morpho ${chainName} vault ${asset.symbol}: ${qty.toFixed(2)}`); }
      if (group === "BTC") { out.btc += qty; out.details.push(`Morpho ${chainName} vault ${asset.symbol}: ${qty.toFixed(6)}`); }
    }
  } catch (e) {
    if (!/no results/i.test(String(e?.message))) console.warn(`Allocation: Morpho vaults (chain ${chainId}) not read`, e);
  }
}

// ---- Morpho Blue ON-CHAIN reader (no Morpho API needed in the browser) ----
// The Morpho API may be blocked by the browser (CORS) on defi.yuchkal.org, so balances are read directly
// from the Morpho Blue contract via public RPC. The API is only used to DISCOVER which markets the wallet uses;
// MORPHO_TRACKED_MARKETS is a built-in fallback list (user's known markets).
const MORPHO_CHAINS = {
  8453:  { name: "Base",     morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
           rpcs: ["https://base-rpc.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org", "https://1rpc.io/base"] },
  1:     { name: "Ethereum", morpho: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
           rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"] },
  42161: { name: "Arbitrum", morpho: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
           rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"] }
};

// Known markets of this wallet (fallback when market discovery via API is blocked)
const MORPHO_TRACKED_MARKETS = [
  { chainId: 8453, id: "0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836" } // cbBTC / USDC (Base)
];

const MORPHO_BLUE_ABI = [
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"
];
const MORPHO_ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];

const morphoProviders = {};
async function morphoChainProvider(chainId) {
  if (morphoProviders[chainId]) return morphoProviders[chainId];
  const cfg = MORPHO_CHAINS[chainId];
  if (!cfg) throw new Error(`Morpho chain ${chainId} not configured`);
  for (const url of cfg.rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(url, Number(chainId), { staticNetwork: true });
      await p.getBlockNumber();
      morphoProviders[chainId] = p;
      return p;
    } catch (e) {
      console.warn(`Allocation: ${cfg.name} RPC ${url} not available`, e?.shortMessage || e);
    }
  }
  throw new Error(`No RPC available for ${cfg.name}`);
}

const morphoTokenInfoCache = {};
async function morphoTokenInfo(provider, chainId, address) {
  const k = `${chainId}:${address.toLowerCase()}`;
  if (!morphoTokenInfoCache[k]) {
    const c = new ethers.Contract(address, MORPHO_ERC20_ABI, provider);
    morphoTokenInfoCache[k] = Promise.all([c.symbol(), c.decimals()]).then(([symbol, decimals]) => ({ symbol, decimals: Number(decimals) }));
  }
  return morphoTokenInfoCache[k];
}

// Market discovery: Morpho REST (all chains) + tracked list. Returns unique [{chainId, id}]
async function discoverMorphoMarkets(userAddress) {
  const list = [...MORPHO_TRACKED_MARKETS];
  try {
    const rows = await morphoRest(`/blue/users/${userAddress}/positions?active_only=true&limit=100`);
    for (const r of rows || []) list.push({ chainId: Number(r.chain_id), id: r.market_id });
  } catch (e) {
    console.warn("Allocation: Morpho market discovery via API failed — using tracked markets only", e?.message || e);
  }
  const seen = new Set();
  return list.filter((m) => {
    const k = `${m.chainId}:${String(m.id).toLowerCase()}`;
    if (seen.has(k) || !MORPHO_CHAINS[m.chainId]) return false;
    seen.add(k);
    return true;
  });
}

async function loadMorphoMarketsOnchain(userAddress, out) {
  const markets = await discoverMorphoMarkets(userAddress);
  let readOk = 0;
  const errors = [];

  for (const m of markets) {
    const cfg = MORPHO_CHAINS[m.chainId];
    try {
      const provider = await morphoChainProvider(m.chainId);
      const blue = new ethers.Contract(cfg.morpho, MORPHO_BLUE_ABI, provider);
      const pos = await blue.position(m.id, userAddress);
      readOk++;
      const collateral = BigInt(pos.collateral);
      const supplyShares = BigInt(pos.supplyShares);
      if (collateral === 0n && supplyShares === 0n) continue;

      const params = await blue.idToMarketParams(m.id);

      if (collateral > 0n) {
        const tok = await morphoTokenInfo(provider, m.chainId, params.collateralToken);
        if (allocGroupFromSymbol(tok.symbol) === "BTC") {
          const qty = Number(ethers.formatUnits(collateral, tok.decimals));
          out.btc += qty;
          out.details.push(`Morpho ${cfg.name} ${tok.symbol} collateral: ${qty.toFixed(6)}`);
        }
      }

      if (supplyShares > 0n) {
        const tok = await morphoTokenInfo(provider, m.chainId, params.loanToken);
        if (allocGroupFromSymbol(tok.symbol) === "USD") {
          const mk = await blue.market(m.id);
          const tsa = BigInt(mk.totalSupplyAssets), tss = BigInt(mk.totalSupplyShares);
          const assets = tss > 0n ? (supplyShares * tsa) / tss : 0n;
          const qty = Number(ethers.formatUnits(assets, tok.decimals));
          out.usd += qty;
          out.details.push(`Morpho ${cfg.name} ${tok.symbol} supplied: ${qty.toFixed(2)}`);
        }
      }
    } catch (e) {
      errors.push(`${cfg.name} ${String(m.id).slice(0, 10)}…: ${e?.shortMessage || e?.message || e}`);
    }
  }

  if (markets.length && readOk === 0) throw new Error("Morpho on-chain read failed — " + errors.join("; "));
  if (errors.length) console.warn("Allocation: some Morpho markets not read", errors);
}

async function loadMorphoAllocationQty(userAddress) {
  const out = { btc: 0, usd: 0, details: [], method: "" };

  // Markets: 1) ON-CHAIN (Morpho Blue contract, markets discovered via API + tracked list)
  //          2) REST API amounts  3) GraphQL (Base, Ethereum, Arbitrum)
  try {
    await loadMorphoMarketsOnchain(userAddress, out);
    out.method = "on-chain";
  } catch (e0) {
    console.warn("Allocation: Morpho on-chain read failed, trying REST", e0);
    out.btc = 0; out.usd = 0; out.details = [];
  }
  if (!out.method) try {
    await loadMorphoMarketsRest(userAddress, out);
    out.method = "REST";
  } catch (e) {
    console.warn("Allocation: Morpho REST failed, using GraphQL", e);
    out.btc = 0; out.usd = 0; out.details = [];
    const errors = [];
    for (const chainId of MORPHO_GQL_CHAINS) {
      try { await loadMorphoMarketsGql(userAddress, chainId, out); }
      catch (err) { errors.push(`${chainId}: ${err?.message || err}`); }
    }
    if (errors.length === MORPHO_GQL_CHAINS.length) throw new Error("Morpho REST and GraphQL failed — " + errors.join("; "));
    out.method = "GraphQL";
  }

  // Vault deposits (optional)
  for (const chainId of MORPHO_GQL_CHAINS) await loadMorphoVaultsGql(userAddress, chainId, out);

  return out;
}

async function getAllocationPrices() {
  let btc = Number.isFinite(currentBtcPrice) ? currentBtcPrice : null;
  let eth = Number.isFinite(currentEthPrice) ? currentEthPrice : null;

  // Fallback: Aave oracle prices if CoinGecko has not loaded yet
  if (btc == null || eth == null) {
    try {
      const provider = new ethers.JsonRpcProvider(ALLOC_ARBITRUM_RPC_URL, 42161, { staticNetwork: true });
      const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);
      const [e, b] = await Promise.all([oracle.getAssetPrice(WETH_ADDRESS), oracle.getAssetPrice(WBTC_ADDRESS)]);
      if (eth == null) eth = Number(ethers.formatUnits(e, 8));
      if (btc == null) btc = Number(ethers.formatUnits(b, 8));
    } catch (err) {
      console.warn("Allocation: oracle price fallback failed", err);
    }
  }
  return { btc, eth };
}

// ---- Aave V4 (Ethereum mainnet): supplied assets in Spokes + Tokenization Spoke vaults ----
// Aave V4 (live on Ethereum since 30-Mar-2026) uses Hub & Spoke contracts — different from V3.
// Addresses: https://aave.com/docs/resources/addresses (V4 tab). Read via Multicall3 on public RPC.
const ALLOC_ETH_RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://1rpc.io/eth"
];
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Position Spokes (users supply/borrow here). Treasury Spoke excluded.
const AAVE_V4_SPOKES = {
  "Main":              "0x94e7A5dCbE816e498b89aB752661904E2F56c485",
  "Bluechip":          "0x973a023A77420ba610f06b3858aD991Df6d85A08",
  "Lombard BTC":       "0x7EC68b5695e803e98a21a9A05d744F28b0a7753D",
  "Ethena Correlated": "0x58131E79531caB1d52301228d1f7b842F26B9649",
  "Ethena Ecosystem":  "0xba1B3D55D249692b669A164024A838309B7508AF",
  "Forex":             "0xD8B93635b8C6d0fF98CbE90b5988E3F2d1Cd9da1",
  "Gold":              "0x65407b940966954b23dfA3caA5C0702bB42984DC",
  "PAXG Gold":         "0xAD75cE6354f87F3135cE10621d385d8D1e2562C2",
  "USDG Pendle":       "0x956d8e0A89cfa3744428C4641b5a53B56167a7f9",
  "EtherFi eSpoke":    "0xbF10BDfE177dE0336aFD7fcCF80A904E15386219",
  "Kelp eSpoke":       "0x3131FE68C4722e726fe6B2819ED68e514395B9a4",
  "Lido eSpoke":       "0xe1900480ac69f0B296841Cd01cC37546d92F35Cd",
  "USDG Maple eSpoke": "0x774b9655413c34809c1f1b16b654465A89EBE989"
};

// Tokenization Spokes = ERC-4626 vaults (user holds shares, e.g. "waCoreUSDC")
const AAVE_V4_VAULTS = [
  { name: "Core WETH",           group: "ETH", decimals: 18, address: "0x7320CF22Ac095bA2a2e0a652F77efB836c2E751b" },
  { name: "Prime WETH",          group: "ETH", decimals: 18, address: "0x2087513383330B961A3753B47627Bbf149F31c70" },
  { name: "Core WBTC",           group: "BTC", decimals: 8,  address: "0x82A9CC4656784E55Ef2E78F704028B5E1Bfc1732" },
  { name: "Core cbBTC",          group: "BTC", decimals: 8,  address: "0x33B41B74366F55327d959FfF6D6b6fBc2853dbB1" },
  { name: "Core LBTC",           group: "BTC", decimals: 8,  address: "0x7961F140B570490849DB878AE222570ea838799d" },
  { name: "Prime WBTC",          group: "BTC", decimals: 8,  address: "0x5AE3d87De89CA6Ce501e8317887F71EABED69E18" },
  { name: "Prime cbBTC",         group: "BTC", decimals: 8,  address: "0xD38098faf52D8E915EdED84fBF30F81C17906938" },
  { name: "Core USDC",           group: "USD", decimals: 6,  address: "0x531E90a2376902DE8915789Fcc1075e3B0c153E7" },
  { name: "Core USDT",           group: "USD", decimals: 6,  address: "0x5eC44a70F309854fe04d495cFE1B5dA63DD1cc73" },
  { name: "Plus USDC",           group: "USD", decimals: 6,  address: "0xc94bdd83D2c7655C280655D60954e79E88D4F949" },
  { name: "Plus USDT",           group: "USD", decimals: 6,  address: "0x80835EB50694EE0e519743f67e5401e6FD300006" },
  { name: "Prime USDC",          group: "USD", decimals: 6,  address: "0x486415fb1F8b062c89ED548f871cf64304AACb31" },
  { name: "Prime USDT",          group: "USD", decimals: 6,  address: "0x46c588DD8453aC259c1f6a54b4C9A93C2aC3762D" },
  { name: "Global Dollar USDC",  group: "USD", decimals: 6,  address: "0xaed7c529bD2878170B61C758DfAa215AC7a4FD07" },
  { name: "Global Dollar USDT",  group: "USD", decimals: 6,  address: "0xa0e97e45C2f89003730E467Bd484fA3eEcE5B4Cf" }
];

const V4_SPOKE_IFACE = new ethers.Interface([
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 reserveId)",
  "function getUserSuppliedAssets(uint256 reserveId, address user) view returns (uint256)"
]);
const V4_ERC20_IFACE = new ethers.Interface([
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)"
]);
const MULTICALL3_IFACE = new ethers.Interface([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"
]);

// V4 group by token symbol: only WETH counts as ETH; BTC wrappers as BTC; USDC/USDT as USD
function v4GroupFromSymbol(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (s === "WETH") return "ETH";
  if (s.includes("BTC")) return "BTC";
  if (s === "USDC" || s === "USDT" || s === "USDT0") return "USD";
  return null;
}

let ethMainnetProvider = null;
async function getEthMainnetProvider() {
  if (ethMainnetProvider) return ethMainnetProvider;
  for (const url of ALLOC_ETH_RPC_URLS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 1, { staticNetwork: true });
      await p.getBlockNumber();
      ethMainnetProvider = p;
      return p;
    } catch (e) {
      console.warn(`Allocation: Ethereum RPC ${url} not available`, e?.shortMessage || e);
    }
  }
  throw new Error("No Ethereum RPC available");
}

// calls: [{ target, data }] → [{ ok, data }] (chunks of 150)
async function multicall3(provider, calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += 150) {
    const chunk = calls.slice(i, i + 150);
    const data = MULTICALL3_IFACE.encodeFunctionData("aggregate3", [
      chunk.map((c) => ({ target: c.target, allowFailure: true, callData: c.data }))
    ]);
    const raw = await provider.call({ to: MULTICALL3_ADDRESS, data });
    const [results] = MULTICALL3_IFACE.decodeFunctionResult("aggregate3", raw);
    for (const r of results) out.push({ ok: r.success && r.returnData !== "0x", data: r.returnData });
  }
  return out;
}

// Reserve list of all Spokes (static) — built once per page load
let aaveV4ReservesCache = null;
async function getAaveV4Reserves(provider) {
  if (aaveV4ReservesCache) return aaveV4ReservesCache;

  const spokes = Object.entries(AAVE_V4_SPOKES);
  const counts = await multicall3(provider, spokes.map(([, a]) => ({
    target: a, data: V4_SPOKE_IFACE.encodeFunctionData("getReserveCount", [])
  })));

  const reserveCalls = [];
  spokes.forEach(([name, address], i) => {
    const n = counts[i].ok ? Number(BigInt(counts[i].data)) : 0;
    for (let id = 0; id < n; id++) {
      reserveCalls.push({ spoke: name, spokeAddress: address, id,
        target: address, data: V4_SPOKE_IFACE.encodeFunctionData("getReserve", [id]) });
    }
  });
  const reserveRes = await multicall3(provider, reserveCalls);

  // Reserve struct: word0 = underlying, word1 = hub, word2 = assetId, word3 = decimals
  const reserves = [];
  reserveRes.forEach((r, i) => {
    if (!r.ok || r.data.length < 2 + 64 * 4) return;
    const word = (k) => "0x" + r.data.slice(2 + 64 * k, 2 + 64 * (k + 1));
    reserves.push({
      ...reserveCalls[i],
      underlying: ethers.getAddress("0x" + word(0).slice(-40)),
      decimals: Number(BigInt(word(3)))
    });
  });

  const tokens = [...new Set(reserves.map((r) => r.underlying))];
  const symRes = await multicall3(provider, tokens.map((t) => ({
    target: t, data: V4_ERC20_IFACE.encodeFunctionData("symbol", [])
  })));
  const symbols = {};
  tokens.forEach((t, i) => {
    try { symbols[t] = symRes[i].ok ? V4_ERC20_IFACE.decodeFunctionResult("symbol", symRes[i].data)[0] : "?"; }
    catch { symbols[t] = "?"; }
  });

  aaveV4ReservesCache = reserves
    .map((r) => ({ ...r, symbol: symbols[r.underlying], group: v4GroupFromSymbol(symbols[r.underlying]) }))
    .filter((r) => r.group);
  return aaveV4ReservesCache;
}

async function loadAaveV4AllocationQty(userAddress) {
  const provider = await getEthMainnetProvider();
  const out = { btc: 0, eth: 0, usd: 0, details: [] };
  const add = (group, qty, label) => {
    if (!(qty > 0)) return;
    if (group === "BTC") out.btc += qty;
    else if (group === "ETH") out.eth += qty;
    else out.usd += qty;
    out.details.push(`${label}: ${qty < 1 ? qty.toFixed(6) : qty.toFixed(2)}`);
  };

  // 1) Spoke positions
  const reserves = await getAaveV4Reserves(provider);
  const supplied = await multicall3(provider, reserves.map((r) => ({
    target: r.spokeAddress,
    data: V4_SPOKE_IFACE.encodeFunctionData("getUserSuppliedAssets", [r.id, userAddress])
  })));
  reserves.forEach((r, i) => {
    if (!supplied[i].ok) return;
    add(r.group, Number(ethers.formatUnits(BigInt(supplied[i].data), r.decimals)), `V4 ${r.spoke} ${r.symbol}`);
  });

  // 2) Tokenization vaults (ERC-4626 shares → assets)
  const bal = await multicall3(provider, AAVE_V4_VAULTS.map((v) => ({
    target: v.address, data: V4_ERC20_IFACE.encodeFunctionData("balanceOf", [userAddress])
  })));
  const held = AAVE_V4_VAULTS
    .map((v, i) => ({ ...v, shares: bal[i].ok ? BigInt(bal[i].data) : 0n }))
    .filter((v) => v.shares > 0n);
  if (held.length) {
    const conv = await multicall3(provider, held.map((v) => ({
      target: v.address, data: V4_ERC20_IFACE.encodeFunctionData("convertToAssets", [v.shares])
    })));
    held.forEach((v, i) => {
      if (!conv[i].ok) return;
      add(v.group, Number(ethers.formatUnits(BigInt(conv[i].data), v.decimals)), `V4 ${v.name} vault`);
    });
  }

  return out;
}

async function loadAllocation(userAddress) {
  if (!allocationChartEl) return;

  if (!userAddress) {
    allocationQty = null;
    setAllocationMessage("Connect wallet to see allocation");
    return;
  }

  if (!allocationQty) setAllocationMessage("Loading…");

  try {
    const [aave, aaveV4, morpho] = await Promise.all([
      loadAaveAllocationQty(userAddress),
      loadAaveV4AllocationQty(userAddress).catch((e) => {
        console.warn("Allocation: Aave V4 (Ethereum) data not loaded", e);
        return { btc: 0, eth: 0, usd: 0, details: [], failed: true };
      }),
      loadMorphoAllocationQty(userAddress).catch((e) => {
        console.warn("Allocation: Morpho data not loaded", e);
        return { btc: 0, usd: 0, details: [], failed: true };
      })
    ]);

    allocationQty = {
      btc: aave.btc + aaveV4.btc + morpho.btc,
      eth: aave.eth + aaveV4.eth,
      usd: aave.usd + aaveV4.usd + morpho.usd,
      morphoFailed: !!morpho.failed,
      v4Failed: !!aaveV4.failed,
      sources: {
        "Aave V3 (Arbitrum)": aave,
        "Aave V4 (Ethereum)": aaveV4,
        "Morpho (all chains)": morpho
      }
    };
    console.info("Allocation sources:", allocationQty.sources, "V4:", aaveV4.details, `Morpho (${morpho.method || "failed"}):`, morpho.details);

    await renderAllocation();
  } catch (e) {
    console.error("Failed to load allocation", e);
    setAllocationMessage("Unavailable");
  }
}

function fmtUsd(n) {
  return "$" + Math.round(n).toLocaleString("de-DE");
}

async function renderAllocation() {
  if (!allocationChartEl || !allocationQty) return;

  const prices = await getAllocationPrices();
  if (!Number.isFinite(prices.btc) || !Number.isFinite(prices.eth)) {
    setAllocationMessage("Waiting for prices…");
    return;
  }

  const items = [
    { key: "BTC", label: "BTC", usd: allocationQty.btc * prices.btc, qty: allocationQty.btc },
    { key: "ETH", label: "ETH", usd: allocationQty.eth * prices.eth, qty: allocationQty.eth },
    { key: "USD", label: "USD", usd: allocationQty.usd,               qty: allocationQty.usd }
  ];
  const total = items.reduce((s, it) => s + (Number.isFinite(it.usd) ? it.usd : 0), 0);

  if (!(total > 0)) {
    setAllocationMessage("No BTC / ETH / USD positions");
    return;
  }

  items.forEach((it) => { it.pct = (it.usd / total) * 100; });

  // --- Donut geometry (based on allocation-donut_Version4.svg) ---
  const cx = 68, cy = 70, r = 50, sw = 15;
  const C = 2 * Math.PI * r;
  const visible = items.filter((it) => it.pct > 0.05);
  const gap = visible.length > 1 ? sw + 4 : 0; // space between rounded segments

  let offset = 0;
  let segments = "";
  for (const it of items) {
    const len = (it.pct / 100) * C;
    if (it.pct > 0.05) {
      const dash = visible.length > 1 ? Math.max(len - gap, 0.01) : C;
      segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ALLOC_COLORS[it.key]}" stroke-width="${sw}"
        stroke-linecap="${visible.length > 1 ? "round" : "butt"}" transform="rotate(-90 ${cx} ${cy})"
        stroke-dasharray="${dash.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-(offset + gap / 2)).toFixed(2)}"
        filter="url(#allocGlow)"><title>${it.label}: ${it.pct.toFixed(1)}% (${fmtUsd(it.usd)})</title></circle>`;
    }
    offset += len;
  }

  let legend = "";
  items.forEach((it, i) => {
    const y = 34 + i * 38;
    legend += `<g><title>${it.label}: ${fmtUsd(it.usd)}</title>
      <circle cx="152" cy="${y - 4}" r="6" fill="${ALLOC_COLORS[it.key]}"/>
      <text x="166" y="${y}" class="alloc-lbl">${it.label}</text>
      <text x="292" y="${y}" class="alloc-pct" text-anchor="end">${it.pct.toFixed(1)}%</text>
      <text x="166" y="${y + 15}" class="alloc-usd">${fmtUsd(it.usd)}</text></g>`;
  });

  allocationChartEl.innerHTML = `
    <svg class="allocation-svg" viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Assets allocation donut">
      <defs>
        <filter id="allocGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${sw}"/>
      ${segments}
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" class="alloc-val">100%</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" class="alloc-sub">${fmtUsd(total)}</text>
      ${legend}
    </svg>`;

  // Hover: per-source breakdown (quantities) + any source that failed
  const fmtQ = (q) => (q > 0 ? (q < 1 ? q.toFixed(6) : q.toFixed(2)) : "0");
  const lines = Object.entries(allocationQty.sources || {}).map(([name, s]) =>
    `${name}: BTC ${fmtQ(s.btc)} · ETH ${fmtQ(s.eth || 0)} · USD ${fmtQ(s.usd)}${s.failed ? " (not loaded)" : ""}`);
  allocationChartEl.title = lines.join("\n");
}

setInterval(() => {
  if (currentAddress) loadAllocation(currentAddress);
}, 10 * 60 * 1000);


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

    function ensureMoveControls() {
      if (!moveFolderBtn) moveFolderBtn = document.getElementById("defiMoveFolderBtn");
      if (!moveFolderList) moveFolderList = document.getElementById("defiMoveFolderList");

      if (!moveFolderBtn) {
        moveFolderBtn = document.createElement("button");
        moveFolderBtn.id = "defiMoveFolderBtn";
        moveFolderBtn.type = "button";
        moveFolderBtn.className = "defi-context-btn";
        moveFolderBtn.textContent = "Move to folder";
        moveFolderBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          ensureMoveControls();
          if (!moveFolderList) return;
          moveFolderList.style.display = moveFolderList.style.display === "none" ? "block" : "none";
        });
      }

      if (!moveFolderList) {
        moveFolderList = document.createElement("div");
        moveFolderList.id = "defiMoveFolderList";
        moveFolderList.style.display = "none";
      }

      // STRICT ORDER:
      // [Rename folder]
      // [Delete folder]
      // [Move to folder]
      // [Move list]
      // [Delete site]
      if (moveFolderBtn.parentNode !== defiItemContextMenu) {
        defiItemContextMenu.appendChild(moveFolderBtn);
      }
      if (moveFolderList.parentNode !== defiItemContextMenu) {
        defiItemContextMenu.appendChild(moveFolderList);
      }

      // Ensure delete site is always LAST and outside list
      if (defiDeleteSiteBtn.parentNode === defiItemContextMenu) {
        defiItemContextMenu.appendChild(defiDeleteSiteBtn);
      }

      return { moveFolderBtn, moveFolderList };
    }

    function resetMoveState() {
      pendingMoveSiteId = null;
      pendingMoveSiteCurrentFolderId = null;
      ensureMoveControls();
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
      ensureMoveControls();

      if (mode === "site") {
        defiRenameFolderBtn.style.display = "none";
        defiDeleteFolderBtn.style.display = "none";
        defiDeleteSiteBtn.style.display = "block";

        moveFolderBtn.style.display = "block";
        moveFolderList.style.display = "none";
      } else {
        defiRenameFolderBtn.style.display = "block";
        defiDeleteFolderBtn.style.display = "block";
        defiDeleteSiteBtn.style.display = "none";

        moveFolderBtn.style.display = "none";
        moveFolderList.style.display = "none";
      }
    }

    function buildMoveFolderList() {
      ensureMoveControls();
      moveFolderList.innerHTML = "";

      // Unassigned target
      const unassignedBtn = document.createElement("button");
      unassignedBtn.type = "button";
      unassignedBtn.className = "defi-context-btn";
      unassignedBtn.textContent = "Unassigned";
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

        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (pendingMoveSiteId == null) return;

          const targetId = Number(folder.id);
          const currentId = pendingMoveSiteCurrentFolderId == null ? null : Number(pendingMoveSiteCurrentFolderId);

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
      pendingMoveSiteCurrentFolderId =
        siteFolderId == null || siteFolderId === "" ? null : Number(siteFolderId);

      buildMoveFolderList();

      defiItemContextMenu.style.left = `${x}px`;
      defiItemContextMenu.style.top = `${y}px`;
      defiItemContextMenu.classList.add("visible");
    }

    function showFolderItemContextMenu(x, y, folderId) {
      if (folderId == null || folderId === "") return;

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
      const rawUrl = String(site.url || "").trim();
      // Ensure absolute URL (e.g. "app.aave.com" -> "https://app.aave.com")
      const siteUrl = !rawUrl ? "#" : /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

      a.href = siteUrl;
      // LMB opens the site in a NEW tab; the DeFi dashboard tab stays open
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = String(site.label || makeEdgeLikeLabel(site.url));
      a.dataset.id = String(site.id);
      a.dataset.folderId = site.folder_id == null ? "" : String(site.folder_id);

      a.addEventListener("click", (e) => {
        e.stopPropagation();
        // Native target="_blank" opens the new tab; only block empty links
        if (siteUrl === "#") e.preventDefault();
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
          .filter((f, i, arr) => arr.findIndex((x) => String(x.id) === String(f.id)) === i)
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

    ensureMoveControls();

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

      const raw = folderRow.dataset.folderId;
      if (raw === "__BACK__" || raw === "" || raw == null) {
        hideItemContextMenu();
        return;
      }

      showFolderItemContextMenu(e.clientX, e.clientY, Number(raw));
    }, true);

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

    defiRenameFolderBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (pendingRenameFolderId == null) {
        hideItemContextMenu();
        return;
      }

      const folder = defiFoldersCache.find((f) => String(f.id) === String(pendingRenameFolderId));
      const currentName = folder?.name || "";

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

    siteDialogCancelBtn.addEventListener("click", () => closeSiteDialog());

    siteDialogBackdrop.addEventListener("click", (e) => {
      if (e.target === siteDialogBackdrop) closeSiteDialog();
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
    // Markdown: check extension BEFORE text/plain (Windows often reports .md as "" or text/plain)
    if (lower.endsWith(".md") || lower.endsWith(".markdown") || type === "text/markdown" || type === "text/x-markdown") return "md";
    if (lower.endsWith(".txt") || type === "text/plain") return "txt";
    return null;
  }

  // A stored file is Markdown if kind === "md" OR its name ends with .md/.markdown
  // (second rule covers files saved with kind "txt" by the backend fallback below)
  function isMarkdownFile(f) {
    const lower = String(f?.name || "").toLowerCase();
    return f?.kind === "md" || lower.endsWith(".md") || lower.endsWith(".markdown");
  }

  // Safe JSON for embedding inside <script> in the generated page
  function jsonForScript(value) {
    return JSON.stringify(String(value ?? ""))
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function buildMarkdownPage(name, content) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"><\/script>
<style>
  body{margin:0;background:#0b1020;color:#e9eeff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;}
  .md{max-width:920px;margin:0 auto;padding:28px 24px 60px;}
  .md h1,.md h2,.md h3,.md h4{color:#ffffff;line-height:1.25;margin:1.4em 0 .6em;}
  .md h1{font-size:2em;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:.3em;}
  .md h2{font-size:1.5em;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:.3em;}
  .md a{color:#2ebac6;}
  .md code{background:rgba(255,255,255,.08);padding:.15em .4em;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;}
  .md pre{background:#11152a;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px 16px;overflow:auto;}
  .md pre code{background:none;padding:0;}
  .md blockquote{margin:0;padding:.2em 1em;color:#9aa4d8;border-left:4px solid #2ebac6;background:rgba(46,186,198,.06);}
  .md table{border-collapse:collapse;margin:1em 0;display:block;overflow:auto;}
  .md th,.md td{border:1px solid rgba(255,255,255,.14);padding:6px 12px;}
  .md th{background:#151a30;color:#ffffff;}
  .md tr:nth-child(even) td{background:rgba(255,255,255,.03);}
  .md hr{border:none;border-top:1px solid rgba(255,255,255,.12);margin:2em 0;}
  .md img{max-width:100%;}
  .md input[type=checkbox]{margin-right:.4em;}
  pre.raw{margin:0;padding:20px;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
</style>
</head>
<body>
<div id="md" class="md"></div>
<script>
  (function () {
    var src = ${jsonForScript(content)};
    var el = document.getElementById("md");
    try {
      if (!window.marked || !window.DOMPurify) throw new Error("renderer not loaded");
      el.innerHTML = DOMPurify.sanitize(marked.parse(src, { gfm: true, breaks: false }));
    } catch (e) {
      // Fallback: show raw markdown text if CDN is unavailable
      var pre = document.createElement("pre");
      pre.className = "raw";
      pre.textContent = src;
      el.replaceWith(pre);
    }
  })();
<\/script>
</body>
</html>`;
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
      empty.textContent = "No SVG/TXT/MD files yet";
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
    input.accept = ".svg,.txt,.md,.markdown,image/svg+xml,text/plain,text/markdown";
    input.style.display = "none";

    input.addEventListener("change", async () => {
      try {
        const file = input.files && input.files[0];
        if (!file) return;

        const kind = fileKindFromNameAndType(file.name, file.type);
        if (!kind) {
          alert("Please select an SVG (*.svg), TXT (*.txt) or Markdown (*.md) file.");
          return;
        }

        const content = await file.text();

        if (kind === "svg" && !/<svg[\s>]/i.test(content)) {
          alert("Selected SVG file does not look valid.");
          return;
        }

        try {
          await insertStrategyFile({
            name: file.name,
            kind,
            content
          });
        } catch (err) {
          // If backend/DB only accepts "svg"/"txt", store Markdown as "txt".
          // The .md file name is kept, so it is still rendered as Markdown on open.
          if (kind !== "md") throw err;
          console.warn("Backend rejected kind 'md', retrying as 'txt'", err);
          await insertStrategyFile({
            name: file.name,
            kind: "txt",
            content
          });
        }

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

    if (isMarkdownFile(f)) {
      html = buildMarkdownPage(f.name, f.content);
    } else if (f.kind === "svg") {
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

// ================== TA DATA GRAPH ==================

const taChartCanvas = document.getElementById("taDataChart");
const taChartStatus = document.getElementById("taChartStatus");
const taChartTooltip = document.getElementById("taChartTooltip");

let taChartHoverPoints = [];
const TA_CHART_HEIGHT = 520; // increased from 420 for better Y-axis precision

function setTaChartStatus(text, kind = "") {
  if (!taChartStatus) return;
  taChartStatus.textContent = text;
  taChartStatus.classList.remove("is-updated", "is-error");
  if (kind) taChartStatus.classList.add(kind);
}

function setTaChartLastUpdated(dateText) {
  if (!taChartStatus) return;
  taChartStatus.classList.remove("is-error");
  taChartStatus.classList.add("is-updated");
  taChartStatus.innerHTML = "";

  const label = document.createElement("span");
  label.className = "ta-chart-status-label";
  label.textContent = "Last Updated:";

  const date = document.createElement("span");
  date.className = "ta-chart-status-date";
  date.textContent = dateText;

  taChartStatus.append(label, " ", date);
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

// Y-axis: fixed precision grid — step 5, default range -40..40.
// If data ever exceeds ±40 the range grows symmetrically in multiples of 5.
const TA_Y_STEP = 5;
const TA_Y_DEFAULT_MAX = 40;

function computeSymmetricBounds(values) {
  let maxAbs = 0;

  for (const v of values) {
    const av = Math.abs(v);
    if (Number.isFinite(av) && av > maxAbs) maxAbs = av;
  }

  const roundedMax = Math.max(
    TA_Y_DEFAULT_MAX,
    Math.ceil(maxAbs / TA_Y_STEP) * TA_Y_STEP
  );

  return {
    min: -roundedMax,
    max: roundedMax,
    step: TA_Y_STEP
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
  const cssHeight = TA_CHART_HEIGHT;

  taChartCanvas.width = Math.floor(cssWidth * dpr);
  taChartCanvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const bg = "#0b1020";
  const grid = "rgba(255,255,255,0.14)";       // minor pointer lines (every 5)
  const gridMajor = "rgba(255,255,255,0.26)";  // major pointer lines (every 10)
  const axis = "rgba(255,255,255,0.28)";
  const text = "#cfd5ff";
  const zeroAxis = "rgba(255,255,255,0.45)";
  const green = "#16c784";
  const red = "#ea3943";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const margin = { top: 20, right: 20, bottom: 70, left: 56 };
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

  const yTickCount = Math.round((yMax - yMin) / yStep);

  for (let k = 0; k <= yTickCount; k++) {
    const v = yMin + k * yStep;
    const yy = Math.round(yToPx(v)) + 0.5; // crisp 1px lines
    const isZero = Math.abs(v) < 1e-9;
    const isMajor = Math.abs(v % (yStep * 2)) < 1e-9;

    // Horizontal pointer line from Y-axis value across the plot
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(plotX, yy);
    ctx.lineTo(plotX + plotW, yy);
    if (isZero) {
      ctx.setLineDash([]);
      ctx.strokeStyle = zeroAxis;
      ctx.lineWidth = 1.5;
    } else {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = isMajor ? gridMajor : grid;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.restore();

    // Tick mark on the Y-axis
    ctx.beginPath();
    ctx.moveTo(plotX - 6, yy);
    ctx.lineTo(plotX, yy);
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = text;
    ctx.font = isMajor || isZero ? "bold 12px system-ui, sans-serif" : "12px system-ui, sans-serif";
    ctx.fillText(v.toFixed(0), plotX - 10, yy);
  }

  ctx.font = "12px system-ui, sans-serif";

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
      // Tooltip format: YYYY-MM-DD / value (e.g. 2026-09-24 / 5.82)
      valueText: `${p.xLabel} / ${p.y.toFixed(2)}`,
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
      setTaChartLastUpdated(formatTaDateLabel(latestRow.created_at_minsk));
    } else {
      setTaChartStatus("");
    }

    drawTaDataChart(filteredRows);
  } catch (e) {
    console.error("Failed to load TA chart", e);
    setTaChartStatus(`Error: ${e?.message || e}`, "is-error");
    drawTaDataChart([]);
  }
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
  loadGasTracker();
  loadFearGreed();
  loadPuell();

  loadTotalAssets();
  loadDefiAssets();
  loadAvgBtc();
  loadAvgEth();
  loadPnlAssets();
  loadPercentageAssets();
  loadAssetsLastUpdated();
  loadAllocation(null);
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
      loadAllocation(saved);
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
