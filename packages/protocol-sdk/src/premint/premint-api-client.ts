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

  return convertGetPremintApiResponse(result);
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
