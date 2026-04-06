import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import httpClient from '../../../shared/api/httpClient';
import { formatCurrency, formatDate } from '../../../shared/utils/formatCurrency';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';

export default function VehicleSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState({
    make: searchParams.get('make') || '',
    model: searchParams.get('model') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minMileage: searchParams.get('minMileage') || '',
    maxMileage: searchParams.get('maxMileage') || '',
    region: searchParams.get('region') || '',
    minRegistrationDate: searchParams.get('minRegistrationDate') || '',
    maxRegistrationDate: searchParams.get('maxRegistrationDate') || '',
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: searchParams.get('sortOrder') || 'desc',
    page: searchParams.get('page') || '1',
  });

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vehicles', q, filters],
    queryFn: () => httpClient.get(`/search?${params.toString()}`).then((r) => r.data),
  });

  const { data: trendingData } = useQuery({
    queryKey: ['trending'],
    queryFn: () => httpClient.get('/search/trending').then((r) => r.data),
  });

  const { data: presets, refetch: refetchPresets } = useQuery({
    queryKey: ['filterPresets'],
    queryFn: () => httpClient.get('/admin/filter-presets').then((r) => r.data),
  });

  // A/B experiment assignment for listing layout
  const { data: experimentData } = useQuery({
    queryKey: ['experiment', 'listing_layout'],
    queryFn: () => httpClient.get('/experiments/assignment?feature=listing_layout').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const listingVariant = experimentData?.variant || 'control';
  const listingConfig = experimentData?.config || {};

  const savePreset = useMutation({
    mutationFn: (name: string) => httpClient.post('/admin/filter-presets', { name, filters: { q, ...filters } }),
    onSuccess: () => refetchPresets(),
  });

  const updateFilter = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value, page: '1' };
    setFilters(newFilters);
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    Object.entries(newFilters).forEach(([k, v]) => { if (v) sp.set(k, v); });
    setSearchParams(sp);
  };

  const clearFilters = () => {
    setQ('');
    setFilters({ make: '', model: '', minPrice: '', maxPrice: '', minMileage: '', maxMileage: '', region: '', minRegistrationDate: '', maxRegistrationDate: '', sortBy: 'createdAt', sortOrder: 'desc', page: '1' });
    setSearchParams({});
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter('page', '1');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vehicle Search</h1>
        <button
          onClick={() => {
            const name = window.prompt('Preset name:');
            if (name) savePreset.mutate(name);
          }}
          className="btn-secondary text-sm"
        >
          Save Filters
        </button>
      </div>

      {trendingData?.trending?.length > 0 && !q && (
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Trending Searches</p>
          <div className="flex flex-wrap gap-2">
            {trendingData.trending.map((t: any) => (
              <button
                key={t.keyword}
                onClick={() => { setQ(t.keyword); updateFilter('page', '1'); }}
                className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm hover:bg-primary-100 transition-colors"
              >
                {t.keyword} ({t.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {presets && presets.length > 0 && (
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Saved Presets</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p: any) => (
              <button
                key={p._id}
                onClick={() => {
                  if (p.filters.q) setQ(p.filters.q);
                  setFilters({ ...filters, ...p.filters });
                }}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3">
          <div className="card space-y-4">
            <h3 className="font-semibold text-gray-900">Filters</h3>

            <form onSubmit={handleSearch}>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='Search (e.g., "Chevy", "Camry")'
                className="input-field"
              />
            </form>

            <div>
              <label className="text-sm text-gray-600">Make</label>
              <input value={filters.make} onChange={(e) => updateFilter('make', e.target.value)} className="input-field" placeholder="e.g., Toyota" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Model</label>
              <input value={filters.model} onChange={(e) => updateFilter('model', e.target.value)} className="input-field" placeholder="e.g., Camry" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-600">Min Price</label>
                <input type="number" value={filters.minPrice} onChange={(e) => updateFilter('minPrice', e.target.value)} className="input-field" placeholder="0" />
              </div>
              <div>
                <label className="text-sm text-gray-600">Max Price</label>
                <input type="number" value={filters.maxPrice} onChange={(e) => updateFilter('maxPrice', e.target.value)} className="input-field" placeholder="Any" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-600">Min Miles</label>
                <input type="number" value={filters.minMileage} onChange={(e) => updateFilter('minMileage', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="text-sm text-gray-600">Max Miles</label>
                <input type="number" value={filters.maxMileage} onChange={(e) => updateFilter('maxMileage', e.target.value)} className="input-field" />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600">Region</label>
              <input value={filters.region} onChange={(e) => updateFilter('region', e.target.value)} className="input-field" placeholder="e.g., Southeast" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-600">Reg. From</label>
                <input type="date" value={filters.minRegistrationDate} onChange={(e) => updateFilter('minRegistrationDate', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="text-sm text-gray-600">Reg. To</label>
                <input type="date" value={filters.maxRegistrationDate} onChange={(e) => updateFilter('maxRegistrationDate', e.target.value)} className="input-field" />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600">Sort By</label>
              <select value={filters.sortBy} onChange={(e) => updateFilter('sortBy', e.target.value)} className="input-field">
                <option value="createdAt">Newest</option>
                <option value="price">Price</option>
                <option value="mileage">Mileage</option>
                <option value="year">Year</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">Order</label>
              <select value={filters.sortOrder} onChange={(e) => updateFilter('sortOrder', e.target.value)} className="input-field">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>

            <button onClick={clearFilters} className="btn-secondary w-full text-sm">Clear All Filters</button>
          </div>
        </div>

        <div className="lg:col-span-9">
          {isLoading && <Spinner className="py-12" />}
          {error && <ErrorMessage message="Failed to load vehicles" onRetry={() => refetch()} />}

          {data && data.data?.length === 0 && (
            <div className="card text-center py-12">
              <svg className="h-12 w-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No vehicles found</h3>
              <p className="text-gray-500">Try broadening your price range or removing some filters.</p>
            </div>
          )}

          {data?.expandedTerms?.length > 0 && (
            <p className="text-sm text-gray-500 mb-3">
              Searching for: {data.expandedTerms.join(', ')}
            </p>
          )}

          <div className={`grid gap-4 ${
            listingVariant === 'variant_a'
              ? (listingConfig.columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3')
              : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          }`}>
            {data?.data?.map((vehicle: any) => (
              <Link key={vehicle._id} to={`/vehicles/${vehicle._id}`} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </h3>
                    <p className="text-sm text-gray-500">{vehicle.trim}</p>
                  </div>
                  <span className={`badge ${vehicle.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {vehicle.status}
                  </span>
                </div>
                <p className="text-2xl font-bold text-primary-600 mb-3">{formatCurrency(vehicle.price)}</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <div>{vehicle.mileage.toLocaleString()} mi</div>
                  <div>{vehicle.region}</div>
                  <div>VIN: ...{vehicle.vin.slice(-6)}</div>
                  <div>{formatDate(vehicle.registrationDate)}</div>
                </div>
              </Link>
            ))}
          </div>

          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                disabled={!data.pagination.hasPrev}
                onClick={() => updateFilter('page', String(data.pagination.page - 1))}
                className="btn-secondary text-sm"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} results)
              </span>
              <button
                disabled={!data.pagination.hasNext}
                onClick={() => updateFilter('page', String(data.pagination.page + 1))}
                className="btn-secondary text-sm"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
