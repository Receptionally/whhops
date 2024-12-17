export interface OrderData {
  sellerId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  stripeCustomerId: string;
  stripeAccountId: string;
  stripePaymentIntent: string;
  stackingIncluded: boolean;
  stackingFee: number;
  deliveryFee: number;
  deliveryAddress: string;
  deliveryDistance: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}