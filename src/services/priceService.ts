import { ServiceType } from "../types";
import { config } from "../config";

export class PriceService {
  calculatePrice(serviceType: ServiceType, pinnedPosts?: number): number {
    switch (serviceType) {
      case ServiceType.PIN:
        return (pinnedPosts || 1) * config.prices.pin;
      case ServiceType.BUYBOT:
        return config.prices.buybot;
      case ServiceType.COMBO:
        return config.prices.combo;
      default:
        throw new Error(`Unknown service type: ${serviceType}`);
    }
  }

  getServiceDescription(serviceType: ServiceType): string {
    switch (serviceType) {
      case ServiceType.PIN:
        return "Pin Service (48h)";
      case ServiceType.BUYBOT:
        return "BuyBot Service (48h)";
      case ServiceType.COMBO:
        return "Combo (Pin + BuyBot, 48h)";
      default:
        return "Unknown Service";
    }
  }
}
