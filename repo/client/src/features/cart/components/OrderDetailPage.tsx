import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import httpClient from '../../../shared/api/httpClient';
import { formatCurrency, formatDate } from '../../../shared/utils/formatCurrency';
import { useAuth } from '../../auth/context/AuthContext';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';
import { useState } from 'react';

const TRANSITIONS: Record<string, Array<{ event: string; label: string; color: string }>> = {
  created: [
    { event: 'RESERVE', label: 'Reserve', color: 'btn-primary' },
    { event: 'CANCEL', label: 'Cancel', color: 'btn-danger' },
  ],
  reserved: [
    { event: 'INVOICE', label: 'Create Invoice', color: 'btn-primary' },
    { event: 'CANCEL', label: 'Cancel', color: 'btn-danger' },
  ],
  invoiced: [
    { event: 'SETTLE', label: 'Mark Settled', color: 'btn-primary' },
    { event: 'CANCEL', label: 'Cancel', color: 'btn-danger' },
  ],
  settled: [
    { event: 'FULFILL', label: 'Mark Fulfilled', color: 'btn-primary' },
    { event: 'CANCEL', label: 'Cancel', color: 'btn-danger' },
  ],
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [transitionError, setTransitionError] = useState('');

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => httpClient.get(`/orders/${id}`).then((r) => r.data),
  });

  const { data: events } = useQuery({
    queryKey: ['orderEvents', id],
    queryFn: () => httpClient.get(`/orders/${id}/events`).then((r) => r.data),
  });

  const transition = useMutation({
    mutationFn: (event: string) =>
      httpClient.post(`/orders/${id}/transition`, { event, reason: `Transition by ${user?.email}` }),
    onSuccess: () => {
      setTransitionError('');
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderEvents', id] });
    },
    onError: (err: any) => {
      setTransitionError(err.response?.data?.msg || 'Transition failed');
    },
  });

  if (isLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorMessage message="Failed to load order" onRetry={() => refetch()} />;
  if (!order) return null;

  const availableTransitions = TRANSITIONS[order.status] || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order {order.orderNumber}</h1>
          <p className="text-gray-500">Created {formatDate(order.createdAt)}</p>
        </div>
        <span className={`badge text-base px-3 py-1 ${
          order.status === 'fulfilled' ? 'bg-emerald-100 text-emerald-800' :
          order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {order.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-3">Items</h3>
            {order.items?.map((item: any, idx: number) => {
              const vehicle = item.vehicleId;
              return (
                <div key={idx} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium">
                      {vehicle?.year} {vehicle?.make} {vehicle?.model} {vehicle?.trim}
                    </p>
                    {item.addOnServices?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {item.addOnServices.map((a: any) => (
                          <span key={a.serviceCode} className="badge bg-blue-50 text-blue-700">{a.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="font-semibold">{formatCurrency(item.subtotal)}</p>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Timeline</h3>
            <div className="space-y-3">
              {(events || []).map((event: any) => (
                <div key={event._id} className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-primary-500" />
                  <div>
                    <p className="text-sm font-medium">
                      {event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : event.toStatus}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(event.timestamp)} | {event.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-3">Totals</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>{formatCurrency(order.totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Tax</span><span>{formatCurrency(order.totals.tax)}</span></div>
              <div className="border-t pt-2 flex justify-between font-semibold text-base">
                <span>Total</span><span className="text-primary-600">{formatCurrency(order.totals.total)}</span>
              </div>
            </div>
          </div>

          {availableTransitions.length > 0 && user?.role !== 'buyer' && (
            <div className="card">
              <h3 className="font-semibold mb-3">Actions</h3>
              {transitionError && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{transitionError}</div>
              )}
              <div className="space-y-2">
                {availableTransitions.map((t) => (
                  <button
                    key={t.event}
                    onClick={() => transition.mutate(t.event)}
                    disabled={transition.isPending}
                    className={`${t.color} w-full flex items-center justify-center gap-2`}
                  >
                    {transition.isPending && <Spinner size="sm" />}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
