const hre = require("hardhat");

async function main() {
  console.log("Deploying Merxet to Hedera...");
  const Merxet = await hre.ethers.getContractFactory("Merxet");
  const marketplace = await Merxet.deploy();
  await marketplace.waitForDeployment();
  const address = await marketplace.getAddress();
  console.log(`Merxet deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
