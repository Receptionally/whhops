import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { logger } from '../services/utils/logger';
import type { Order } from '../types/order';
import { chargeSeller } from '../services/stripe/chargeSeller';

export function useOrders(sellerId?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrders() {
      try {
        setLoading(true);
        setError(null);

        let query = supabase
          .from('order_management')
          .select('*')
          .order('created_at', { ascending: false });

        // If sellerId is provided, filter orders for that seller
        if (sellerId) {
          query = query.eq('seller_id', sellerId);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          throw fetchError;
        }

        // Charge seller if applicable
        if (sellerId) {
          await chargeSeller(sellerId, data[0].id);
        }

        logger.info(`Fetched ${data?.length || 0} orders`);
        setOrders(data || []);
      } catch (err) {
        logger.error('Error fetching orders:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, [sellerId]);

  return { orders, loading, error };
}