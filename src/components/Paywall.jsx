export default function Paywall({ onClose, onSelectPlan }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div className="bg-neutral-900 text-neutral-100 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-xl">

        {/* HEADER */}
        <header className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Limite atingido</h2>
          <p className="text-sm opacity-70">
            Escolha como deseja continuar
          </p>
        </header>

        {/* FREEMIUM */}
        <div className="border border-cyan-700 rounded-xl p-4 space-y-3">
          <h3 className="text-lg font-medium text-cyan-400">
            Freemium ⭐
          </h3>
          <ul className="text-sm opacity-80 list-disc list-inside">
            <li>Mais páginas por dia</li>
            <li>Importação ampliada</li>
            <li>Inclusão</li>
            <li>ATUALMENTE EM TESTE - SEM CUSTO</li>
          </ul>

          <button
            onClick={() => onSelectPlan("freemium")}
            className="w-full bg-cyan-700 hover:bg-cyan-600 py-2 rounded-lg text-sm font-medium"
          >
            Continuar no Freemium
          </button>
        </div>

        {/* PREMIUM */}
        <div className="border border-amber-700 rounded-xl p-4 space-y-3">
          <h3 className="text-lg font-medium text-amber-400">
            Premium 👑
          </h3>
          <ul className="text-sm opacity-80 list-disc list-inside">
            <li>Uso expandido</li>
            <li>Prioridade de leitura</li>
            <li>Acessibilidade avançada</li>
            <li>Controle de narração-opções de vozes</li>
            <li>1500 scans - sem bloqueios diários</li>
            <li>BREVE LIBERAÇÃO PARA TESTES  </li>
          </ul>

          <button
            onClick={() => onSelectPlan("freemium")}
            className="w-full bg-amber-700 hover:bg-amber-600 py-2 rounded-lg text-sm font-semibold"
          >
            Assinar Premium
          </button>
        </div>

        {/* FOOTER */}
        <button
          onClick={onClose}
          className="w-full text-sm opacity-60 hover:opacity-100"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
