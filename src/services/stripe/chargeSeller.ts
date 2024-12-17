import { supabase } from '../../config/supabase';
import { logger } from '../utils/logger';

interface ChargeSellerResult {
  success: boolean;
  error?: string;
}

export async function chargeSeller(sellerId: string, orderId: string): Promise<ChargeSellerResult> {
  try {
    // Get seller's total orders
    const { data: seller } = await supabase
      .from('sellers')
      .select('total_orders, subscription_status, debt_amount')
      .eq('id', sellerId)
      .single();

    if (!seller) throw new Error('Seller not found');

    // Check if seller has debt
    if (seller.debt_amount > 0) {
      return {
        success: false,
        error: 'Previous subscription charge failed. Please clear outstanding balance.'
      };
    }

    // Only charge if past 3rd order and subscription is active
    if (seller.total_orders > 3 && seller.subscription_status === 'active') {
      const response = await fetch('/.netlify/functions/charge-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, orderId }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        // Record failed charge
        await supabase.rpc('record_failed_charge', {
          p_seller_id: sellerId,
          p_amount: 10.00 // $10 subscription fee
        });

        const error = await response.json();
        return {
          success: false,
          error: error.error || 'Failed to charge seller'
        };
      }

      logger.info('Successfully charged seller for order:', { sellerId, orderId });
    }
    return { success: true };
  } catch (err) {
    logger.error('Error charging seller:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to process charge'
    };
  }
}