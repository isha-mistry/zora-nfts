import { createAccount } from "@turnkey/viem";
import { TurnkeyClient } from "@turnkey/http";
import {
  Address,
  encodeFunctionData,
  LocalAccount,
  Hex,
  parseEther,
  createWalletClient,
  http,
  createPublicClient,
  PublicClient,
  Account,
  WalletClient,
  Chain,
} from "viem";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import * as path from "path";
import * as dotenv from "dotenv";
import { readFile } from "fs/promises";
import { zoraMintsManagerImplABI } from "../abis/zoraMintsManagerImplABI";
import { abi as proxyDeployerAbi } from "../out/DeterministicUUPSProxyDeployer.sol/DeterministicUUPSProxyDeployer.json";
import * as chains from "viem/chains";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from `.env.local`
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function getChainNamePositionalArg() {
  // parse chain id as first argument:
  const chainName = process.argv[2];

  if (!chainName) {
    throw new Error("Must provide chain name as first argument");
  }

  return chainName;
}

function getChain(chainName: string): Chain {
  const allChains = Object.values(chains);
  
  const result = allChains.find((chain) => 
    chain.name.toLowerCase().replace(' ', '') === chainName.toLowerCase() ||
    chain.network === chainName
  );

  if (!result) {
    // Check if it's Arbitrum Sepolia specifically
    if (chainName.toLowerCase() === 'arbitrumsepolia' || chainName.toLowerCase() === 'arbitrum-sepolia') {
      return arbitrumSepolia;
    }
    throw new Error(`Chain ${chainName} not found`);
  }

  return result;
}

const loadTurnkeyAccount = async () => {
  console.log("Loading Turnkey account...");
  const httpClient = new TurnkeyClient(
    {
      baseUrl: "https://api.turnkey.com",
    },
    new ApiKeyStamper({
      apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
      apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
    }),
  );

  return await createAccount({
    client: httpClient,
    organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
    signWith: process.env.TURNKEY_PRIVATE_KEY_ID!,
    ethereumAddress: process.env.TURNKEY_TARGET_ADDRESS!,
  });
};

type DeterminsticContractConfig = {
  salt: Hex;
  creationCode: Hex;
  deployedAddress: Hex;
  constructorArgs: Hex;
  contractName: string;
};

type MintsDeterminsticConfig = {
  manager: DeterminsticContractConfig;
  mints1155: DeterminsticContractConfig;
};

type InitializationConfig = {
  proxyAdmin: Address;
  initialImplementationAddress: Address;
  initialImplementationCall: Hex;
};

const loadProxyDeployerAddress = async () => {
  console.log("Loading Proxy Deployer Address...");
  const proxyDeployerConfig = JSON.parse(
    await readFile(
      path.resolve(
        __dirname,
        "../deterministicConfig/proxyDeployer/params.json",
      ),
      "utf-8",
    ),
  );

  return proxyDeployerConfig.deployedAddress as Address;
};

const loadDeterministicTransparentProxyConfig = async (
  proxyName: string,
): Promise<MintsDeterminsticConfig> => {
  console.log(`Loading Deterministic Transparent Proxy Config for ${proxyName}...`);
  const filePath = path.resolve(
    __dirname,
    `../deterministicConfig/${proxyName}/params.json`,
  );

  const fileContents = JSON.parse(await readFile(filePath, "utf-8"));

  return fileContents as MintsDeterminsticConfig;
};

const validateIsValidSafe = async (
  address: Address,
  publicClient: PublicClient,
) => {
  console.log(`Validating Safe at address: ${address}...`);
  const safeAbi = [
    {
      constant: true,
      inputs: [],
      name: "getOwners",
      outputs: [
        {
          name: "",
          type: "address[]",
        },
      ],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  const owners = await publicClient.readContract({
    abi: safeAbi,
    functionName: "getOwners",
    address,
  });

  if (owners.length === 0) {
    throw new Error(`Invalid safe at address ${address}, no owners`);
  }
};

const generateInitializationConfig = async ({
  chainId,
  publicClient,
  mints1155Config,
}: {
  chainId: number;
  publicClient: PublicClient;
  mints1155Config: DeterminsticContractConfig;
}): Promise<InitializationConfig> => {
  console.log("Generating Initialization Config...");
  const chainConfigPath = path.resolve(
    __dirname,
    `../chainConfigs/${chainId}.json`,
  );
  const addressesPath = path.resolve(__dirname, `../addresses/${chainId}.json`);

  const chainConfig = JSON.parse(await readFile(chainConfigPath, "utf-8")) as {
    PROXY_ADMIN: Address;
  };

  const addresses = JSON.parse(await readFile(addressesPath, "utf-8")) as {
    MINTS_MANAGER_IMPL: Address;
  };

  const initialEthTokenId = 1n;
  const initialEthTokenPrice = parseEther("0.000777");

  const metadataBaseURI = "https://zora.co/assets/mints/metadata/";
  const contractURI = "https://zora.co/assets/mints/metadata/";

  const initialImplementationCall = encodeFunctionData({
    abi: zoraMintsManagerImplABI,
    functionName: "initialize",
    args: [
      chainConfig.PROXY_ADMIN,
      mints1155Config.salt,
      mints1155Config.creationCode,
      initialEthTokenId,
      initialEthTokenPrice,
      metadataBaseURI,
      contractURI,
    ],
  });

  return {
    proxyAdmin: chainConfig.PROXY_ADMIN,
    initialImplementationAddress: addresses.MINTS_MANAGER_IMPL,
    initialImplementationCall,
  };
};

const makeClientsFromAccount = async ({
  chain,
  account,
}: {
  chain: Chain;
  account: LocalAccount;
}): Promise<{
  publicClient: PublicClient;
  walletClient: WalletClient;
}> => {
  console.log("Creating Public and Wallet Clients from Account...");
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  }) as PublicClient;

  return {
    walletClient,
    publicClient,
  };
};

