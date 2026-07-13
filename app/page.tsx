import ChatWidget from "@/components/ChatWidget";
import HeroChatTrigger from "@/components/HeroChatTrigger";
import RealisticRobot from "@/components/RealisticRobot";

const PRIMARY = "#0066cc";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-esgas-light via-white to-white">
      {/* Cabecera */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <RealisticRobot size={40} onlyHead />
          <span className="text-xl font-extrabold tracking-tight text-gray-900">
            ESGAS
          </span>
        </div>
        <a
          href="https://esgas.nodoflow.com"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: PRIMARY }}
        >
          Ir a la tienda
        </a>
      </header>

      {/* Hero con el logo grande (el robot) en el centro */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
        <div className="mb-6 flex items-center justify-center">
          <HeroChatTrigger />
        </div>
        <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-esgas-light px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-esgas">
          Distribuidor oficial NTN/SNR
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          Asesoramiento técnico en rodamientos,
          <span className="text-esgas"> al instante</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-gray-600">
          Habla con el <strong>técnico de ESGAS</strong>. Te ayuda a encontrar el
          rodamiento <strong>NTN/SNR</strong> exacto que necesitas, comprueba el
          stock real y te lleva directo al pago.
        </p>

        <div className="mt-8 grid w-full gap-4 sm:grid-cols-3">
          {[
            { icon: "🔍", title: "Búsqueda real", text: "Catálogo y stock en tiempo real." },
            { icon: "⚙️", title: "Experto NTN/SNR", text: "Equivalencias y sufijos técnicos." },
            { icon: "🛒", title: "Compra directa", text: "Del chat al carrito en un clic." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm"
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{f.text}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-gray-400">
          👉 Pulsa el botón de abajo a la derecha para hablar con el técnico.
        </p>
      </section>

      {/* Widget flotante abajo a la derecha (usa el mismo robot como logo) */}
      <ChatWidget primaryColor={PRIMARY} companyName="ESGAS" />
    </main>
  );
}
