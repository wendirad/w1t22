import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import httpClient from '../../../shared/api/httpClient';
import Spinner from '../../../shared/components/ui/Spinner';
import Modal from '../../../shared/components/ui/Modal';

type Tab = 'synonyms' | 'taxRates' | 'experiments' | 'users';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('synonyms');
  const queryClient = useQueryClient();

  const [synonymModal, setSynonymModal] = useState(false);
  const [synonymForm, setSynonymForm] = useState({ canonical: '', aliases: '', field: 'make' });

  const [taxModal, setTaxModal] = useState(false);
  const [taxForm, setTaxForm] = useState({ state: '', county: '', rate: '', effectiveDate: '' });

  const [expModal, setExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ name: '', description: '', feature: 'listing_layout', variants: '[]' });

  const { data: synonyms, isLoading: synLoading } = useQuery({
    queryKey: ['synonyms'], queryFn: () => httpClient.get('/admin/synonyms').then((r) => r.data),
  });

  const { data: taxRates, isLoading: taxLoading } = useQuery({
    queryKey: ['taxRates'], queryFn: () => httpClient.get('/admin/tax-rates').then((r) => r.data),
  });

  const { data: experiments } = useQuery({
    queryKey: ['experiments'], queryFn: () => httpClient.get('/admin/experiments').then((r) => r.data),
  });

  const { data: users } = useQuery({
    queryKey: ['admin-users'], queryFn: () => httpClient.get('/admin/users').then((r) => r.data),
  });

  const createSynonym = useMutation({
    mutationFn: () => httpClient.post('/admin/synonyms', {
      canonical: synonymForm.canonical,
      aliases: synonymForm.aliases.split(',').map((s) => s.trim()),
      field: synonymForm.field,
    }),
    onSuccess: () => { setSynonymModal(false); queryClient.invalidateQueries({ queryKey: ['synonyms'] }); },
  });

  const deleteSynonym = useMutation({
    mutationFn: (id: string) => httpClient.delete(`/admin/synonyms/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['synonyms'] }),
  });

  const createTaxRate = useMutation({
    mutationFn: () => httpClient.post('/admin/tax-rates', {
      state: taxForm.state, county: taxForm.county,
      rate: parseFloat(taxForm.rate), effectiveDate: taxForm.effectiveDate || new Date().toISOString(),
    }),
    onSuccess: () => { setTaxModal(false); queryClient.invalidateQueries({ queryKey: ['taxRates'] }); },
  });

  const deleteTaxRate = useMutation({
    mutationFn: (id: string) => httpClient.delete(`/admin/tax-rates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['taxRates'] }),
  });

  const createExperiment = useMutation({
    mutationFn: () => {
      let variants;
      try { variants = JSON.parse(expForm.variants); } catch { variants = [{ key: 'control', weight: 50, config: {} }, { key: 'variant_a', weight: 50, config: {} }]; }
      return httpClient.post('/admin/experiments', { ...expForm, variants });
    },
    onSuccess: () => { setExpModal(false); queryClient.invalidateQueries({ queryKey: ['experiments'] }); },
  });

  const updateExperiment = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      httpClient.patch(`/admin/experiments/${id}`, { action }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['experiments'] }),
  });

  const updateUserRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      httpClient.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const tabs = [
    { key: 'synonyms', label: 'Synonyms' },
    { key: 'taxRates', label: 'Tax Rates' },
    { key: 'experiments', label: 'A/B Tests' },
    { key: 'users', label: 'Users' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'synonyms' && (
        <div>
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Search Synonyms</h2>
            <button onClick={() => setSynonymModal(true)} className="btn-primary text-sm">Add Synonym</button>
          </div>
          {synLoading ? <Spinner /> : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-4 py-3 font-medium">Canonical</th>
                  <th className="text-left px-4 py-3 font-medium">Aliases</th>
                  <th className="text-left px-4 py-3 font-medium">Field</th>
                  <th className="px-4 py-3"></th>
                </tr></thead>
                <tbody className="divide-y">
                  {(synonyms || []).map((s: any) => (
                    <tr key={s._id}>
                      <td className="px-4 py-3 font-medium">{s.canonical}</td>
                      <td className="px-4 py-3">{s.aliases.join(', ')}</td>
                      <td className="px-4 py-3"><span className="badge bg-gray-100 text-gray-700">{s.field}</span></td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteSynonym.mutate(s._id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'taxRates' && (
        <div>
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Tax Rates</h2>
            <button onClick={() => setTaxModal(true)} className="btn-primary text-sm">Add Tax Rate</button>
          </div>
          {taxLoading ? <Spinner /> : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-4 py-3 font-medium">State</th>
                  <th className="text-left px-4 py-3 font-medium">County</th>
                  <th className="text-left px-4 py-3 font-medium">Rate</th>
                  <th className="px-4 py-3"></th>
                </tr></thead>
                <tbody className="divide-y">
                  {(taxRates || []).map((t: any) => (
                    <tr key={t._id}>
                      <td className="px-4 py-3">{t.state}</td>
                      <td className="px-4 py-3">{t.county || '-'}</td>
                      <td className="px-4 py-3">{(t.rate * 100).toFixed(2)}%</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteTaxRate.mutate(t._id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'experiments' && (
        <div>
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">A/B Tests</h2>
            <button onClick={() => setExpModal(true)} className="btn-primary text-sm">Create Test</button>
          </div>
          <div className="space-y-3">
            {(experiments || []).map((exp: any) => (
              <div key={exp._id} className="card flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{exp.name}</h3>
                  <p className="text-sm text-gray-500">{exp.feature} | {exp.variants.length} variants</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${
                    exp.status === 'active' ? 'bg-green-100 text-green-800' :
                    exp.status === 'rolled_back' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>{exp.status}</span>
                  {exp.status === 'draft' && (
                    <button onClick={() => updateExperiment.mutate({ id: exp._id, action: 'activate' })} className="btn-primary text-xs">Activate</button>
                  )}
                  {exp.status === 'active' && (
                    <button onClick={() => updateExperiment.mutate({ id: exp._id, action: 'rollback' })} className="btn-danger text-xs">Rollback</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">User Management</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y">
                {(users || []).map((u: any) => (
                  <tr key={u._id}>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.profile?.firstName} {u.profile?.lastName}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => updateUserRole.mutate({ id: u._id, role: e.target.value })}
                        className="input-field text-xs py-1"
                      >
                        <option value="buyer">Buyer</option>
                        <option value="dealership_staff">Staff</option>
                        <option value="finance_reviewer">Finance</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={synonymModal} onClose={() => setSynonymModal(false)} title="Add Synonym">
        <div className="space-y-3">
          <div><label className="text-sm font-medium">Canonical</label><input value={synonymForm.canonical} onChange={(e) => setSynonymForm({ ...synonymForm, canonical: e.target.value })} className="input-field" placeholder="e.g., Chevrolet" /></div>
          <div><label className="text-sm font-medium">Aliases (comma-separated)</label><input value={synonymForm.aliases} onChange={(e) => setSynonymForm({ ...synonymForm, aliases: e.target.value })} className="input-field" placeholder="e.g., Chevy, Chev" /></div>
          <div><label className="text-sm font-medium">Field</label><select value={synonymForm.field} onChange={(e) => setSynonymForm({ ...synonymForm, field: e.target.value })} className="input-field"><option value="make">Make</option><option value="model">Model</option></select></div>
          <button onClick={() => createSynonym.mutate()} disabled={createSynonym.isPending} className="btn-primary w-full">{createSynonym.isPending ? 'Creating...' : 'Create Synonym'}</button>
        </div>
      </Modal>

      <Modal isOpen={taxModal} onClose={() => setTaxModal(false)} title="Add Tax Rate">
        <div className="space-y-3">
          <div><label className="text-sm font-medium">State</label><input value={taxForm.state} onChange={(e) => setTaxForm({ ...taxForm, state: e.target.value })} className="input-field" /></div>
          <div><label className="text-sm font-medium">County</label><input value={taxForm.county} onChange={(e) => setTaxForm({ ...taxForm, county: e.target.value })} className="input-field" /></div>
          <div><label className="text-sm font-medium">Rate (decimal)</label><input value={taxForm.rate} onChange={(e) => setTaxForm({ ...taxForm, rate: e.target.value })} className="input-field" placeholder="e.g., 0.075" /></div>
          <button onClick={() => createTaxRate.mutate()} disabled={createTaxRate.isPending} className="btn-primary w-full">{createTaxRate.isPending ? 'Creating...' : 'Create Tax Rate'}</button>
        </div>
      </Modal>

      <Modal isOpen={expModal} onClose={() => setExpModal(false)} title="Create A/B Test">
        <div className="space-y-3">
          <div><label className="text-sm font-medium">Name</label><input value={expForm.name} onChange={(e) => setExpForm({ ...expForm, name: e.target.value })} className="input-field" /></div>
          <div><label className="text-sm font-medium">Description</label><input value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className="input-field" /></div>
          <div><label className="text-sm font-medium">Feature</label><select value={expForm.feature} onChange={(e) => setExpForm({ ...expForm, feature: e.target.value })} className="input-field"><option value="listing_layout">Listing Layout</option><option value="checkout_steps">Checkout Steps</option></select></div>
          <button onClick={() => createExperiment.mutate()} disabled={createExperiment.isPending} className="btn-primary w-full">{createExperiment.isPending ? 'Creating...' : 'Create Experiment'}</button>
        </div>
      </Modal>
    </div>
  );
}
