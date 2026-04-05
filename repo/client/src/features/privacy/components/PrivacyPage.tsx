import { useQuery, useMutation } from '@tanstack/react-query';
import httpClient from '../../../shared/api/httpClient';
import { formatDate } from '../../../shared/utils/formatCurrency';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';
import { useState } from 'react';

export default function PrivacyPage() {
  const [exportData, setExportData] = useState<any>(null);

  const { data: consents, isLoading, error } = useQuery({
    queryKey: ['consents'],
    queryFn: () => httpClient.get('/privacy/consents').then((r) => r.data),
  });

  const recordConsent = useMutation({
    mutationFn: (params: { consentType: string; granted: boolean }) =>
      httpClient.post('/privacy/consents', { ...params, version: '1.0' }),
  });

  const exportMutation = useMutation({
    mutationFn: () => httpClient.post('/privacy/export').then((r) => r.data),
    onSuccess: (data) => setExportData(data),
  });

  const deleteMutation = useMutation({
    mutationFn: () => httpClient.post('/privacy/delete-account'),
  });

  if (isLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorMessage message="Failed to load privacy data" />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Privacy Center</h1>

      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Consent Management</h2>
          <div className="space-y-3">
            {['data_processing', 'marketing', 'analytics'].map((type) => {
              const latest = (consents || []).find((c: any) => c.consentType === type);
              return (
                <div key={type} className="flex items-center justify-between py-2 border-b">
                  <div>
                    <p className="font-medium capitalize">{type.replace('_', ' ')}</p>
                    <p className="text-xs text-gray-500">
                      {latest ? `${latest.granted ? 'Granted' : 'Revoked'} on ${formatDate(latest.timestamp)}` : 'No consent recorded'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => recordConsent.mutate({ consentType: type, granted: true })}
                      disabled={recordConsent.isPending}
                      className="btn-primary text-xs"
                    >
                      Grant
                    </button>
                    <button
                      onClick={() => recordConsent.mutate({ consentType: type, granted: false })}
                      disabled={recordConsent.isPending}
                      className="btn-secondary text-xs"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="font-semibold mt-6 mb-2">Consent History</h3>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {(consents || []).map((c: any) => (
              <div key={c._id} className="flex items-center justify-between text-sm py-1">
                <span className="capitalize">{c.consentType.replace('_', ' ')}</span>
                <span className={c.granted ? 'text-green-600' : 'text-red-600'}>
                  {c.granted ? 'Granted' : 'Revoked'} | {formatDate(c.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Data Export</h2>
            <p className="text-sm text-gray-500 mb-4">Download a copy of all your data in JSON format.</p>
            <button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {exportMutation.isPending && <Spinner size="sm" />}
              {exportMutation.isPending ? 'Exporting...' : 'Export My Data'}
            </button>
            {exportData && (
              <div className="mt-3">
                <a
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`}
                  download="motorlot-data-export.json"
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  Download JSON File
                </a>
              </div>
            )}
          </div>

          <div className="card border-red-200">
            <h2 className="text-lg font-semibold text-red-700 mb-3">Account Deletion</h2>
            <p className="text-sm text-gray-500 mb-2">
              Request permanent deletion of your account. Personal data is removed immediately.
              Financial records are retained for 30 days per compliance requirements.
            </p>
            {deleteMutation.isSuccess ? (
              <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm">
                Account deletion requested. Your account has been deactivated and PII removed.
                Financial records will be purged after 30 days.
              </div>
            ) : (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure? This action cannot be undone. Your personal data will be removed immediately.')) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="btn-danger flex items-center gap-2"
              >
                {deleteMutation.isPending && <Spinner size="sm" />}
                Request Account Deletion
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
