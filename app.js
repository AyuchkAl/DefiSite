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

// Fear & Greed (previous version)
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

// ================== FEAR & GREED (previous version) ==================

// Alternative.me API (daily updates)
async function loadFearGreed() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1&format=json");
    const json = await res.json();

    const item = json?.data?.[0];
    if (!item) throw new Error("No Fear & Greed data returned");

    const value = Number(item.value); // 0..100
    const label = String(item.value_classification || "").toLowerCase();

    if (fgValueEl) fgValueEl.textContent = Number.isFinite(value) ? String(value) : "–";
    if (fgLabelEl) fgLabelEl.textContent = label ? label : "–";

    // Needle: map 0..100 => -90..+90 degrees
    if (fgNeedleEl && Number.isFinite(value)) {
      const deg = -90 + (value / 100) * 180;
      fgNeedleEl.setAttribute("transform", `rotate(${deg} 110 110)`);
    }
  } catch (e) {
    console.error("Failed to load Fear & Greed index", e);
    if (fgValueEl) fgValueEl.textContent = "–";
    if (fgLabelEl) fgLabelEl.textContent = "Unavailable";
  }
}

/* -------------- rest of your app.js remains unchanged -------------- */
/* Keep your existing loadCryptoPrices, loadAaveDataForUser, connectAndLoad,
   and window load/setInterval logic exactly as you already have it,
   including calling loadFearGreed() on load and in the interval. */
