import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import httpClient from '../../../shared/api/httpClient';
import { formatCurrency, formatDate } from '../../../shared/utils/formatCurrency';
import { useAuth } from '../../auth/context/AuthContext';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';
import { useState } from 'react';

export default function VehicleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [addOns, setAddOns] = useState<string[]>([]);

  const { data: vehicle, isLoading, error } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => httpClient.get(`/vehicles/${id}`).then((r) => r.data),
  });

  const { data: addOnsData } = useQuery({
    queryKey: ['addons'],
    queryFn: () => httpClient.get('/cart/addons').then((r) => r.data),
  });

  const addToCart = useMutation({
    mutationFn: () =>
      httpClient.post('/cart/items', {
        vehicleId: id,
        dealershipId: vehicle?.dealershipId?._id || vehicle?.dealershipId,
        addOnServices: addOns.map((code) => ({ serviceCode: code })),
      }),
    onSuccess: () => navigate('/cart'),
  });

  if (isLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorMessage message="Failed to load vehicle" />;
  if (!vehicle) return null;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to search
      </button>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 card">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </h1>
              <p className="text-lg text-gray-500 mt-1">{vehicle.trim}</p>
            </div>
            <span className={`badge text-base px-3 py-1 ${vehicle.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {vehicle.status}
            </span>
          </div>

          <p className="text-4xl font-bold text-primary-600 mb-6">{formatCurrency(vehicle.price)}</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Mileage</p>
              <p className="font-semibold">{vehicle.mileage.toLocaleString()} miles</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Region</p>
              <p className="font-semibold">{vehicle.region}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">VIN</p>
              <p className="font-semibold font-mono text-sm">{vehicle.vin}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Registration Date</p>
              <p className="font-semibold">{formatDate(vehicle.registrationDate)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Est. Turnaround</p>
              <p className="font-semibold">{vehicle.estimatedTurnaround} day(s)</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Warehouse</p>
              <p className="font-semibold">{vehicle.warehouseId || 'N/A'}</p>
            </div>
          </div>

          {vehicle.description && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600">{vehicle.description}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {vehicle.status === 'available' && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">Add to Cart</h3>

              {addOnsData?.addOns?.map((addon: any) => (
                <label key={addon.serviceCode} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addOns.includes(addon.serviceCode)}
                    onChange={(e) => {
                      setAddOns(
                        e.target.checked
                          ? [...addOns, addon.serviceCode]
                          : addOns.filter((c) => c !== addon.serviceCode)
                      );
                    }}
                    className="h-4 w-4 text-primary-600 rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{addon.name}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(addon.price)}</p>
                  </div>
                </label>
              ))}

              <button
                onClick={() => addToCart.mutate()}
                disabled={addToCart.isPending}
                className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
              >
                {addToCart.isPending && <Spinner size="sm" />}
                {addToCart.isPending ? 'Adding...' : 'Add to Cart'}
              </button>

              {addToCart.isError && (
                <p className="text-sm text-red-600 mt-2">
                  {(addToCart.error as any)?.response?.data?.msg || 'Failed to add to cart'}
                </p>
              )}
            </div>
          )}

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-2">Dealership</h3>
            <p className="text-gray-600">{vehicle.dealershipId?.name || 'Unknown'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
