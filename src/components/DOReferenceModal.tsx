import React, { useState } from 'react';
import { DO_REFERENCE_100L, DO_REFERENCE_5000L } from '../constants/reactorConfig';
import { X, Table, Info } from 'lucide-react';

interface DOReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DOReferenceModal: React.FC<DOReferenceModalProps> = ({ isOpen, onClose }) => {
  const [selectedTab, setSelectedTab] = useState<'100L' | '5000L'>('100L');

  if (!isOpen) return null;

  const currentData = selectedTab === '100L' ? DO_REFERENCE_100L : DO_REFERENCE_5000L;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#0F1624] rounded-xl shadow-2xl border border-slate-700/80 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#080C14]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/15 text-cyan-400 rounded-lg border border-cyan-500/30">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Tabela de Referência · Oxigênio Dissolvido
              </h3>
              <p className="text-xs text-slate-400">
                Curvas padrão e faixas esperadas da sonda de O2 por fase de fermentação
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 p-1 bg-[#080C14] border border-slate-800 rounded-lg">
              <button
                onClick={() => setSelectedTab('100L')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  selectedTab === '100L'
                    ? 'bg-[#131C2E] text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Escala 100L (Tanques 1 ao 5)
              </button>
              <button
                onClick={() => setSelectedTab('5000L')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  selectedTab === '5000L'
                    ? 'bg-[#131C2E] text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Escala 5000L (Tanques 11 ao 14)
              </button>
            </div>

            <span className="text-xs font-mono text-cyan-400">
              Ref: {selectedTab}.png
            </span>
          </div>

          {/* Reference Table */}
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0E6470] text-white font-semibold">
                  <th className="py-2.5 px-3.5 border-r border-teal-800">Fase</th>
                  <th className="py-2.5 px-3.5 border-r border-teal-800">Intervalo aproximado</th>
                  <th className="py-2.5 px-3.5 border-r border-teal-800">Média de O2 da sonda</th>
                  <th className="py-2.5 px-3.5">Curva padrão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                {currentData.map((row, idx) => (
                  <tr key={row.phase} className={idx % 2 === 0 ? 'bg-[#080C14]' : 'bg-[#0B101B]'}>
                    <td className="py-2.5 px-3.5 font-sans font-medium text-slate-100 border-r border-slate-800">
                      {row.phase}
                    </td>
                    <td className="py-2.5 px-3.5 border-r border-slate-800 text-slate-300">{row.intervalHours}</td>
                    <td className="py-2.5 px-3.5 border-r border-slate-800 font-semibold text-teal-400">
                      {`${row.o2ProbeMax.toFixed(2).replace('.', ',')}-${row.o2ProbeMin.toFixed(2).replace('.', ',')}%`}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-cyan-400">
                      {row.standardCurveMin.toFixed(3).replace('.', ',')}-{row.standardCurveMax.toFixed(3).replace('.', ',')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Clarification Box */}
          <div className="mt-4 p-3.5 bg-[#080C14] border border-slate-800 rounded-lg text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-cyan-400">
              <Info className="w-4 h-4 shrink-0" />
              <span>Regra de Negócio Biotecnológica:</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              • As curvas de oxigênio dissolvido acima são aplicadas às escalas de <strong className="text-slate-200">100L</strong> e <strong className="text-slate-200">5000L</strong>.<br />
              • Para as escalas de <strong className="text-slate-200">500L</strong> e <strong className="text-slate-200">3000L</strong>, não existem faixas tabeladas de O2 no momento; o registro é mantido para fins de histórico sem disparo de alerta de cor.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#080C14] border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#131C2E] border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
