import { ObjectId } from "mongodb";

export enum ServiceType {
  PIN = "pin",
  BUYBOT = "buybot",
  COMBO = "combo",
}

export enum BlockchainNetwork {
  BSC = "bsc",
  ETH = "ethereum",
  BASE = "base",
}

export enum PaymentStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  FAILED = "failed",
}

export enum TemplateStatus {
  PENDING = "pending",
  APPROVED = "approved", 
  REJECTED = "rejected",
}

export interface MediaAttachment {
  fileId: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  mediaType: 'photo' | 'video' | 'animation' | 'document' | 'video_note';
  width?: number;
  height?: number;
  duration?: number;
  uploadedAt: Date;
}

export interface SocialLinks {
  twitter?: string;
  telegram?: string;
  discord?: string;
  website?: string;
}

export interface ProjectDetails {
  name: string;
  socialLinks: SocialLinks;
  contractAddress: string;
  blockchain: BlockchainNetwork;
  description?: string;
}

export interface ServiceConfig {
  type: ServiceType;
  startDate: Date;
  endDate: Date;
  pinnedPosts?: number;
}

export interface PaymentInfo {
  network: BlockchainNetwork;
  amount: number;
  walletAddress: string;
  txnHash?: string;
  status: PaymentStatus;
  confirmedAt?: Date;
  failedAt?: Date;
}

export interface Order {
  _id?: ObjectId | string;
  userId: number;
  username?: string;
  projectDetails: ProjectDetails;
  serviceConfig: ServiceConfig;
  paymentInfo: PaymentInfo;
  totalPrice: number;
  mediaAttachments: MediaAttachment[];
  templateStatus: TemplateStatus;
  templateSentAt?: Date;
  templateApprovedAt?: Date;
  templateRejectedAt?: Date;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  userId: number;
  step: string;
  data: any;
  createdAt: Date;
}
