import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import httpClient from '../../../shared/api/httpClient';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { useAuth } from '../../auth/context/AuthContext';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';
import { v4 as uuidv4 } from 'react-router-dom';
import { useState } from 'react';

export default function CartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [checkoutError, setCheckoutError] = useState('');

  const { data: cart, isLoading, error, refetch } = useQuery({
    queryKey: ['cart'],
    queryFn: () => httpClient.get('/cart').then((r) => r.data),
  });

  const removeItem = useMutation({
    mutationFn: (vehicleId: string) => httpClient.delete(`/cart/items/${vehicleId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cart'] }); },
  });

  const checkout = useMutation({
    mutationFn: () =>
      httpClient.post('/orders', {
        idempotencyKey: `checkout-${user?._id}-${Date.now()}`,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      const orderId = Array.isArray(data.data) ? data.data[0]._id : data.data._id;
      navigate(`/orders/${orderId}`);
    },
    onError: (err: any) => {
      setCheckoutError(err.response?.data?.msg || 'Checkout failed');
    },
  });

  if (isLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorMessage message="Failed to load cart" onRetry={() => refetch()} />;

  const items = cart?.items || [];
  const subtotal = items.reduce((sum: number, item: any) => {
    const vehiclePrice = item.vehicleId?.price || 0;
    const addOnTotal = item.addOnServices?.reduce((s: number, a: any) => s + a.price, 0) || 0;
    return sum + vehiclePrice + addOnTotal;
  }, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Shopping Cart</h1>

      {items.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="h-12 w-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Cart is empty</h3>
          <p className="text-gray-500 mb-4">Browse vehicles and add them to your cart.</p>
          <button onClick={() => navigate('/vehicles')} className="btn-primary">Browse Vehicles</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            {items.map((item: any) => {
              const vehicle = item.vehicleId;
              if (!vehicle) return null;
              return (
                <div key={vehicle._id} className="card flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                    <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</h3>
                    <p className="text-sm text-gray-500">{vehicle.trim} | {vehicle.mileage?.toLocaleString()} mi</p>
                    {item.addOnServices?.length > 0 && (
                      <div className="mt-1 flex gap-2">
                        {item.addOnServices.map((a: any) => (
                          <span key={a.serviceCode} className="badge bg-blue-50 text-blue-700">{a.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{formatCurrency(vehicle.price)}</p>
                    {item.addOnServices?.length > 0 && (
                      <p className="text-sm text-gray-500">
                        + {formatCurrency(item.addOnServices.reduce((s: number, a: any) => s + a.price, 0))} add-ons
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem.mutate(vehicle._id)}
                    disabled={removeItem.isPending}
                    className="text-red-500 hover:text-red-700 p-2"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="card h-fit">
            <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Items ({items.length})</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-500">Calculated at checkout</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-base">
                <span className="font-semibold">Subtotal</span>
                <span className="font-bold text-primary-600">{formatCurrency(subtotal)}</span>
              </div>
            </div>

            {checkoutError && (
              <div className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">{checkoutError}</div>
            )}

            <button
              onClick={() => checkout.mutate()}
              disabled={checkout.isPending}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
            >
              {checkout.isPending && <Spinner size="sm" />}
              {checkout.isPending ? 'Processing...' : 'Proceed to Checkout'}
            </button>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Orders may split based on supplier/warehouse
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
