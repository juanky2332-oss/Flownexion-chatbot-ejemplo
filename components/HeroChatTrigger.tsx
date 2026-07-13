"use client";

import RealisticRobot from "./RealisticRobot";

/**
 * Robot grande del hero de la landing: al pincharlo (o pinchar la frase de
 * debajo) dispara el evento "esgas-open-chat", que ChatWidget escucha para
 * abrirse abajo a la derecha.
 */
export default function HeroChatTrigger() {
  const openChat = () => window.dispatchEvent(new Event("esgas-open-chat"));

  return (
    <button
      type="button"
      onClick={openChat}
      aria-label="Abrir el chat del técnico de ESGAS"
      className="group flex cursor-pointer flex-col items-center border-0 bg-transparent outline-none"
    >
      <div className="transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
        <RealisticRobot size={160} isPointing />
      </div>
      <p className="mt-4 max-w-md text-sm font-medium text-gray-600">
        ¿Dudas técnicas sobre un producto o quieres gestionar tu pedido?{" "}
        <span className="font-bold text-esgas underline decoration-2 underline-offset-4">
          Pincha aquí
        </span>{" "}
        y habla con el técnico.
      </p>
    </button>
  );
}
