import { useState, useEffect } from 'react';
import { useAuth } from '../../features/auth/context/AuthContext';
import httpClient from '../api/httpClient';

export function useDealership() {
  const { user } = useAuth();
  const [dealerships, setDealerships] = useState<Array<{ _id: string; name: string }>>([]);
  const [selectedDealershipId, setSelectedDealershipIdState] = useState<string>(
    () => localStorage.getItem('selectedDealershipId') || ''
  );

  // Persist selection to localStorage so httpClient can inject X-Dealership-Id header
  const setSelectedDealershipId = (id: string) => {
    setSelectedDealershipIdState(id);
    if (id) {
      localStorage.setItem('selectedDealershipId', id);
    } else {
      localStorage.removeItem('selectedDealershipId');
    }
  };
  const [loading, setLoading] = useState(false);

  const isAdmin = user?.role === 'admin';
  const userDealershipId = user?.dealershipId || '';

  useEffect(() => {
    if (isAdmin && !userDealershipId) {
      setLoading(true);
      httpClient.get('/dealerships')
        .then(({ data }) => {
          setDealerships(data);
          if (data.length > 0 && !selectedDealershipId) {
            setSelectedDealershipId(data[0]._id);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isAdmin, userDealershipId]);

  const dealershipId = userDealershipId || selectedDealershipId;
  const needsSelection = isAdmin && !userDealershipId;

  return {
    dealershipId,
    dealerships,
    selectedDealershipId,
    setSelectedDealershipId,
    needsSelection,
    loading,
  };
}
