const BASE = import.meta.env.VITE_API_URL || '';

export const apiUrl = (p) => `${BASE}${p}`;
