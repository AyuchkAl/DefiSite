// Aave V3 Pool ABI: we only need getUserAccountData()
const POOL_ABI = [
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

// Aave V3 Pool contract on Arbitrum One (check Aave docs/addresses dashboard)
const POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // Arbitrum V3 Pool [web:16][web:17]

const connectButton = document.getElementById("connectButton");
const statusDiv = document.getElementById("status");
const resultDiv = document.getElementById("result");
const addressSpan = document.getElementById("address");
const hfSpan = document.getElementById("healthFactor");

async function connectAndLoad() {
  try {
    if (!window.ethereum) {
  statusDiv.textContent = "No browser wallet detected (MetaMask / Rabby).";
  return;
}

// Optional: show when it's Rabby
if (window.ethereum.isRabby) {
  console.log("Rabby wallet detected");
}

    statusDiv.textContent = "Connecting wallet...";
    await window.ethereum.request({ method: "eth_requestAccounts" });

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();

    // Arbitrum One chainId is 42161
    if (Number(network.chainId) !== 42161) {
      statusDiv.textContent = "Please switch MetaMask to the Arbitrum One network and try again.";
      return;
    }

    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    addressSpan.textContent = userAddress;

    statusDiv.textContent = "Reading your Aave account data...";

    const pool = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

    const data = await pool.getUserAccountData(userAddress);
    const healthFactorRaw = data.healthFactor; // BigInt

    // Convert from 18 decimals to a normal number
    const healthFactor = Number(ethers.formatUnits(healthFactorRaw, 18));

    hfSpan.textContent = healthFactor.toFixed(2);
    resultDiv.classList.remove("hidden");
    statusDiv.textContent = "Done.";
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Error: " + (err.message || err);
  }
}

connectButton.addEventListener("click", connectAndLoad);
