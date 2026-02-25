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
  hfValueEl.classList.remove("hf-safe", "hf-warning", "hf-danger");
  connectLabel.textContent = "Connect wallet";
  resultDiv.classList.add("hidden");
  walletMenu.classList.remove("visible");
  statusDiv.textContent = "";
  localStorage.removeItem("savedAddress");
}

function setHealthFactorDisplay(hf) {
  hfValueEl.classList.remove("hf-safe", "hf-warning", "hf-danger");
  let cls;
  if (hf < 1.0)      cls = "hf-danger";
  else if (hf < 1.5) cls = "hf-warning";
  else               cls = "hf-safe";
  hfValueEl.classList.add(cls);
  hfValueEl.textContent = hf.toFixed(2);
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
    const dataPr = new ethers.Contract(DATA_PROVIDER_ADDRESS, DATA_PROVIDER_ABI, provider);
    const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);

    // Global account data (base ≈ USD, 8 decimals)
    const ud = await pool.getUserAccountData(userAddress);
    const totalCollateralBase = Number(ethers.formatUnits(ud.totalCollateralBase, 8));
    const totalDebtBase       = Number(ethers.formatUnits(ud.totalDebtBase, 8));
    const hlThreshold         = Number(ud.currentLiquidationThreshold) / 10000;
    const healthFactor        = Number(ethers.formatUnits(ud.healthFactor, 18));

    setHealthFactorDisplay(healthFactor);

    if (totalDebtBase === 0) {
      liqEthBottomEl.textContent = "–";
      liqBtcBottomEl.textContent = "–";
      return;
    }

    // Helper to compute liq price for one asset
    async function assetLiqPrice(assetAddress, assetDecimals, outEl) {
      try {
        const [userRes, cfgRes] = await Promise.all([
          dataPr.getUserReserveData(assetAddress, userAddress),
          dataPr.getReserveConfigurationData(assetAddress),
        ]);

        const collateralAmt = Number(
          ethers.formatUnits(userRes.currentATokenBalance, assetDecimals)
        );
        if (collateralAmt === 0) {
          outEl.textContent = "–";
          return;
        }

        const assetLtv = getLiquidationThresholdFromConfig(cfgRes);

        const priceRaw = await oracle.getAssetPrice(assetAddress);
        const priceNow = Number(ethers.formatUnits(priceRaw, 8)); // oracle uses 8 decimals

        const liq = computeEthLiqPrice({
          totalDebtUsd: totalDebtBase,
          totalCollateralBaseUsd: totalCollateralBase,
          hlThreshold,
          ethCollateralAmount: collateralAmt,
          ethLtv: assetLtv,
          ethPriceNow: priceNow,
        });

        outEl.textContent = liq ? liq.toFixed(3) : "–";
      } catch (e) {
        console.error("Failed liq price for asset", assetAddress, e);
        outEl.textContent = "–";
      }
    }

    // ETH and BTC
    await Promise.all([
      assetLiqPrice(WETH_ADDRESS, 18, liqEthBottomEl),
      assetLiqPrice(WBTC_ADDRESS, 8,  liqBtcBottomEl),
    ]);
  } catch (e) {
    console.error("Failed to load Aave / liq price", e);
    liqEthBottomEl.textContent = "–";
    liqBtcBottomEl.textContent = "–";
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

// Auto‑restore + initial prices
window.addEventListener("load", () => {
  loadCryptoPrices();

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






