import ChatWidget from "@/components/ChatWidget";

// Página pensada para cargarse dentro de un iframe en b2b.esgas.es.
// PrestaShop inyecta el email del cliente logueado via ?email= en la URL.
export const dynamic = "force-dynamic";

export default function EmbedPage({
  searchParams,
}: {
  searchParams: { logo?: string; color?: string; company?: string; email?: string };
}) {
  const logoUrl = searchParams.logo || undefined;
  const primaryColor = searchParams.color || "#0066cc";
  const companyName = searchParams.company || "ESGAS";
  const customerEmail = searchParams.email || undefined;

  return (
    <div className="h-screen w-screen bg-transparent">
      <ChatWidget
        logoUrl={logoUrl}
        primaryColor={primaryColor}
        companyName={companyName}
        customerEmail={customerEmail}
        startOpen={true}
      />
    </div>
  );
}
