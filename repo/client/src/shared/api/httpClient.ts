import axios from 'axios';

const API_BASE = '/api/v1';

async function generateHmac(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const payload = `${method.toUpperCase()}\n${path}\n${body}\n${timestamp}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const httpClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

httpClient.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const timestamp = new Date().toISOString();
  config.headers['X-Timestamp'] = timestamp;

  // Sign all authenticated requests using the per-session signing key
  const signingKey = localStorage.getItem('signingKey');
  if (token && signingKey) {
    const fullUrl = config.baseURL
      ? `${config.baseURL}${config.url || ''}`
      : config.url || '';

    const method = (config.method || 'GET').toUpperCase();
    let path = fullUrl;
    if (config.params) {
      const qs = new URLSearchParams(config.params).toString();
      if (qs) path = `${path}?${qs}`;
    }
    // For multipart/form-data (file uploads), sign with empty body since the server
    // cannot reconstruct the multipart body for verification
    const isMultipart = config.data instanceof FormData;
    const body = isMultipart ? '' : (config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : '');
    config.headers['X-Hmac-Signature'] = await generateHmac(method, path, body, timestamp, signingKey);
  }

  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken && !error.config._retry) {
        error.config._retry = true;
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          if (data.signingKey) {
            localStorage.setItem('signingKey', data.signingKey);
          }
          error.config.headers.Authorization = `Bearer ${data.accessToken}`;
          return httpClient(error.config);
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('signingKey');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default httpClient;
