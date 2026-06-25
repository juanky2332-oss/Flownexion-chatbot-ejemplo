import ChatWidget from "@/components/ChatWidget";

// Página servida dentro de un iframe en b2b.esgas.es.
// La identidad llega vía postMessage (esgas-identity-token) desde el módulo nexionchat de PS.
export const dynamic = "force-dynamic";

export default function EmbedPage({
  searchParams,
}: {
  searchParams: { logo?: string; color?: string; company?: string };
}) {
  const logoUrl = searchParams.logo || undefined;
  const primaryColor = searchParams.color || "#0066cc";
  const companyName = searchParams.company || "ESGAS";
  const requireAuth = !!process.env.HMAC_SECRET;

  return (
    <div className="h-screen w-screen bg-transparent">
      <ChatWidget
        logoUrl={logoUrl}
        primaryColor={primaryColor}
        companyName={companyName}
        startOpen={false}
        requireAuth={requireAuth}
      />
    </div>
  );
}
