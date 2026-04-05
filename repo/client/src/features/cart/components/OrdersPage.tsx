import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import httpClient from '../../../shared/api/httpClient';
import { formatCurrency, formatDate } from '../../../shared/utils/formatCurrency';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-blue-100 text-blue-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  invoiced: 'bg-purple-100 text-purple-800',
  settled: 'bg-green-100 text-green-800',
  fulfilled: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function OrdersPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => httpClient.get('/orders').then((r) => r.data),
  });

  if (isLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorMessage message="Failed to load orders" onRetry={() => refetch()} />;

  const orders = data?.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Orders</h1>

      {orders.length === 0 ? (
        <div className="card text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-1">No orders yet</h3>
          <p className="text-gray-500">Your orders will appear here after checkout.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => (
            <Link key={order._id} to={`/orders/${order._id}`} className="card flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold">{order.orderNumber}</h3>
                  <span className={`badge ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                    {order.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {order.items?.length || 0} item(s) | {formatDate(order.createdAt)}
                </p>
              </div>
              <p className="text-lg font-bold text-primary-600">{formatCurrency(order.totals?.total || 0)}</p>
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
