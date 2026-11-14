export const colors = {
  primary: "#16a34a",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  background: "#f9fafb",
  surface: "#ffffff",
  danger: "#dc2626",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 };

export const formatUGX = (price: string | number) =>
  `UGX ${Math.round(Number(price)).toLocaleString("en-US")}`;
