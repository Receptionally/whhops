import { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { ENV } from '../../src/config/env';
import { supabase } from '../../src/config/supabase';

const stripe = new Stripe(ENV.stripe.secretKey, {
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
    const { customerName, email, amount, productId } = JSON.parse(event.body || '{}');

    // Get the first connected account
    const { data: accounts } = await supabase
      .from('connected_accounts')
      .select('*')
      .order('connected_at', { ascending: false })
      .limit(1);

    if (!accounts || accounts.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No connected Stripe accounts found' }),
      };
    }

    const connectedAccountId = accounts[0].stripe_account_id;

    // Create a PaymentIntent on the connected account
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        customerName,
        email,
        productId,
      },
      application_fee_amount: Math.round(amount * 0.1), // 10% platform fee
    }, {
      stripeAccount: connectedAccountId,
    });

    // Save the order to Supabase
    await supabase.from('orders').insert([
      {
        customer_name: customerName,
        product_name: productId,
        quantity: 1,
        total_amount: amount / 100,
        status: 'pending',
        stripe_payment_id: paymentIntent.id,
        stripe_account_id: connectedAccountId,
        customer_email: email,
      },
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        publishableKey: ENV.stripe.publishableKey,
        accountId: connectedAccountId,
      }),
    };
  } catch (error) {
    console.error('Payment Creation Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to create payment' }),
    };
  }
};