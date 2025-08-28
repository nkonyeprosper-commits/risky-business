import { ServiceType } from "../types";
import { config } from "../config";

export class PriceService {
  // NEW: Calculate price based on duration (hours)
  calculatePriceByDuration(durationHours: number, serviceType?: ServiceType): number {
    // Validate duration is acceptable (48h multiples or full weeks)
    if (!this.isValidDuration(durationHours)) {
      throw new Error(`Invalid duration: ${durationHours}h. Must be multiples of 48h or full weeks (168h).`);
    }

    // Convert to days for easier calculation
    const durationDays = durationHours / 24;
    
    // 1 week (7 days = 168h) = $150
    if (durationHours === 168) {
      return 150;
    }
    
    // For other durations, calculate by 2-day periods ($50 per 48h)
    const twoDayPeriods = Math.ceil(durationDays / 2);
    return twoDayPeriods * 50;
  }

  // LEGACY: Keep for backward compatibility (will be deprecated)
  calculatePrice(serviceType: ServiceType, pinnedPosts?: number, durationHours?: number): number {
    // If duration is provided, use new pricing
    if (durationHours) {
      return this.calculatePriceByDuration(durationHours, serviceType);
    }
    
    // Legacy pricing (48h default)
    const defaultDuration = 48;
    return this.calculatePriceByDuration(defaultDuration, serviceType);
  }

  // Validate duration follows the rules
  isValidDuration(durationHours: number): boolean {
    // Must be at least 48 hours (2 days minimum)
    if (durationHours < 48) {
      return false;
    }
    
    // Check if it's exactly 1 week
    if (durationHours === 168) {
      return true;
    }
    
    // Check if it's a multiple of 48 hours
    return durationHours % 48 === 0;
  }

  // Get pricing breakdown text
  getPricingBreakdown(durationHours: number): string {
    if (!this.isValidDuration(durationHours)) {
      return "Invalid duration";
    }

    if (durationHours === 168) {
      return "1 Week Special: $150";
    }

    const twoDayPeriods = Math.ceil(durationHours / 48);
    const price = this.calculatePriceByDuration(durationHours);
    
    if (twoDayPeriods === 1) {
      return "48 Hours: $50";
    }
    
    return `${twoDayPeriods} × 48h periods: $${price}`;
  }

  getServiceDescription(serviceType: ServiceType, durationHours?: number): string {
    const duration = durationHours || 48;
    const durationText = this.getDurationText(duration);
    
    switch (serviceType) {
      case ServiceType.PIN:
        return `Pin Service (${durationText})`;
      case ServiceType.BUYBOT:
        return `BuyBot Service (${durationText})`;
      case ServiceType.COMBO:
        return `Combo (Pin + BuyBot, ${durationText})`;
      default:
        return "Unknown Service";
    }
  }

  private getDurationText(hours: number): string {
    if (hours === 168) {
      return "1 week";
    } else if (hours >= 24) {
      const days = hours / 24;
      return `${days}${days === 1 ? ' day' : ' days'}`;
    } else {
      return `${hours}h`;
    }
  }

  // Get all standard duration options with prices
  getStandardDurationOptions(): Array<{duration: number, label: string, price: number}> {
    return [
      { duration: 48, label: "48 Hours (2 Days)", price: 50 },
      { duration: 96, label: "96 Hours (4 Days)", price: 100 },
      { duration: 168, label: "1 Week", price: 150 },
    ];
  }
}
