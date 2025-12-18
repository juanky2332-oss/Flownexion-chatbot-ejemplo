
import React from 'react';
import ChatWidget from './components/ChatWidget';
import { Rocket, Zap, Shield, ChevronRight, Cpu, Layers, Globe, Sparkles } from 'lucide-react';
const App: React.FC = () => {
  // Check if we are in widget mode (e.g. ?widget=true)
  const isWidget = new URLSearchParams(window.location.search).get('widget') === 'true';
  React.useEffect(() => {
    if (isWidget) {
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
    }
  }, [isWidget]);
  if (isWidget) {
    return (
      <div className="min-h-screen bg-transparent">
        <ChatWidget />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#05070A] text-slate-200 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-40 glass-card border-b border-white/5 py-4 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="text-white w-5 h-5 fill-current" />
            </div>
            <span className="font-bold text-xl tracking-tighter text-white">FLOWNEXION</span>
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium text-slate-400">
            <a href="#" className="hover:text-cyan-400 transition-colors">Servicios</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Casos de Éxito</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Sobre Nosotros</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Contacto</a>
          </div>
          <button className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-5 py-2 rounded-full text-sm font-semibold transition-all">
            Consultoría Gratis
          </button>
        </div>
      </nav>
      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-cyan-500/10 blur-[120px] -z-10 rounded-full"></div>
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 px-4 py-1.5 rounded-full mb-8">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">IA & Automatización Empresarial</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold mb-8 leading-tight tracking-tight text-white">
            Diseñamos flujos <span className="gradient-text">inteligentes</span> <br />
            para negocios del futuro.
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-slate-400 mb-12">
            Optimizamos cada proceso de tu empresa con soluciones de Inteligencia Artificial personalizadas. Más eficiencia, menos errores, mayor rentabilidad.
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <button className="w-full md:w-auto bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-8 py-4 rounded-xl transition-all transform hover:scale-105 shadow-xl shadow-cyan-500/20">
              Transformar mi Negocio
            </button>
            <button className="w-full md:w-auto bg-white/5 hover:bg-white/10 text-white font-bold px-8 py-4 rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2">
              Ver Soluciones <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </section>
      {/* Services Grid */}
      <section className="py-20 px-6 bg-slate-950/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-4xl font-bold text-white mb-4">Nuestros Pilares de <br /> Innovación Digital</h2>
              <p className="text-slate-400">En Flownexion, no solo automatizamos; repensamos la forma en que el software y las personas colaboran.</p>
            </div>
            <div className="flex gap-4">
              <div className="p-4 glass-card rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-2xl">98%</div>
                <div className="text-xs text-slate-500 font-medium uppercase tracking-tighter">Precisión en <br />Automatización</div>
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-card p-8 rounded-3xl hover:bg-white/5 transition-all group border border-white/5">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-6 group-hover:bg-cyan-500/20 transition-all">
                <Cpu className="text-cyan-400 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">IA Generativa</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Integramos modelos avanzados como Gemini para automatizar contenido, análisis de datos y atención al cliente premium.
              </p>
            </div>
            <div className="glass-card p-8 rounded-3xl hover:bg-white/5 transition-all group border border-white/5">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-all">
                <Layers className="text-blue-400 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Workflows Inteligentes</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Diseñamos flujos que conectan todas tus herramientas, eliminando tareas repetitivas y cuellos de botella.
              </p>
            </div>
            <div className="glass-card p-8 rounded-3xl hover:bg-white/5 transition-all group border border-white/5">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 group-hover:bg-purple-500/20 transition-all">
                <Globe className="text-purple-400 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">SaaS & Apps</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Desarrollamos soluciones digitales escalables que se adaptan al crecimiento de tu empresa desde el primer día.
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* Trust Section */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1">
            <div className="relative">
              <img src="https://picsum.photos/800/600?grayscale" alt="Team collaborating" className="rounded-3xl shadow-2xl grayscale hover:grayscale-0 transition-all duration-700 border border-white/10" />
              <div className="absolute -bottom-6 -right-6 glass-card p-6 rounded-2xl animate-bounce">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Shield className="text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Enterprise Ready</p>
                    <p className="text-lg font-bold text-white">Seguridad Total</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-4xl font-bold text-white mb-6">Por qué las empresas eligen <span className="text-cyan-400">Flownexion</span></h2>
            <ul className="space-y-6">
              {[
                { title: "Implementación Ágil", desc: "Resultados visibles en menos de 4 semanas." },
                { title: "Expertise Técnico", desc: "Ingenieros especialistas en las últimas APIs de IA." },
                { title: "Soporte Continuo", desc: "No te dejamos solo tras la entrega; crecemos contigo." }
              ].map((item, i) => (
                <li key={i} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0 mt-1">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">{item.title}</h4>
                    <p className="text-sm text-slate-500">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      {/* Footer */}
      <footer className="py-12 border-t border-white/5 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-cyan-500 rounded flex items-center justify-center">
              <Zap size={14} className="text-white fill-current" />
            </div>
            <span className="font-bold text-lg text-white">FLOWNEXION</span>
          </div>
          <p className="text-slate-500 text-sm">© 2025 Flownexion Digital Solutions. Todos los derechos reservados.</p>
          <div className="flex gap-6 text-slate-500 text-sm">
            <a href="#" className="hover:text-cyan-400">Privacidad</a>
            <a href="#" className="hover:text-cyan-400">Términos</a>
            <a href="#" className="hover:text-cyan-400">LinkedIn</a>
          </div>
        </div>
      </footer>
      {/* Chat Bot UI */}
      <ChatWidget />
    </div>
  );
};
export default App;
