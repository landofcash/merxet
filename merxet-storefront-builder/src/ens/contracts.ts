import {Interface, id, namehash, dnsEncode, concat, keccak256} from 'ethers';

// Verified against ENS contracts-v2 deployment artifacts at this commit, not ENSv1.
export const ARTIFACT_COMMIT = '97a57293f3b4279d94b571e678edb53ce62638f4';
export const DEPLOYMENTS = {
  ethRegistry: '0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2', rootRegistry: '0x8115186e8f2e0b0281e86ab91f0f48ba90364354',
  registryImpl: '0x624a25d67b59d587752ebec8dded8827dae52050', resolverImpl: '0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e',
  factory: '0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef', universalResolver: '0xeeeeeeee14d718c2b47d9923deab1335e144eeee',
};
const eac = [
  'function roles(uint256 resource,address account) view returns (uint256)',
  'function hasRoles(uint256 resource,uint256 roleBitmap,address account) view returns (bool)',
  'function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)',
  'function grantRootRoles(uint256 roleBitmap,address account) returns (bool)',
  'function revokeRootRoles(uint256 roleBitmap,address account) returns (bool)',
];
export const registryAbi = new Interface([...eac,
  'function initialize(address rootAccount,uint256 roleBitmap)',
  'function getState(uint256 anyId) view returns ((uint8 status,uint64 expiry,address latestOwner,uint256 tokenId,uint256 resource) state)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getSubregistry(string label) view returns (address)', 'function getResolver(string label) view returns (address)',
  'function getParent() view returns (address parent,string label)', 'function setParent(address parent,string label)',
  'function setSubregistry(uint256 anyId,address registry)', 'function setResolver(uint256 anyId,address resolver)',
  'function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256)',
]);
export const resolverAbi = new Interface([...eac,
  'function initialize(address admin,uint256 roleBitmap,bytes[] setters)',
  'function authorizeTextRoles(bytes toName,string key,address account,bool grant) returns (bool)',
  'function setText(bytes32 node,string key,string value)', 'function text(bytes32 node,string key) view returns (string)',
  'function multicall(bytes[] calls) returns (bytes[])',
]);
export const factoryAbi = new Interface([
  'function deployProxy(address implementation,uint256 salt,bytes data) returns (address proxy)',
  'function verifyContract(address proxy) view returns (address implementation)',
]);
export const universalAbi = new Interface(['function resolve(bytes name,bytes data) view returns (bytes result,address resolver)']);
export const roles = {registrar: 1n, setParent: 1n << 8n, setResolver: 1n << 24n, setSubregistry: 1n << 20n, setText: 1n << 4n};
export const withAdmin = (value: bigint) => value | (value << 128n);
export const registryAdminRoles = withAdmin([0n, 4n, 8n, 12n, 16n, 20n, 24n, 36n, 124n].reduce((a, b) => a | (1n << b), 0n)) | (1n << 156n);
export const nameAdminRoles = withAdmin(roles.setResolver | roles.setSubregistry);
export const resolverAdminRoles = withAdmin([0n, 4n, 8n, 12n, 16n, 20n, 24n, 28n, 32n, 36n, 124n].reduce((a, b) => a | (1n << b), 0n));
export const TEXT_KEYS = ['url', 'description', 'com.merxet.shopId', 'com.merxet.catalog', 'com.merxet.account', 'com.merxet.network'] as const;
export const textResource = (name: string, key: string) => BigInt(keccak256(concat([namehash(name), id(key)])));
export {id, namehash, dnsEncode};
