// Configure your API base URL here
// For development, use your local IP address or ngrok URL
// For production, use your deployed API URL
const API_BASE_URL = 'http://localhost:5000'; // Update this to your actual API URL

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}