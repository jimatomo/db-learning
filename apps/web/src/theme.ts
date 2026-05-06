import { createTheme, type MantineColorsTuple } from "@mantine/core";

const brand: MantineColorsTuple = [
  "#fff0e7",
  "#ffe0cf",
  "#f7be99",
  "#ef9963",
  "#e47a39",
  "#d4662c",
  "#b7521d",
  "#934015",
  "#753413",
  "#4b220a",
];

export const appTheme = createTheme({
  primaryColor: "brand",
  colors: { brand },
  defaultRadius: "sm",
  fontFamily: '"Avenir Next", "Hiragino Sans", "Yu Gothic", sans-serif',
  headings: {
    fontFamily: '"Iowan Old Style", "Times New Roman", serif',
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "2.4rem", lineHeight: "1.02" },
      h2: { fontSize: "1.45rem", lineHeight: "1.15" },
      h3: { fontSize: "1.1rem", lineHeight: "1.2" },
    },
  },
  defaultGradient: { from: "brand.4", to: "brand.7", deg: 135 },
  shadows: {
    sm: "0 8px 20px rgb(83 56 32 / 0.08)",
    md: "0 18px 36px rgb(83 56 32 / 0.12)",
    lg: "0 28px 52px rgb(83 56 32 / 0.18)",
  },
});
