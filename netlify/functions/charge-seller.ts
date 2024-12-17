import { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { supabase } from './utils/supabase';
import { logger } from './utils/logger';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUBSCRIPTION_FEE = 1000; // $10 in cents

if (!STRIPE_SECRET_KEY) {
  throw new Error('Missing Stripe secret key');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { sellerId, orderId } = JSON.parse(event.body || '{}');

    // Get seller info with payment details
    const { data: seller } = await supabase
      .from('sellers')
      .select('*')
      .eq('id', sellerId)
      .single();

    if (!seller) {
      throw new Error('Seller not found');
    }

    // Check if seller has debt
    if (seller.debt_amount > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Previous subscription charge failed. Please clear outstanding balance.'
        }),
      };
    }

    // Only charge if past 3rd order and subscription is active
    if (seller.total_orders > 3 && seller.subscription_status === 'active') {
      // Verify customer and payment method exist
      if (!seller.stripe_customer_id) {
        throw new Error('No Stripe customer found');
      }

      // Get customer's default payment method
      const customer = await stripe.customers.retrieve(seller.stripe_customer_id);
      if (!customer || customer.deleted) {
        throw new Error('Customer not found');
      }

      const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
      if (!defaultPaymentMethod) {
        throw new Error('No default payment method found for customer');
      }

      // Create and confirm payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: SUBSCRIPTION_FEE,
        currency: 'usd',
        customer: seller.stripe_customer_id,
        payment_method: defaultPaymentMethod as string,
        off_session: true,
        confirm: true,
        description: `Subscription charge for order ${orderId}`,
        metadata: {
          seller_id: sellerId,
          order_id: orderId,
          type: 'subscription_charge'
        }
      });

      // Record the payment intent
      await supabase
        .from('payment_intents')
        .insert([{
          seller_id: sellerId,
          order_id: orderId,
          stripe_payment_intent_id: paymentIntent.id,
          amount: SUBSCRIPTION_FEE,
          status: paymentIntent.status,
          type: 'subscription_charge'
        }]);

      logger.info('Successfully charged seller:', {
        sellerId,
        orderId,
        amount: SUBSCRIPTION_FEE
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true }),
      };
    }

    // No charge needed
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'No charge needed' }),
    };
  } catch (err) {
    logger.error('Error charging seller:', err);

    // Record failed charge if it's a payment error
    if (err instanceof Stripe.errors.StripeError) {
      try {
        await supabase.rpc('record_failed_charge', {
          p_seller_id: JSON.parse(event.body || '{}').sellerId,
          p_amount: SUBSCRIPTION_FEE / 100 // Convert cents to dollars
        });
      } catch (rpcError) {
        logger.error('Error recording failed charge:', rpcError);
      }
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : 'Failed to charge seller'
      }),
    };
  }
};