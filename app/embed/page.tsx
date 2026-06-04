import ChatWidget from "@/components/ChatWidget";

// Página pensada para cargarse dentro de un iframe (widget.js).
// Lee la configuración de los query params que inyecta el script de embed.
export const dynamic = "force-dynamic";

export default function EmbedPage({
  searchParams,
}: {
  searchParams: { logo?: string; color?: string; company?: string };
}) {
  // Si no se pasa un logo personalizado, el widget usa el robot de marca.
  const logoUrl = searchParams.logo || undefined;
  const primaryColor = searchParams.color || "#0066cc";
  const companyName = searchParams.company || "ESGAS";

  return (
    <div className="h-screen w-screen bg-transparent">
      <ChatWidget
        logoUrl={logoUrl}
        primaryColor={primaryColor}
        companyName={companyName}
      />
    </div>
  );
}
