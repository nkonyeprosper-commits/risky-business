import Web3 from "web3";
import { config } from "../config";
import { BlockchainNetwork } from "../types";

export class BlockchainService {
  private web3Instances: Map<BlockchainNetwork, Web3> = new Map();

  constructor() {
    this.initializeWeb3Instances();
  }

  private initializeWeb3Instances(): void {
    this.web3Instances.set(BlockchainNetwork.BSC, new Web3(config.rpcUrls.bsc));
    this.web3Instances.set(
      BlockchainNetwork.ETH,
      new Web3(config.rpcUrls.ethereum)
    );
    this.web3Instances.set(
      BlockchainNetwork.BASE,
      new Web3(config.rpcUrls.base)
    );
  }

  private getWeb3Instance(network: BlockchainNetwork): Web3 {
    const web3 = this.web3Instances.get(network);
    if (!web3) {
      throw new Error(`Web3 instance not found for network: ${network}`);
    }
    return web3;
  }

  async validateTransaction(
    txnHash: string,
    network: BlockchainNetwork,
    expectedAmount: number,
    toAddress: string
  ): Promise<boolean> {
    try {
      const web3 = this.getWeb3Instance(network);

      // Basic hash format validation
      if (!this.isValidTxHash(txnHash)) {
        return false;
      }

      // Get transaction details
      const tx = await web3.eth.getTransaction(txnHash);
      if (!tx) {
        return false;
      }

      // Check if transaction is to our wallet
      if (tx.to?.toLowerCase() !== toAddress.toLowerCase()) {
        return false;
      }

      // Get transaction receipt to check status
      const receipt = await web3.eth.getTransactionReceipt(txnHash);
      if (!receipt || !receipt.status) {
        return false;
      }

      // For native token transfers, check value
      const valueInEth = parseFloat(
        web3.utils.fromWei(tx.value.toString(), "ether")
      );

      // Allow for small variations due to gas and precision
      const tolerance = 0.001; // 0.1% tolerance
      return Math.abs(valueInEth - expectedAmount) <= tolerance;
    } catch (error) {
      console.error("Transaction validation error:", error);
      return false;
    }
  }

  isValidTxHash(hash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  }

  getWalletAddress(network: BlockchainNetwork): string {
    console.log(network, "The network recieved");
    switch (network) {
      case BlockchainNetwork.BSC:
        return config.walletAddresses.bsc;
      case BlockchainNetwork.ETH:
        return config.walletAddresses.ethereum;
      case BlockchainNetwork.BASE:
        return config.walletAddresses.base;
      default:
        throw new Error(`Unsupported network: ${network}`);
    }
  }
}
