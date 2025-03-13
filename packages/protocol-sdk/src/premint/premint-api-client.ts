import {
  IHttpClient,
  httpClient as defaultHttpClient,
} from "../apis/http-api-base";
import { components, paths } from "../apis/generated/premint-api-types";
import { ZORA_API_BASE } from "../constants";
import { getApiNetworkConfigForChain } from "src/mint/subgraph-mint-getter";
import {
  PremintConfigVersion,
  PremintConfigWithVersion,
} from "chora-protocol-deployments";
import { Address, Hex } from "viem";
import {
  PremintCollectionFromApi,
  PremintFromApi,
  PremintSignatureRequestBody,
  PremintSignatureResponse,
  // convertGetPremintApiResponse,
  convertGetPremintOfCollectionApiResponse,
  encodePostSignatureInput,
} from "./conversions";
import { ContractCreationConfigOrAddress } from "./contract-types";

type PremintNextUIDGetType =
  paths["/signature/{chain_name}/{collection_address}/next_uid"]["get"];
type PremintNextUIDGetPathParameters =
  PremintNextUIDGetType["parameters"]["path"];
export type PremintNextUIDGetResponse =
  PremintNextUIDGetType["responses"][200]["content"]["application/json"];

type SignaturePremintGetType =
  paths["/signature/{chain_name}/{collection_address}/{uid}"]["get"];
export type PremintSignatureGetResponse =
  SignaturePremintGetType["responses"][200]["content"]["application/json"];

type SignaturePremintGetOfCollectionType =
  paths["/signature/{chain_name}/{collection_address}"]["get"];
export type PremintSignatureGetOfCollectionResponse =
  SignaturePremintGetOfCollectionType["responses"][200]["content"]["application/json"];

export type PremintCollection = PremintSignatureGetResponse["collection"];

export type BackendChainNames = components["schemas"]["ChainName"];

const postSignature = async ({
  // httpClient: { post, retries } = defaultHttpClient,
  ...data
}: PremintSignatureRequestBody & {
  httpClient?: Pick<IHttpClient, "retries" | "post">;
}): Promise<PremintSignatureResponse> =>
  {
    // Log the request data
    // try {
        /* @ts-ignore */
        const response : PremintSignatureResponse = await fetch('http://localhost:3003/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

    // }catch (e){
    //   console.log("Error: ", e)
    // }
    
    // await retries(() =>
    //   post<PremintSignatureResponse>(`${ZORA_API_BASE}premint/signature`, data)
    // );
    
    // // Log the response
    // console.log('POST Response:', response);
    
    return response;
  }

const getNextUID = async ({
  chainId,
  collection_address,
  httpClient: { retries, get } = defaultHttpClient,
}: Omit<PremintNextUIDGetPathParameters, "chain_name"> & {
  chainId: number;
  httpClient?: Pick<IHttpClient, "retries" | "get">;
}): Promise<PremintNextUIDGetResponse> =>
  {
    const data= {
      collection_address: collection_address,
      chainId: chainId
    }
  
    await fetch('http://localhost:3003/api/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    const response = retries(() =>
    get<PremintNextUIDGetResponse>(
      `${ZORA_API_BASE}premint/signature/${
        getApiNetworkConfigForChain(chainId).zoraBackendChainName
      }/${collection_address}/next_uid`,
    ),
  )
  return response
};

export const getSignature = async ({
  collectionAddress,
  uid,
  chainId,
  // httpClient: { retries, get } = defaultHttpClient,
}: {
  collectionAddress: Address;
  uid: number;
  chainId: number;
  httpClient?: Pick<IHttpClient, "retries" | "get">;
}): Promise<PremintFromApi> => {

  const data= {
    collectionAddress: collectionAddress,
    uid: uid, chainId: chainId, 
    premintConfigVersion: PremintConfigVersion.V2,
  }

  await fetch('http://localhost:3003/api/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
  });

  // const chainName = getApiNetworkConfigForChain(chainId).zoraBackendChainName;
  // const result = await retries(() =>
  //   get<PremintSignatureGetResponse>(
  //     `${ZORA_API_BASE}premint/signature/${chainName}/${collectionAddress.toLowerCase()}/${uid}`,
  //   ),
  // );

  const dummyPremintApiResponse: PremintFromApi = {
    collection: {
      additionalAdmins: [] as Address[],
      contractAdmin: "0xB351a70dD6E5282A8c84edCbCd5A955469b9b032" as Address,
      contractName: "Testing meeting 4",
      contractURI: "ipfs://bafkreifvk2zol6q5mvgysfwdcuvvm7aupaddqxxodrnvsuc3xh3kflk77m"
    },
    collectionAddress: collectionAddress,
    signature: "0xc92804f3f136f4e3199593b91cbfa7c4c7bac34523e21e128a03660e3f15e204413d773d12902d2930404814abca2372a6f5fb1b65aaf7343a7da9fba12c1afb1b" as Hex,
    signer: "" as Address,
    premint: {
      premintConfigVersion: PremintConfigVersion.V2,
      premintConfig:{
        deleted: false,
        uid: 1,
        version: 2,
        tokenConfig: {
          tokenURI: "ipfs://bafkreihjxutxq64vrd6yankodg7na53wslqxh4hlrxeukvobur7ps3e6de",
          maxSupply: BigInt(18446744073709551615),
          royaltyBPS: 1000,
          mintStart: BigInt(0),
          payoutRecipient: "0xB351a70dD6E5282A8c84edCbCd5A955469b9b032" as Address,
          createReferral: "0x0000000000000000000000000000000000000000" as Address,
          fixedPriceMinter: "0x227d5294B13EBC893E31494194532727A130Ed4B" as Address,
          pricePerToken: BigInt(0),
          mintDuration: BigInt(0),
          maxTokensPerAddress: BigInt(0),
        }
      }
    }
  };

  return dummyPremintApiResponse;
};

