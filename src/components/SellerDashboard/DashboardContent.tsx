import React, { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { OnboardingPrompt } from './OnboardingPrompt';
import { SubscriptionAlert } from './Subscription/SubscriptionAlert';
import { Analytics } from './Analytics';
import { OrderList } from '../Orders/List';
import { ChargeHistory } from './ChargeHistory';
import { CustomerReviews } from './CustomerReviews';
import type { Seller } from '../../types/seller';

interface DashboardContentProps {
  seller: Seller;
}

export function DashboardContent({ seller }: DashboardContentProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Check for success message
    const success = sessionStorage.getItem('subscription_success');
    if (success) {
      setShowSuccess(true);
      sessionStorage.removeItem('subscription_success');
      // Hide success message after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, []);

  return (
    <div className="space-y-8">
      {showSuccess && (
        <div className="mb-6 bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
          <div className="flex">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <p className="text-sm text-green-700">
                Payment method successfully set up! You can now continue accepting orders.
              </p>
            </div>
          </div>
        </div>
      )}

      <OnboardingPrompt seller={seller} />
      <SubscriptionAlert sellerId={seller.id} />
      <Analytics sellerId={seller.id} />
      <OrderList sellerId={seller.id} />
      <ChargeHistory sellerId={seller.id} />
      <CustomerReviews sellerId={seller.id} />
    </div>
  );
}