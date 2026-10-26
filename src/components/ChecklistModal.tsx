import React, { useState, useEffect } from 'react';
import { ChecklistRecord, SemaphoreLevel } from '../types/bioreactor';
import {
  REACTORS,
  SCALE_SPECS,
  getDOPhaseForHours,
  getScaleByReactorId,
  validateChecklistValues,
} from '../constants/reactorConfig';
import { INITIAL_OPERATORS } from '../data/seedData';
import { X, CheckCircle, AlertTriangle, Activity, Check, AlertCircle, UserPlus } from 'lucide-react';

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: ChecklistRecord) => void;
  initialReactorId?: number;
  operators?: string[];
  onAddOperator?: (newOperator: string) => void;
}

export const ChecklistModal: React.FC<ChecklistModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialReactorId = 2,
  operators = INITIAL_OPERATORS,
  onAddOperator,
}) => {
  const [reactorId, setReactorId] = useState<number>(initialReactorId);
  const [operatorName, setOperatorName] = useState<string>(operators[0] || INITIAL_OPERATORS[0]);
  const [isCustomOperatorMode, setIsCustomOperatorMode] = useState<boolean>(false);
  const [customOperatorInput, setCustomOperatorInput] = useState<string>('');

  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState<string>(
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const [processHours, setProcessHours] = useState<number>(24);
  const [batchId, setBatchId] = useState<string>('L-100-24B');

  // Parameters
  const [temperature, setTemperature] = useState<number>(30.0);
  const [dissolvedOxygen, setDissolvedOxygen] = useState<number>(21.0);
  const [agitation, setAgitation] = useState<number>(95);
  const [pressure, setPressure] = useState<number>(0.1);
  const [airflow, setAirflow] = useState<number>(85);
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const scale = getScaleByReactorId(reactorId);
  const specs = SCALE_SPECS[scale];
  const activeReactor = REACTORS.find((r) => r.id === reactorId);

  useEffect(() => {
    setReactorId(initialReactorId);
  }, [initialReactorId]);

  useEffect(() => {
    if (!operators.includes(operatorName) && operators.length > 0 && !isCustomOperatorMode) {
      setOperatorName(operators[0]);
    }
  }, [operators, operatorName, isCustomOperatorMode]);

  // When reactorId changes, update default parameters to target
  useEffect(() => {
    const sc = getScaleByReactorId(reactorId);
    const sp = SCALE_SPECS[sc];
    setAgitation(sp.agitation.target);
    setPressure(sp.pressure.target);
    setAirflow(sp.airflow.target);
    const r = REACTORS.find((item) => item.id === reactorId);
    if (r?.currentBatch) {
      setBatchId(r.currentBatch);
    } else {
      setBatchId(`L-${sc}-24A`);
    }
    setErrorMsg('');
  }, [reactorId]);

  if (!isOpen) return null;

  // Validation in real-time with 3-tier color semaphore (without standardCurveO2)
  const validation = validateChecklistValues(scale, {
    temperature,
    dissolvedOxygen,
    agitation,
    pressure,
    airflow,
    processHours,
  });

  const doPhase = getDOPhaseForHours(scale, processHours);

  // Helper for dark mode semaphore card classes
  const getSemaphoreCardStyle = (level: SemaphoreLevel) => {
    switch (level) {
      case 'nominal':
        return 'bg-emerald-950/35 border-emerald-500/60 ring-1 ring-emerald-500/20';
      case 'warning':
        return 'bg-amber-950/40 border-amber-500/70 ring-1 ring-amber-500/25';
      case 'critical':
        return 'bg-rose-950/50 border-rose-500 ring-2 ring-rose-500/30';
      case 'free':
      default:
        return 'bg-[#131C2E]/80 border-slate-700/80';
    }
  };

  const getSemaphoreInputStyle = (level: SemaphoreLevel) => {
    switch (level) {
      case 'nominal':
        return 'border-emerald-500/60 text-emerald-100 bg-[#080C14] focus:ring-emerald-500';
      case 'warning':
        return 'border-amber-500/70 text-amber-100 bg-[#080C14] focus:ring-amber-500';
      case 'critical':
        return 'border-rose-500 text-rose-100 bg-[#080C14] focus:ring-rose-500';
      case 'free':
      default:
        return 'border-slate-700 text-slate-100 bg-[#080C14] focus:ring-cyan-500';
    }
  };

  const renderSemaphoreBadge = (level: SemaphoreLevel) => {
    if (level === 'nominal') {
      return (
        <span className="font-semibold text-emerald-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          Dentro da Faixa
        </span>
      );
    }
    if (level === 'warning') {
      return (
        <span className="font-semibold text-amber-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Próximo ao Limite
        </span>
      );
    }
    if (level === 'critical') {
      return (
        <span className="font-bold text-rose-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
          FORA DA FAIXA
        </span>
      );
    }
    return (
      <span className="font-medium text-slate-400 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
        Registro Livre
      </span>
    );
  };

  const handleConfirmCustomOperator = () => {
    const trimmed = customOperatorInput.trim();
    if (!trimmed) return;
    if (onAddOperator) {
      onAddOperator(trimmed);
    }
    setOperatorName(trimmed);
    setCustomOperatorInput('');
    setIsCustomOperatorMode(false);
  };

  const effectiveOperatorName = isCustomOperatorMode
    ? customOperatorInput.trim() || operatorName
    : operatorName;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalOperator = (isCustomOperatorMode ? customOperatorInput.trim() : operatorName.trim()) || 'Operador';

    if (isCustomOperatorMode && !customOperatorInput.trim()) {
      setErrorMsg('Por favor, digite o nome do novo operador ou selecione um nome da lista suspensa.');
      return;
    }

    if (!validation.isFullyNominal && !notes.trim()) {
      setErrorMsg(
        'Atenção GMP: Como há parâmetro(s) em VERMELHO (fora da faixa aceitável), é obrigatório preencher a justificativa ou ação corretiva tomada.'
      );
      return;
    }

    // Se for um nome novo, incrementa automaticamente na lista suspensa
    if (onAddOperator && finalOperator) {
      onAddOperator(finalOperator);
    }

    const newRecord: ChecklistRecord = {
      id: `chk-${Date.now()}`,
      reactorId,
      reactorTag: `BR-${String(reactorId).padStart(2, '0')}`,
      scale,
      batchId: batchId || `L-${scale}-${Date.now().toString().slice(-4)}`,
      operatorName: finalOperator,
      date,
      time,
      timestamp: new Date(`${date}T${time}:00`).getTime(),
      processHours,
      archived: false,
      temperature,
      dissolvedOxygen,
      agitation,
      pressure,
      airflow,
      isTemperatureNominal: validation.isTemperatureNominal,
      isPressureNominal: validation.isPressureNominal,
      isAgitationNominal: validation.isAgitationNominal,
      isAirflowNominal: validation.isAirflowNominal,
      isDONominal: validation.isDONominal,
      isFullyNominal: validation.isFullyNominal,
      deviationsCount: validation.deviationsCount,
      deviationNotes: validation.deviations.length > 0 ? validation.deviations.join('; ') : undefined,
      operatorSignature: `OP-${finalOperator.split(' ')[0].toUpperCase()}`,
      notes: notes.trim(),
    };

    setIsCustomOperatorMode(false);
    setCustomOperatorInput('');
    onSave(newRecord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#0F1624] rounded-xl shadow-2xl border border-slate-700/80 w-full max-w-3xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#080C14] text-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/15 rounded-lg text-cyan-400 border border-cyan-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                Novo Checklist de Parâmetros de Biorreator
              </h2>
              <p className="text-xs text-slate-400">
                Sinalização visual inteligente por cores (Verde: Nominal · Amarelo: Borda · Vermelho: Fora da Faixa)
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

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Section 1: Identification & Metadata */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 mb-3">
              01. Identificação do Equipamento & Lote
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Reactor Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Número do Biorreator *
                </label>
                <select
                  value={reactorId}
                  onChange={(e) => setReactorId(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {REACTORS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag} · {r.name} ({r.scale})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Escala: <strong className="text-cyan-400">{scale}</strong>
                </span>
              </div>

              {/* Operator Select + Add New Operator */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 whitespace-nowrap">
                    Nome *
                  </label>
                  {!isCustomOperatorMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomOperatorMode(true);
                        setCustomOperatorInput('');
                      }}
                      className="text-[11px] leading-4 font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 whitespace-nowrap"
                    >
                      <UserPlus className="w-3 h-3 shrink-0" />
                      Novo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomOperatorMode(false);
                        setCustomOperatorInput('');
                      }}
                      className="text-[11px] leading-4 font-semibold text-slate-400 hover:text-slate-200 whitespace-nowrap"
                    >
                      Lista
                    </button>
                  )}
                </div>

                {!isCustomOperatorMode ? (
                  <select
                    value={operatorName}
                    onChange={(e) => {
                      if (e.target.value === '__ADD_NEW__') {
                        setIsCustomOperatorMode(true);
                        setCustomOperatorInput('');
                      } else {
                        setOperatorName(e.target.value);
                      }
                    }}
                    className="w-full text-xs bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {operators.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                    <option value="__ADD_NEW__" className="text-cyan-400 font-semibold">
                      + Digitar um nome novo...
                    </option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customOperatorInput}
                      onChange={(e) => setCustomOperatorInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmCustomOperator();
                        }
                      }}
                      placeholder="Digite o novo operador..."
                      autoFocus
                      className="w-full text-xs bg-[#080C14] border border-cyan-500/70 rounded-lg px-2.5 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmCustomOperator}
                      disabled={!customOperatorInput.trim()}
                      className="px-2.5 py-2 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-slate-950 rounded-lg transition-colors shrink-0"
                      title="Adicionar à lista suspensa"
                    >
                      Add
                    </button>
                  </div>
                )}
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {isCustomOperatorMode
                    ? 'Será adicionado à lista suspensa'
                    : 'Responsável pelo registro'}
                </span>
              </div>

              {/* Date & Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Data *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Horário *</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Batch & Process Age */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Código do Lote / Batelada (Batch ID) *
                </label>
                <input
                  type="text"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  placeholder="Ex: L-100-24B"
                  required
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tempo de Cultivo / Idade da Batelada (Horas) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="120"
                    value={processHours}
                    onChange={(e) => setProcessHours(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <span className="text-xs font-mono text-slate-400">horas</span>
                </div>
                {doPhase ? (
                  <span className="text-[11px] text-teal-400 font-medium mt-1 block">
                    Fase O2 ({scale}): <strong>{doPhase.phase}</strong> ({doPhase.intervalHours}) · Faixa O2:{' '}
                    {doPhase.o2ProbeMin}% a {doPhase.o2ProbeMax}%
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Escala {scale}: sem curva tabelada de O2 (registro livre)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Parameters & Realtime Color Semaphore */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-bold text-slate-400">
                02. Parâmetros do Processo & Semáforo de Faixa Aceitável ({scale})
              </h3>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Nominal
                </span>
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Limite Próximo
                </span>
                <span className="flex items-center gap-1 text-rose-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Fora da Faixa
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Temperatura */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.tempSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Temperatura (°C) *</label>
                  <span className="text-[11px] font-mono text-slate-400">Alvo: 30°C (±2°C)</span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.tempSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">Aceitável: 28.0 a 32.0 °C</span>
                  {renderSemaphoreBadge(validation.tempSemaphore)}
                </div>
              </div>

              {/* Pressão */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.presSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Pressão (bar) *</label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Alvo: {specs.pressure.target.toFixed(1)} (±0.5)
                  </span>
                </div>
                <input
                  type="number"
                  step="0.05"
                  required
                  value={pressure}
                  onChange={(e) => setPressure(parseFloat(e.target.value) || 0)}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.presSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">
                    Aceitável: {(specs.pressure.min ?? 0).toFixed(1)} a {(specs.pressure.max ?? 0).toFixed(1)} bar
                  </span>
                  {renderSemaphoreBadge(validation.presSemaphore)}
                </div>
              </div>

              {/* Agitação */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.agitSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Agitação (RPM) *</label>
                  <span className="text-[11px] font-mono text-slate-400">Fixo: {specs.agitation.target} RPM</span>
                </div>
                <input
                  type="number"
                  step="1"
                  required
                  value={agitation}
                  onChange={(e) => setAgitation(parseFloat(e.target.value) || 0)}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.agitSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">Exato: {specs.agitation.target} RPM</span>
                  {renderSemaphoreBadge(validation.agitSemaphore)}
                </div>
              </div>

              {/* Vazão de Ar */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.airSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Vazão de Ar (L/min) *</label>
                  <span className="text-[11px] font-mono text-slate-400">Alvo: {specs.airflow.target} (±10)</span>
                </div>
                <input
                  type="number"
                  step="1"
                  required
                  value={airflow}
                  onChange={(e) => setAirflow(parseFloat(e.target.value) || 0)}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.airSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">
                    Aceitável: {specs.airflow.min} a {specs.airflow.max} L/min
                  </span>
                  {renderSemaphoreBadge(validation.airSemaphore)}
                </div>
              </div>

              {/* Oxigênio Dissolvido (Sonda %) */}
              <div className={`p-3.5 rounded-lg border transition-all ${getSemaphoreCardStyle(validation.doSemaphore)}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-100">Oxigênio Dissolvido (%) *</label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {doPhase ? `Fase: ${doPhase.phase}` : 'Sem faixa (Livre)'}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.05"
                  required
                  value={dissolvedOxygen}
                  onChange={(e) => setDissolvedOxygen(parseFloat(e.target.value) || 0)}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.doSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">
                    {doPhase ? `${doPhase.o2ProbeMin}% a ${doPhase.o2ProbeMax}%` : `Escala ${scale}: livre`}
                  </span>
                  {renderSemaphoreBadge(validation.doSemaphore)}
                </div>
              </div>
            </div>
          </div>

          {/* Live Status Banner */}
          {validation.isFullyNominal && validation.warningsCount === 0 ? (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/50 rounded-lg flex items-center gap-2.5 text-xs text-emerald-200">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-emerald-300">Leitura 100% Nominal (Verde):</strong> Todos os parâmetros estão confortavelmente dentro das faixas aceitáveis para o biorreator {activeReactor?.tag} ({scale}).
              </span>
            </div>
          ) : validation.isFullyNominal && validation.warningsCount > 0 ? (
            <div className="p-3.5 bg-amber-950/50 border border-amber-500/60 rounded-lg space-y-1 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Atenção Preventiva (Amarelo): Parâmetro(s) próximo(s) do limite aceitável:</span>
              </div>
              <ul className="list-disc list-inside pl-1 text-[11px] space-y-0.5 text-amber-200">
                {validation.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-3.5 bg-rose-950/60 border-2 border-rose-500/80 rounded-lg space-y-1.5 text-xs text-rose-200">
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>ALERTA VERMELHO: {validation.deviationsCount} parâmetro(s) FORA DA FAIXA ACEITÁVEL:</span>
              </div>
              <ul className="list-disc list-inside pl-1 text-[11px] font-medium space-y-0.5 text-rose-200">
                {validation.deviations.map((dev, i) => (
                  <li key={i}>{dev}</li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-300 font-semibold pt-1">
                * Preencha obrigatoriamente o campo de Ação Corretiva abaixo para registrar este checklist.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-600 text-white text-xs font-semibold rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 3: Notes & Mandatory Corrective Action if Red */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {validation.isFullyNominal
                ? 'Observações do Turno (Opcional)'
                : 'Justificativa / Ação Corretiva Obrigatória (Parâmetro Fora da Faixa) *'}
            </label>
            <textarea
              rows={2}
              required={!validation.isFullyNominal}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder={
                validation.isFullyNominal
                  ? 'Ex: Sondas verificadas; Batelada operando em regime estacionário...'
                  : 'Descreva obrigatoriamente a ação tomada (ex: Ajuste de válvula de ar, reinicialização do chiller, calibração de sonda)...'
              }
              className={`w-full text-xs bg-[#080C14] border rounded-lg p-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                !validation.isFullyNominal
                  ? 'border-rose-500 focus:ring-rose-500'
                  : 'border-slate-700 focus:ring-cyan-500'
              }`}
            />
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <span className="text-xs text-slate-400 font-mono">
              Assinatura Eletrônica: OP-{effectiveOperatorName.split(' ')[0]?.toUpperCase() || 'OPERADOR'}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-300 bg-[#131C2E] border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`px-5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  validation.isFullyNominal
                    ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                {validation.isFullyNominal ? 'Salvar Checklist Nominal' : 'Registrar com Desvio Justificado'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