const getOfCollection = async ({
  collectionAddress,
  chainId,
  httpClient: { retries, get } = defaultHttpClient,
}: {
  collectionAddress: Address;
  chainId: number;
  httpClient?: Pick<IHttpClient, "retries" | "get">;
}) => {
  const chainName = getApiNetworkConfigForChain(chainId).zoraBackendChainName;
  const result = await retries(() =>
    get<PremintSignatureGetOfCollectionResponse>(
      `${ZORA_API_BASE}premint/signature/${chainName}/${collectionAddress.toLowerCase()}`,
    ),
  );

  return convertGetPremintOfCollectionApiResponse(result);
};

export interface IPremintGetter {
  get(params: {
    collectionAddress: Address;
    uid: number;
  }): Promise<PremintFromApi>;

  getOfCollection(params: {
    collectionAddress: Address;
  }): Promise<PremintCollectionFromApi>;
}

export interface IPremintAPI {
  get: IPremintGetter["get"];

  getOfCollection: IPremintGetter["getOfCollection"];

  getNextUID(collectionAddress: Address): Promise<number>;

  postSignature<T extends PremintConfigVersion>(
    params: {
      signature: Hex;
    } & PremintConfigWithVersion<T> &
      ContractCreationConfigOrAddress,
  ): Promise<PremintSignatureResponse>;
}

class PremintAPIClient implements IPremintAPI {
  chainId: number;
  httpClient: IHttpClient;

  constructor(chainId: number, httpClient?: IHttpClient) {
    this.chainId = chainId;
    this.httpClient = httpClient || defaultHttpClient;
  }
  postSignature: IPremintAPI["postSignature"] = ({
    signature,
    ...rest
  }): Promise<PremintSignatureResponse> => {
    const data = encodePostSignatureInput({
      ...rest,
      chainId: this.chainId,
      signature,
    });
    return postSignature({
      ...data,
      httpClient: this.httpClient,
    });
  };

  getNextUID: IPremintAPI["getNextUID"] = async (collectionAddress) =>
    (
      await getNextUID({
        collection_address: collectionAddress.toLowerCase(),
        chainId: this.chainId,
        httpClient: this.httpClient,
      })
    ).next_uid;

  get: IPremintAPI["get"] = async ({ collectionAddress, uid }) => {
    return getSignature({
      collectionAddress,
      uid,
      chainId: this.chainId,
      httpClient: this.httpClient,
    });
  };

  getOfCollection: IPremintAPI["getOfCollection"] = async ({
    collectionAddress,
  }) => {
    return getOfCollection({
      collectionAddress,
      chainId: this.chainId,
      httpClient: this.httpClient,
    });
  };
}

export { ZORA_API_BASE, PremintAPIClient };
