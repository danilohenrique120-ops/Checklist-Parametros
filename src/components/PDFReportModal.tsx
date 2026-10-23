import React, { useState } from 'react';
import { ChecklistRecord } from '../types/bioreactor';
import { downloadBioreactorPDF } from '../services/pdfService';
import { REACTORS } from '../constants/reactorConfig';
import { FileText, Download, X } from 'lucide-react';

interface PDFReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: ChecklistRecord[];
  currentReactorId: number | 'all';
}

export const PDFReportModal: React.FC<PDFReportModalProps> = ({
  isOpen,
  onClose,
  records,
  currentReactorId,
}) => {
  const [targetReactorId, setTargetReactorId] = useState<number | 'all'>(currentReactorId);
  const [operatorName, setOperatorName] = useState<string>('Danilo Henrique');
  const [reportTitle, setReportTitle] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  if (!isOpen) return null;

  const filteredRecords = records.filter((r) => {
    if (targetReactorId !== 'all' && r.reactorId !== targetReactorId) return false;
    return true;
  });

  const selectedReactor = targetReactorId === 'all' ? undefined : REACTORS.find((r) => r.id === targetReactorId);

  const total = filteredRecords.length;
  const nominal = filteredRecords.filter((r) => r.isFullyNominal).length;
  const deviations = total - nominal;
  const compliance = total > 0 ? ((nominal / total) * 100).toFixed(1) : '100';

  const handleDownload = () => {
    setIsGenerating(true);
    try {
      downloadBioreactorPDF({
        reactor: selectedReactor,
        records: filteredRecords,
        title: reportTitle.trim() || undefined,
        generatedBy: operatorName.trim() || 'Operador Responsável',
      });
      onClose();
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#0F1624] rounded-xl shadow-2xl border border-slate-700/80 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#080C14] text-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/15 text-cyan-400 rounded-lg border border-cyan-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Gerador de Relatórios Técnicos em PDF</h3>
              <p className="text-xs text-slate-400">Auditoria GMP, médias dos parâmetros e histórico de tolerâncias</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Reactor Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Escopo do Relatório *
            </label>
            <select
              value={targetReactorId}
              onChange={(e) => setTargetReactorId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">Consolidado Geral (Todos os 16 Biorreatores)</option>
              <optgroup label="Biorreatores 100L (1 ao 5)">
                {REACTORS.filter((r) => r.scale === '100L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name} (100L)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Biorreatores 500L (6 ao 10)">
                {REACTORS.filter((r) => r.scale === '500L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name} (500L)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Biorreatores 5000L (11 ao 14)">
                {REACTORS.filter((r) => r.scale === '5000L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name} (5000L)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Biorreatores 3000L (15 e 16)">
                {REACTORS.filter((r) => r.scale === '3000L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name} (3000L)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Custom Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Título Personalizado do Documento (Opcional)
            </label>
            <input
              type="text"
              placeholder={
                selectedReactor
                  ? `Relatório Técnico de Fermentação - ${selectedReactor.tag}`
                  : 'Relatório Consolidado de Biorreatores'
              }
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="w-full text-xs bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Responsible Operator / Signee */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nome do Responsável Técnico / Emissor *
            </label>
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              required
              className="w-full text-xs bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Summary Preview Box */}
          <div className="bg-[#080C14] border border-slate-800 rounded-lg p-3.5 space-y-2">
            <span className="text-xs font-bold text-slate-200 block">Prévia dos Dados a Incluir:</span>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="bg-[#131C2E] p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Registros</span>
                <span className="font-bold text-slate-100">{total}</span>
              </div>
              <div className="bg-[#131C2E] p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Conformes</span>
                <span className="font-bold text-emerald-400">{nominal}</span>
              </div>
              <div className="bg-[#131C2E] p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Desvios</span>
                <span className="font-bold text-rose-400">{deviations}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Taxa de Conformidade: <strong className="text-cyan-400">{compliance}%</strong>. Inclui médias calculadas, critérios de especificação, tabela completa de medições e campos formais de assinatura.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#080C14] border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-[#131C2E] border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating || total === 0}
            className="px-5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            {isGenerating ? 'Gerando PDF...' : 'Baixar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};
