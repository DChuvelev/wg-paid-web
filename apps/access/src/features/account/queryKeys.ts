export const accessRootKey = ['access'] as const;
export const accountKey = ['access', 'account'] as const;
export const configurationsKey = ['access', 'configurations'] as const;
export const billingPaymentsKey = ['access', 'billing', 'payments'] as const;
export const billingPaymentKey = (paymentId: string) => [...billingPaymentsKey, paymentId] as const;
export const referralsKey = ['access', 'referrals'] as const;
