import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  options: {
    method: string;
    body?: unknown;
  },
): Promise<Response> {
  const res = await fetch(url, {
    method: options.method,
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      // If the server returns a successful response but indicates unauthenticated in body,
      // treat it as null for callers that expect `null` when not logged in.
      const bodyText = await res.text();
      let body: any = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch (_) {
        body = bodyText;
      }

      if (body && typeof body === 'object' && body.message === 'User not logged in') {
        return null;
      }

      // If status is not ok, throw preserving original behavior
      if (!res.ok) {
        const text = bodyText || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }

      return body;
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
