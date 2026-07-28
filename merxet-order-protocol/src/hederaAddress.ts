export type SolidityAddress = `0x${string}`;

export function normalizeSolidityAddress(value: string): SolidityAddress | null {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase() as SolidityAddress;
}

export function solidityEntityAddressToId(value: string): string | null {
  const address = normalizeSolidityAddress(value);
  if (!address) {
    return null;
  }

  const bytes = address.slice(2);
  return [
    BigInt(`0x${bytes.slice(0, 8)}`),
    BigInt(`0x${bytes.slice(8, 24)}`),
    BigInt(`0x${bytes.slice(24)}`),
  ].join(".");
}
