import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESGAS · Chatbot de ventas técnicas NTN/SNR",
  description:
    "Carlos, el asesor técnico-comercial de ESGAS, distribuidor oficial NTN/SNR en España. Encuentra tu rodamiento al mejor precio.",
  icons: {
    icon: "/logo-mark.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
