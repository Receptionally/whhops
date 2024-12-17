import { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { supabase } from './utils/supabase';
import { logger } from './utils/logger';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

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
    const { sellerId, paymentMethodId } = JSON.parse(event.body || '{}');

    if (!sellerId || !paymentMethodId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // Get seller info
    const { data: seller } = await supabase
      .from('sellers')
      .select('*')
      .eq('id', sellerId)
      .single();

    if (!seller) {
      throw new Error('Seller not found');
    }

    logger.info('Creating customer for seller:', { sellerId });

    // Create customer
    const customer = await stripe.customers.create({
      payment_method: paymentMethodId,
      email: seller.email,
      name: seller.name || seller.business_name,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
      metadata: {
        seller_id: sellerId
      }
    });

    // Get payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!paymentMethod.card) {
      throw new Error('Invalid payment method');
    }

    // Update seller with card info
    const { error: updateError } = await supabase
      .from('sellers')
      .update({
        stripe_customer_id: customer.id,
        card_last4: paymentMethod.card.last4,
        card_brand: paymentMethod.card.brand,
        default_payment_method: paymentMethodId,
        subscription_status: 'active',
        subscription_start_date: new Date().toISOString(),
        setup_intent_status: 'succeeded'
      })
      .eq('id', sellerId);

    if (updateError) throw updateError;

    logger.info('Customer created successfully:', { 
      customerId: customer.id,
      sellerId
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        customerId: customer.id,
      }),
    };
  } catch (err) {
    logger.error('Error creating customer:', err);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : 'Failed to create customer'
      }),
    };
  }
};