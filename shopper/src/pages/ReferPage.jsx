import React from 'react';
import { ReferralView } from '../components/referral/ReferralView';

export function ReferPage() {
  return (
    <div className="min-h-screen bg-gray-50/60">
      <ReferralView mode="auto" />
    </div>
  );
}
