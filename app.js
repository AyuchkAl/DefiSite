// Aave V3 Pool ABI: we only need getUserAccountData()
const POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

// Aave V3 Pool contract on Arbitrum One
const POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

// DOM elements
const connectButton = document.getElementById("connectButton");
const connectLabel  = document.getElementById("connectLabel");
const walletMenu    = document.getElementById("walletMenu");
const disconnectBtn = document.getElementById("disconnectButton");
const menuAddress   = document.getElementById("menuAddress");

const statusDiv   = document.getElementById("status");
const resultDiv   = document.getElementById("result");
const addressSpan = document.getElementById("address");
const hfValueEl   = document.getElementById("hfValue");

// New: BTC/ETH price elements
const btcPriceEl  = document.getElementById("btcPrice");
const ethPriceEl  = document.getElementById("ethPrice");

let currentAddress = null;

// Shorten address like 0x1234...abcd
function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// Set connected UI: header button + store address
function setConnectedUI(addr) {
  currentAddress = addr;
  addressSpan.textContent = addr;
  connectLabel.textContent = shortenAddress(addr);
  menuAddress.textContent = addr;
  resultDiv.classList.remove("hidden");
}

// Reset UI when disconnected
function setDisconnectedUI() {
  currentAddress = null;
  addressSpan.textContent = "";
  hfValueEl.textContent = "–";
  hfValueEl.classList.remove("hf-safe", "hf-warning", "hf-danger");
  connectLabel.textContent = "Connect wallet";
  resultDiv.classList.add("hidden");
  walletMenu.classList.remove("visible");
  statusDiv.textContent = "";
  localStorage.removeItem("savedAddress");
}

// Color the Health Factor like Aave
function setHealthFactorDisplay(hf) {
  hfValueEl.classList.remove("hf-safe", "hf-warning", "hf-danger");

  let cls;
  if (hf < 1.0) {
    cls = "hf-danger";
  } else if (hf < 1.5) {
    cls = "hf-warning";
  } else {
    cls = "hf-safe";
  }

  hfValueEl.classList.add(cls);
  hfValueEl.textContent = hf.toFixed(2);
}

// Load BTC & ETH prices from CoinGecko (public API) [web:176]
async function loadCryptoPrices() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
    );
    const data = await res.json();
    const btc = data.bitcoin?.usd;
    const eth = data.ethereum?.usd;

    if (btcPriceEl && btc) {
      btcPriceEl.textContent = "$" + btc.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (ethPriceEl && eth) {
      ethPriceEl.textContent = "$" + eth.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
  } catch (e) {
    console.error("Failed to load BTC/ETH prices", e);
  }
}

async function connectAndLoad() {
  try {
    if (!window.ethereum) {
      statusDiv.textContent = "No browser wallet detected (MetaMask / Rabby).";
      return;
    }

    // If already connected -> toggle dropdown menu
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

    // Arbitrum One chainId is 42161
    if (Number(network.chainId) !== 42161) {
      statusDiv.textContent = "Please switch wallet to the Arbitrum One network and try again.";
      return;
    }

    statusDiv.textContent = "Reading your Aave account data...";

    const pool = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
    const data = await pool.getUserAccountData(userAddress);
    const healthFactorRaw = data.healthFactor;
    const healthFactor = Number(ethers.formatUnits(healthFactorRaw, 18));

    setHealthFactorDisplay(healthFactor);
    setConnectedUI(userAddress);
    statusDiv.textContent = "Done.";
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Error: " + (err.message || err);
  }
}

// Button events
connectButton.addEventListener("click", connectAndLoad);

disconnectBtn.addEventListener("click", () => {
  setDisconnectedUI();
});

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  if (!walletMenu.classList.contains("visible")) return;
  if (!e.target.closest(".wallet-container")) {
    walletMenu.classList.remove("visible");
  }
});

// Auto-restore connection if wallet still connected & load prices
window.addEventListener("load", async () => {
  try {
    // Load BTC & ETH prices for header
    loadCryptoPrices();

    if (!window.ethereum) return;
    const saved = localStorage.getItem("savedAddress");
    if (!saved) return;

    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts.includes(saved)) return;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network  = await provider.getNetwork();
    if (Number(network.chainId) !== 42161) return;

    statusDiv.textContent = "Reading your Aave account data...";

    const pool = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
    const data = await pool.getUserAccountData(saved);
    const healthFactorRaw = data.healthFactor;
    const healthFactor = Number(ethers.formatUnits(healthFactorRaw, 18));

    setHealthFactorDisplay(healthFactor);
    setConnectedUI(saved);
    statusDiv.textContent = "Loaded from previous connection.";
  } catch (err) {
    console.error(err);
  }
});
