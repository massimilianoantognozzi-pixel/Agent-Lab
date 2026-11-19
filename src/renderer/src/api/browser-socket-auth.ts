export const getBrowserSocketAuth =
  (baseUrl: string) =>
  (callback: (auth: { ticket?: string }) => void): void => {
    void fetch(`${baseUrl}/api/socket-ticket`, { method: 'POST', credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          return {};
        }
        const result = (await response.json()) as { ticket?: unknown };
        return typeof result.ticket === 'string' ? { ticket: result.ticket } : {};
      })
      .then(callback, () => callback({}));
  };
