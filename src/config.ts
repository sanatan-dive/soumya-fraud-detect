// Central place to configure backend API root.
// Allows switching between Docker Compose backend and local dev easily.
// If VITE_API_URL env variable is set (e.g., via `VITE_API_URL=http://localhost:5000`), use that.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
