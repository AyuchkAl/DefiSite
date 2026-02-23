// Aave V3 Pool ABI: we only need getUserAccountData()
const POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

// Aave V3 Pool contract on Arbitrum One
const POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // Arbitrum V3 Pool

// Button / menu elements
const connectButton  = document.getElementById("connectButton");
const connectLabel   = document.getElementById("connectLabel");
const walletMenu     = document.getElementById("walletMenu");
const disconnectBtn  = document.getElementById("disconnectButton");
const menuAddress    = document.getElementById("menuAddress");

// Main UI elements
const statusDiv   = document.getElementById("status");
const resultDiv   = document.getElementById("result");
const addressSpan = document.getElementById("address");
const hfValueEl   = document.getElementById("hfValue");

let currentAddress = null;

// Shorten address like Aave (0x1234...abcd)
function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// Set connected UI: button shows address, result is visible
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
    cls = "hf-danger";      // liquidation
  } else if (hf < 1.5) {
    cls = "hf-warning";     // close to liquidation
  } else {
    cls = "hf-safe";        // safe
  }

  hfValueEl.classList.add(cls);
  hfValueEl.textContent = hf.toFixed(2);
}

async function connectAndLoad() {
  try {
    if (!window.ethereum) {
      statusDiv.textContent = "No browser wallet detected (MetaMask / Rabby).";
      return;
    }

    // If already connected → toggle disconnect menu (like Aave)
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

connectButton.addEventListener("click", connectAndLoad);

disconnectBtn.addEventListener("click", () => {
  setDisconnectedUI();
});

// Close wallet menu when clicking outside
document.addEventListener("click", (e) => {
  if (!walletMenu.classList.contains("visible")) return;
  if (!e.target.closest(".wallet-container")) {
    walletMenu.classList.remove("visible");
  }
});

// Try to auto-restore connection on load
window.addEventListener("load", async () => {
  try {
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
