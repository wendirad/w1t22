import logger from '../../lib/logger';

export interface PaymentAdapterResult {
  success: boolean;
  transactionId: string;
  status: 'completed' | 'pending' | 'failed';
  metadata: Record<string, any>;
}

export interface PaymentAdapter {
  name: string;
  supports(method: string): boolean;
  charge(params: {
    amount: number;
    currency: string;
    orderId: string;
    invoiceId: string;
    method: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentAdapterResult>;
  refund(transactionId: string, amount: number): Promise<PaymentAdapterResult>;
}

export class OfflinePaymentAdapter implements PaymentAdapter {
  name = 'offline';

  supports(method: string): boolean {
    return ['cash', 'cashier_check', 'in_house_financing'].includes(method);
  }

  async charge(params: {
    amount: number;
    currency: string;
    orderId: string;
    invoiceId: string;
    method: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentAdapterResult> {
    logger.info({ adapter: this.name, method: params.method, amount: params.amount }, 'Offline payment recorded');
    return {
      success: true,
      transactionId: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'completed',
      metadata: { method: params.method, recordedAt: new Date().toISOString() },
    };
  }

  async refund(transactionId: string, amount: number): Promise<PaymentAdapterResult> {
    logger.info({ adapter: this.name, transactionId, amount }, 'Offline refund recorded');
    return {
      success: true,
      transactionId: `offline-refund-${Date.now()}`,
      status: 'completed',
      metadata: { originalTransactionId: transactionId, refundedAt: new Date().toISOString() },
    };
  }
}

export class OnlinePaymentAdapter implements PaymentAdapter {
  name = 'online';

  supports(method: string): boolean {
    return ['credit_card', 'bank_transfer'].includes(method);
  }

  async charge(params: {
    amount: number;
    currency: string;
    orderId: string;
    invoiceId: string;
    method: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentAdapterResult> {
    // In production, this would call an external payment gateway (Stripe, etc.)
    // For now, simulate a successful online charge
    logger.info({ adapter: this.name, method: params.method, amount: params.amount }, 'Online payment processed');
    return {
      success: true,
      transactionId: `online-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'completed',
      metadata: {
        method: params.method,
        gateway: 'simulated',
        processedAt: new Date().toISOString(),
      },
    };
  }

  async refund(transactionId: string, amount: number): Promise<PaymentAdapterResult> {
    logger.info({ adapter: this.name, transactionId, amount }, 'Online refund processed');
    return {
      success: true,
      transactionId: `online-refund-${Date.now()}`,
      status: 'completed',
      metadata: { originalTransactionId: transactionId, refundedAt: new Date().toISOString() },
    };
  }
}

const adapters: PaymentAdapter[] = [
  new OfflinePaymentAdapter(),
  new OnlinePaymentAdapter(),
];

export function resolveAdapter(method: string): PaymentAdapter {
  const adapter = adapters.find((a) => a.supports(method));
  if (!adapter) {
    throw new Error(`No payment adapter found for method: ${method}`);
  }
  return adapter;
}

export function registerAdapter(adapter: PaymentAdapter) {
  adapters.push(adapter);
}
