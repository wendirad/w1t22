import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import httpClient from '../../../shared/api/httpClient';
import { formatCurrency, formatDate } from '../../../shared/utils/formatCurrency';
import { useAuth } from '../../auth/context/AuthContext';
import { useDealership } from '../../../shared/hooks/useDealership';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';
import Modal from '../../../shared/components/ui/Modal';
import DealershipSelector from '../../../shared/components/ui/DealershipSelector';

export default function FinancePage() {
  const { user } = useAuth();
  const { dealershipId, dealerships, selectedDealershipId, setSelectedDealershipId, needsSelection } = useDealership();
  const queryClient = useQueryClient();
  const [paymentModal, setPaymentModal] = useState<any>(null);
  const [paymentForm, setPaymentForm] = useState({ method: 'cash', amount: 0 });
  const [selectedOrderId, setSelectedOrderId] = useState('');

  const dealershipParam = dealershipId ? `&dealershipId=${dealershipId}` : '';

  const { data: orders } = useQuery({
    queryKey: ['orders-invoiced', dealershipId],
    queryFn: () => httpClient.get(`/orders?status=invoiced${dealershipParam}`).then((r) => r.data),
  });

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet', dealershipId],
    queryFn: () => httpClient.get('/finance/wallet/balance').then((r) => r.data),
  });

  const { data: historyData } = useQuery({
    queryKey: ['wallet-history', dealershipId],
    queryFn: () => httpClient.get('/finance/wallet/history').then((r) => r.data),
  });

  const previewInvoice = useMutation({
    mutationFn: (orderId: string) => httpClient.get(`/finance/invoices/${orderId}/preview`).then((r) => r.data),
    onSuccess: (data, orderId) => {
      setPaymentModal(data);
      setSelectedOrderId(orderId);
      setPaymentForm({ method: 'cash', amount: data.total });
    },
  });

  const createInvoiceAndPay = useMutation({
    mutationFn: async () => {
      const { data: invoice } = await httpClient.post(`/finance/invoices/${selectedOrderId}`);
      await httpClient.post('/finance/payments', {
        orderId: selectedOrderId,
        invoiceId: invoice._id,
        method: paymentForm.method,
        amount: paymentForm.amount,
        idempotencyKey: `pay-${selectedOrderId}-${Date.now()}`,
      });
      return invoice;
    },
    onSuccess: () => {
      setPaymentModal(null);
      queryClient.invalidateQueries({ queryKey: ['orders-invoiced'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-history'] });
    },
  });

  const reconciliation = useMutation({
    mutationFn: () => httpClient.post('/finance/reconciliation'),
  });

  return (
    <div>
      {needsSelection && (
        <DealershipSelector
          dealerships={dealerships}
          value={selectedDealershipId}
          onChange={setSelectedDealershipId}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        {user?.role === 'admin' && (
          <button
            onClick={() => reconciliation.mutate()}
            disabled={reconciliation.isPending}
            className="btn-secondary flex items-center gap-2"
          >
            {reconciliation.isPending && <Spinner size="sm" />}
            Run Reconciliation
          </button>
        )}
      </div>

      {reconciliation.isSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4 text-sm">
          Reconciliation completed successfully.
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Wallet Balance</p>
          {walletLoading ? <Spinner size="sm" /> : (
            <p className="text-2xl font-bold text-primary-600">{formatCurrency(walletData?.balance || 0)}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{walletData?.accountId}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Pending Invoices</p>
          <p className="text-2xl font-bold">{orders?.data?.length || 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Currency</p>
          <p className="text-2xl font-bold">USD</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Orders Awaiting Payment</h2>
          {orders?.data?.length === 0 && <p className="text-gray-500 text-sm">No invoiced orders.</p>}
          <div className="space-y-3">
            {orders?.data?.map((order: any) => (
              <div key={order._id} className="card flex items-center justify-between">
                <div>
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-sm text-gray-500">{formatCurrency(order.totals.total)}</p>
                </div>
                <button
                  onClick={() => previewInvoice.mutate(order._id)}
                  disabled={previewInvoice.isPending}
                  className="btn-primary text-sm"
                >
                  Pay Now
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Transactions</h2>
          <div className="space-y-2">
            {(historyData?.transactions || []).slice(0, 10).map((tx: any) => (
              <div key={tx._id} className="flex items-center justify-between py-2 border-b text-sm">
                <div>
                  <p className={tx.type === 'credit' ? 'text-green-700' : 'text-red-700'}>
                    {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                  <p className="text-xs text-gray-500">{tx.description}</p>
                </div>
                <p className="text-xs text-gray-400">{formatDate(tx.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal isOpen={!!paymentModal} onClose={() => setPaymentModal(null)} title="Invoice & Payment">
        {paymentModal && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="font-medium mb-2">Invoice Preview - {paymentModal.orderNumber}</p>
              {paymentModal.lineItems?.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm py-1">
                  <span>{item.description}</span>
                  <span>{formatCurrency(item.total)}</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{formatCurrency(paymentModal.subtotal)}</span>
              </div>
              {paymentModal.taxBreakdown?.map((tax: any, idx: number) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>Tax ({tax.jurisdiction} @ {(tax.rate * 100).toFixed(1)}%)</span>
                  <span>{formatCurrency(tax.amount)}</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary-600">{formatCurrency(paymentModal.total)}</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Payment Method</label>
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                className="input-field mt-1"
              >
                <option value="cash">Cash</option>
                <option value="cashier_check">Cashier's Check</option>
                <option value="in_house_financing">In-House Financing</option>
              </select>
            </div>

            {createInvoiceAndPay.isError && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {(createInvoiceAndPay.error as any)?.response?.data?.msg || 'Payment failed'}
              </div>
            )}

            <button
              onClick={() => createInvoiceAndPay.mutate()}
              disabled={createInvoiceAndPay.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {createInvoiceAndPay.isPending && <Spinner size="sm" />}
              {createInvoiceAndPay.isPending ? 'Processing...' : `Pay ${formatCurrency(paymentModal.total)}`}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
