import React from "react";
import { useWallet } from "@/context/WalletContext";
import WalletConnected from "@/components/WalletConnected";
import WalletDisconnected from "@/components/WalletDisconnected";

const WalletAuth: React.FC = () => {
  const { walletAddress } = useWallet();
  return walletAddress ? <WalletConnected /> : <WalletDisconnected />;
};

export default WalletAuth;