async function deployMintsManagerProxy({
  publicClient,
  walletClient,
  account,
  determinsticTransparentProxyConfig,
  initializationConfig,
  proxyDeployerAddress,
}: {
  determinsticTransparentProxyConfig: MintsDeterminsticConfig;
  initializationConfig: InitializationConfig;
  proxyDeployerAddress: `0x${string}`;
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
}) {
  console.log("Preparing to simulate contract deployment...");
  console.log("Proxy Deployer Address:", proxyDeployerAddress);
  console.log("Deployed Address:", determinsticTransparentProxyConfig.manager.deployedAddress);
  console.log("Salt:", determinsticTransparentProxyConfig.manager.salt);
  console.log("Creation Code:", determinsticTransparentProxyConfig.manager.creationCode);
  console.log("Initial Implementation Address:", initializationConfig.initialImplementationAddress);
  console.log("Initial Implementation Call:", initializationConfig.initialImplementationCall);

  try {
    const { request } = await publicClient.simulateContract({
      abi: proxyDeployerAbi,
      address: proxyDeployerAddress,
      functionName: "safeCreate2AndUpgradeToAndCall",
      args: [
        determinsticTransparentProxyConfig.manager.salt,
        determinsticTransparentProxyConfig.manager.creationCode,
        initializationConfig.initialImplementationAddress,
        initializationConfig.initialImplementationCall,
        determinsticTransparentProxyConfig.manager.deployedAddress,
      ],
      account,
    });

    console.log("Simulation successful, writing contract...");
    await walletClient.writeContract(request);
  } catch (error) {
    console.error("Simulation failed:", error);
    throw error;
  }
}


function printVerificationCommand({
  deployedAddress,
  constructorArgs,
  contractName,
  chainName,
}: DeterminsticContractConfig & { chainName: string }) {
  console.log("verify the contract with the following command:");

  console.log(
    `forge verify-contract  ${deployedAddress} ${contractName} $(chains ${chainName} --verify) --constructor-args ${constructorArgs}`,
  );
}

/// Deploy the mints manager and 1155 contract deteriministically using turnkey
async function main() {
  try {
    console.log("Starting deployment script...");

    const turnkeyAccount = await loadTurnkeyAccount();
    console.log("Turnkey Account Loaded:", turnkeyAccount);

    const chainName = getChainNamePositionalArg();
    console.log("Chain Name:", chainName);

    const mintsProxyConfig = await loadDeterministicTransparentProxyConfig("mintsProxy");
    console.log("Mints Proxy Config Loaded:", mintsProxyConfig);

    const chain = getChain(chainName);
    console.log("Chain Loaded:", chain);

    const { publicClient, walletClient } = await makeClientsFromAccount({
      chain,
      account: turnkeyAccount,
    });
    console.log("Clients Created:", { publicClient, walletClient });

    const initializationConfig = await generateInitializationConfig({
      chainId: chain.id,
      publicClient,
      mints1155Config: mintsProxyConfig.mints1155,
    });
    console.log("Initialization Config Generated:", initializationConfig);

    const proxyDeployerAddress = await loadProxyDeployerAddress();
    console.log("Proxy Deployer Address Loaded:", proxyDeployerAddress);

    await deployMintsManagerProxy({
      determinsticTransparentProxyConfig: mintsProxyConfig,
      initializationConfig,
      proxyDeployerAddress,
      publicClient,
      account: turnkeyAccount,
      walletClient,
    });

    console.log(`${mintsProxyConfig.manager.contractName} contract deployed to ${mintsProxyConfig.manager.deployedAddress}`);

    printVerificationCommand({
      ...mintsProxyConfig.manager,
      chainName,
    });
    printVerificationCommand({
      ...mintsProxyConfig.mints1155,
      chainName,
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
