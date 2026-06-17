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

  // Sin sesión activa: bloqueo a nivel servidor antes de cargar el widget
  if (!customerEmail) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-white p-8 text-center font-sans">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-3xl">
          🔒
        </div>
        <div>
          <p className="font-semibold text-gray-800">Acceso exclusivo para clientes B2B</p>
          <p className="mt-2 text-sm text-gray-500">
            Debes iniciar sesión en el portal para acceder al asistente técnico y ver tus precios personalizados.
          </p>
        </div>
        <a
          href="https://b2b.esgas.es/iniciar-sesion"
          className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Iniciar sesión en b2b.esgas.es →
        </a>
      </div>
    );
  }

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
