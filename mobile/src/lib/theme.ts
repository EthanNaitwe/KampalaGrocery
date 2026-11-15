import { Platform, type ViewStyle } from "react-native";

export const colors = {
  /** Brand green: buttons, active states, prices. */
  primary: "#178A17",
  primaryDark: "#106B10",
  /** Tinted fill for selected chips/options. */
  primarySoft: "#EAF5EA",
  text: "#1B1D1B",
  muted: "#7B7F7B",
  border: "#ECEDEC",
  /** App canvas: soft grey so white cards stand out. */
  background: "#F4F5F4",
  surface: "#FFFFFF",
  danger: "#D32F2F",
  warning: "#B45309",
  onPrimary: "#FFFFFF",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 };

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

/** Soft card elevation, consistent on both platforms. */
export const shadow: ViewStyle = Platform.select<ViewStyle>({
  ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  default: { elevation: 2 },
})!;

export const formatUGX = (price: string | number) =>
  `UGX ${Math.round(Number(price)).toLocaleString("en-US")}`;
