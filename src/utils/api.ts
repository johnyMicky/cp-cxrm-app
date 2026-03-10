export async function apiFetch(url: string, options: RequestInit = {}) {
  const userId = localStorage.getItem('userId');
  const headers = {
    ...options.headers,
    'x-user-id': userId || '',
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401 && !url.includes('/api/login')) {
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userAvatar');
    window.location.href = '/login';
  }

  return response;
}
