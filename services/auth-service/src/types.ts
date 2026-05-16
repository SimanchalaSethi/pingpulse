export interface User {
  id: string;
  email: string;
  workspaceId: string;
  role: 'admin' | 'member';
  createdAt: string;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
