import ChatWidget from "@/components/ChatWidget";

// Página servida dentro de un iframe en b2b.esgas.es.
// La identidad llega por postMessage desde widget.js (token firmado del módulo nexionchat, o el e-mail que publica la tienda).
export const dynamic = "force-dynamic";

export default function EmbedPage({
  searchParams,
}: {
  searchParams: { logo?: string; color?: string; company?: string };
}) {
  const logoUrl = searchParams.logo || undefined;
  const primaryColor = searchParams.color || "#0066cc";
  const companyName = searchParams.company || "ESGAS";
  // Solo para clientes con sesión si se pide expresamente. Antes dependía de
  // que existiera HMAC_SECRET: poner el secreto sin el módulo instalado en la
  // tienda bloqueaba el chat a todo el mundo.
  const requireAuth = process.env.CHAT_SOLO_CLIENTES === "1";

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
