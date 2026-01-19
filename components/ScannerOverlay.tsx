import React from "react";

/**
 * ScannerOverlay
 * ----------------
 * Overlay visual para área de captura da câmera.
 * NÃO controla câmera, NÃO interfere em OCR.
 * Apenas UX (orientação + animação).
 */
export default function ScannerOverlay() {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Overlay escuro geral */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Área central de captura */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[85%] h-[70%] max-w-md">

          {/* Recorte / moldura */}
          <div className="absolute inset-0 rounded-2xl border-2 border-white/70" />

          {/* Máscara externa (escurece fora da área útil) */}
          <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]" />

          {/* Guias de canto */}
          <CornerGuides />

          {/* Linha animada de scan */}
          <ScanLine />
        </div>
      </div>
    </div>
  );
}

/* =========================
   Cantos orientadores
========================= */

function CornerGuides() {
  const base = "absolute w-8 h-8 border-white/80";

  return (
    <>
      <div className={`${base} top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl`} />
      <div className={`${base} top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl`} />
      <div className={`${base} bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl`} />
      <div className={`${base} bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl`} />
    </>
  );
}

/* =========================
   Linha animada
========================= */

function ScanLine() {
  return (
    <div className="absolute inset-x-2 top-2 h-[2px] bg-emerald-400 opacity-80 animate-scan" />
  );
}
