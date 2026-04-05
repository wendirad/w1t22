import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import httpClient from '../../../shared/api/httpClient';
import { formatDate } from '../../../shared/utils/formatCurrency';
import { useAuth } from '../../auth/context/AuthContext';
import Spinner from '../../../shared/components/ui/Spinner';
import ErrorMessage from '../../../shared/components/ui/ErrorMessage';
import Modal from '../../../shared/components/ui/Modal';

export default function DocumentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ file: null as File | null, type: 'other', sensitiveFlag: false });
  const [dragOver, setDragOver] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['documents'],
    queryFn: () => httpClient.get('/documents').then((r) => r.data),
  });

  const upload = useMutation({
    mutationFn: () => {
      if (!uploadForm.file) throw new Error('No file selected');
      const fd = new FormData();
      fd.append('file', uploadForm.file);
      fd.append('type', uploadForm.type);
      fd.append('sensitiveFlag', String(uploadForm.sensitiveFlag));
      return httpClient.post('/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      setShowUpload(false);
      setUploadForm({ file: null, type: 'other', sensitiveFlag: false });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => httpClient.delete(`/documents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadForm((prev) => ({ ...prev, file }));
  }, []);

  const canManage = user?.role === 'admin' || user?.role === 'dealership_staff';

  if (isLoading) return <Spinner className="py-12" />;
  if (error) return <ErrorMessage message="Failed to load documents" onRetry={() => refetch()} />;

  const documents = data?.data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        {canManage && (
          <button onClick={() => setShowUpload(true)} className="btn-primary">Upload Document</button>
        )}
      </div>

      {documents.length === 0 ? (
        <div className="card text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-1">No documents</h3>
          <p className="text-gray-500">Upload titles, buyer's orders, or inspection PDFs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc: any) => (
            <div key={doc._id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {doc.mimeType?.split('/')[1]?.slice(0, 3) || 'DOC'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-sm truncate max-w-[200px]">{doc.originalFilename}</p>
                    <p className="text-xs text-gray-500">{(doc.sizeBytes / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                {doc.sensitiveFlag && <span className="badge bg-red-100 text-red-800">Sensitive</span>}
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <span className="badge bg-gray-100 text-gray-700">{doc.type}</span>
                <span>{formatDate(doc.createdAt)}</span>
              </div>

              <div className="flex gap-2">
                <a
                  href={`/api/v1/documents/${doc._id}/download`}
                  className="btn-secondary text-xs flex-1 text-center"
                  target="_blank"
                  rel="noopener"
                >
                  Download
                </a>
                {canManage && (
                  <button
                    onClick={() => { if (window.confirm('Delete this document?')) deleteDoc.mutate(doc._id); }}
                    disabled={deleteDoc.isPending}
                    className="btn-danger text-xs"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload Document">
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
            }`}
          >
            {uploadForm.file ? (
              <p className="font-medium">{uploadForm.file.name}</p>
            ) : (
              <div>
                <p className="text-gray-500">Drag & drop a file here, or</p>
                <label className="btn-secondary mt-2 inline-block cursor-pointer">
                  Browse Files
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                  />
                </label>
                <p className="text-xs text-gray-400 mt-2">PDF, JPG, PNG up to 10MB</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Document Type</label>
            <select
              value={uploadForm.type}
              onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value })}
              className="input-field mt-1"
            >
              <option value="title">Title</option>
              <option value="buyers_order">Buyer's Order</option>
              <option value="inspection">Inspection</option>
              <option value="other">Other</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={uploadForm.sensitiveFlag}
              onChange={(e) => setUploadForm({ ...uploadForm, sensitiveFlag: e.target.checked })}
              className="h-4 w-4 text-primary-600 rounded"
            />
            <span className="text-sm">Mark as sensitive</span>
          </label>

          {upload.isError && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {(upload.error as any)?.response?.data?.msg || 'Upload failed'}
            </div>
          )}

          <button
            onClick={() => upload.mutate()}
            disabled={!uploadForm.file || upload.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {upload.isPending && <Spinner size="sm" />}
            {upload.isPending ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
