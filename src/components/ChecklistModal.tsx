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
import {
  X,
  CheckCircle,
  AlertTriangle,
  Activity,
  Check,
  AlertCircle,
  UserPlus,
  Clock,
} from 'lucide-react';

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: ChecklistRecord) => void;
  initialReactorId?: number;
  operators?: string[];
  onAddOperator?: (newOperator: string) => void;
  existingRecords?: ChecklistRecord[];
}

function getLocalDateYYYYMMDD(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeHHMM(d: Date = new Date()): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getDefaultInoculationDateTime(now: Date = new Date()): {
  inocDate: string;
  inocTime: string;
} {
  // Define 06:00 como horário padrão de inoculação (se antes das 06:00, usa o dia anterior)
  const defaultInoc = new Date(now.getTime());
  if (defaultInoc.getHours() < 6) {
    defaultInoc.setDate(defaultInoc.getDate() - 1);
  }
  defaultInoc.setHours(6, 0, 0, 0);
  return {
    inocDate: getLocalDateYYYYMMDD(defaultInoc),
    inocTime: '06:00',
  };
}

export const ChecklistModal: React.FC<ChecklistModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialReactorId = 1,
  operators = INITIAL_OPERATORS,
  onAddOperator,
  existingRecords = [],
}) => {
  const [reactorId, setReactorId] = useState<number>(initialReactorId);
  const [operatorName, setOperatorName] = useState<string>(operators[0] || INITIAL_OPERATORS[0]);
  const [isCustomOperatorMode, setIsCustomOperatorMode] = useState<boolean>(false);
  const [customOperatorInput, setCustomOperatorInput] = useState<string>('');

  const [date, setDate] = useState<string>(() => getLocalDateYYYYMMDD());
  const [time, setTime] = useState<string>(() => getLocalTimeHHMM());
  const [inoculationDate, setInoculationDate] = useState<string>(
    () => getDefaultInoculationDateTime().inocDate
  );
  const [inoculationTime, setInoculationTime] = useState<string>(
    () => getDefaultInoculationDateTime().inocTime
  );
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

  // Helper para buscar inoculação recente da batelada ativa deste biorreator
  const resolveInoculationForReactor = (targetReactorId: number, refNow: Date) => {
    const activeReactorRecords = existingRecords
      .filter((r) => r.reactorId === targetReactorId && !r.archived)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (activeReactorRecords.length > 0) {
      const latest = activeReactorRecords[0];
      if (latest.inoculationDate && latest.inoculationTime) {
        const inocTs = new Date(`${latest.inoculationDate}T${latest.inoculationTime}:00`).getTime();
        const elapsedHours = (refNow.getTime() - inocTs) / (1000 * 60 * 60);
        // Reaproveita a inoculação se estiver dentro de uma janela ativa recente (até 120h)
        if (!isNaN(elapsedHours) && elapsedHours >= -24 && elapsedHours <= 120) {
          return {
            inocDate: latest.inoculationDate,
            inocTime: latest.inoculationTime,
            batch: latest.batchId,
          };
        }
      }
    }
    const fallback = getDefaultInoculationDateTime(refNow);
    const r = REACTORS.find((item) => item.id === targetReactorId);
    const sc = getScaleByReactorId(targetReactorId);
    return {
      inocDate: fallback.inocDate,
      inocTime: fallback.inocTime,
      batch: r?.currentBatch || `L-${sc}-24A`,
    };
  };

  // Sempre que o modal abrir, atualiza Data e Horário para o momento atual exato
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setDate(getLocalDateYYYYMMDD(now));
      setTime(getLocalTimeHHMM(now));
      setReactorId(initialReactorId);

      const resolved = resolveInoculationForReactor(initialReactorId, now);
      setInoculationDate(resolved.inocDate);
      setInoculationTime(resolved.inocTime);
      setBatchId(resolved.batch);
      setNotes('');
      setErrorMsg('');
    }
  }, [isOpen, initialReactorId]);

  useEffect(() => {
    if (!operators.includes(operatorName) && operators.length > 0 && !isCustomOperatorMode) {
      setOperatorName(operators[0]);
    }
  }, [operators, operatorName, isCustomOperatorMode]);

  // Quando o operador troca o biorreator dentro do modal aberto, atualiza alvos e inoculação do tanque
  const handleReactorChange = (newReactorId: number) => {
    setReactorId(newReactorId);
    const sc = getScaleByReactorId(newReactorId);
    const sp = SCALE_SPECS[sc];
    setAgitation(sp.agitation.target);
    setPressure(sp.pressure.target);
    setAirflow(sp.airflow.target);

    const checkDateObj = new Date(`${date}T${time}:00`);
    const refDate = isNaN(checkDateObj.getTime()) ? new Date() : checkDateObj;
    const resolved = resolveInoculationForReactor(newReactorId, refDate);
    setInoculationDate(resolved.inocDate);
    setInoculationTime(resolved.inocTime);
    setBatchId(resolved.batch);
    setErrorMsg('');
  };

  // Atualiza parâmetros padrão quando reactorId muda via prop inicial
  useEffect(() => {
    const sc = getScaleByReactorId(reactorId);
    const sp = SCALE_SPECS[sc];
    setAgitation(sp.agitation.target);
    setPressure(sp.pressure.target);
    setAirflow(sp.airflow.target);
  }, [reactorId]);

  if (!isOpen) return null;

  // Cálculo automático do Tempo de Cultivo (processHours) a partir da Data/Hora de Inoculação e Data/Hora do Checklist
  const inocTimestamp = new Date(`${inoculationDate}T${inoculationTime}:00`).getTime();
  const checkTimestamp = new Date(`${date}T${time}:00`).getTime();
  const rawDiffHours =
    !isNaN(inocTimestamp) && !isNaN(checkTimestamp)
      ? (checkTimestamp - inocTimestamp) / (1000 * 60 * 60)
      : 0;
  const isInoculationAfterCheck = rawDiffHours < 0;
  const processHours = Math.max(0, Number(rawDiffHours.toFixed(1)));

  // Formatação amigável (ex: 14h 30min)
  const formatElapsedDuration = (hoursFloat: number) => {
    const totalMinutes = Math.max(0, Math.round(hoursFloat * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m > 0 ? `${h}h ${m}min (${hoursFloat.toFixed(1)}h)` : `${h}h (${hoursFloat.toFixed(1)}h)`;
  };

  // Validation in real-time with 3-tier color semaphore
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
    const finalOperator =
      (isCustomOperatorMode ? customOperatorInput.trim() : operatorName.trim()) || 'Operador';

    if (isCustomOperatorMode && !customOperatorInput.trim()) {
      setErrorMsg(
        'Por favor, digite o nome do novo operador ou selecione um nome da lista suspensa.'
      );
      return;
    }

    if (isInoculationAfterCheck) {
      setErrorMsg(
        'A Data/Horário de Inoculação não pode ser posterior à Data/Horário do Checklist atual.'
      );
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
      timestamp: !isNaN(checkTimestamp) ? checkTimestamp : Date.now(),
      inoculationDate,
      inoculationTime,
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
              01. Identificação do Equipamento, Registro & Inoculação
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Reactor Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Número do Biorreator *
                </label>
                <select
                  value={reactorId}
                  onChange={(e) => handleReactorChange(Number(e.target.value))}
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

              {/* Date & Time of Checklist */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Data do Check *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Data atual do registro</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Horário do Check *
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#080C14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Horário atual do registro</span>
              </div>
            </div>

            {/* Batch + Inoculation Date & Time + Automatic Cultivo Hours Calculation */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mt-4 p-3.5 bg-[#080C14]/90 border border-slate-800 rounded-lg">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Código do Lote (Batch ID) *
                </label>
                <input
                  type="text"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  placeholder="Ex: L-100-24B"
                  required
                  className="w-full text-xs font-mono bg-[#0F1624] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-cyan-300 mb-1">
                  Data de Inoculação *
                </label>
                <input
                  type="date"
                  value={inoculationDate}
                  onChange={(e) => setInoculationDate(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#0F1624] border border-cyan-500/40 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-cyan-300 mb-1">
                  Horário de Inoculação *
                </label>
                <input
                  type="time"
                  value={inoculationTime}
                  onChange={(e) => setInoculationTime(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-[#0F1624] border border-cyan-500/40 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Automatic Elapsed Cultivation Hours Readout */}
              <div className="sm:col-span-3 flex flex-col justify-between bg-[#131C2E] border border-cyan-500/30 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Tempo em Cultivo:</span>
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div
                  className={`text-sm font-mono font-bold mt-0.5 ${
                    isInoculationAfterCheck ? 'text-rose-400' : 'text-cyan-300'
                  }`}
                >
                  {isInoculationAfterCheck
                    ? 'Data/Hora Inválida'
                    : formatElapsedDuration(processHours)}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {doPhase
                    ? `Fase O2: ${doPhase.phase}`
                    : `Escala ${scale}: O2 livre`}
                </div>
              </div>

              {/* Phase Info Strip below */}
              <div className="sm:col-span-12 pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400">
                  Cálculo automático: <strong className="text-slate-200">Inoculação ({inoculationDate.split('-').reverse().join('/')} às {inoculationTime})</strong> até <strong className="text-slate-200">Check ({date.split('-').reverse().join('/')} às {time})</strong> = <strong className="text-cyan-400 font-mono">{processHours} horas de cultivo</strong>
                </span>
                {doPhase ? (
                  <span className="text-teal-400 font-medium font-mono">
                    Faixa O2 ({doPhase.phase} · {doPhase.intervalHours}): {doPhase.o2ProbeMin}% a {doPhase.o2ProbeMax}%
                  </span>
                ) : (
                  <span className="text-slate-400">
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
                    Alvo: {specs.pressure.target.toFixed(2)} (±0.05)
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={pressure}
                  onChange={(e) => setPressure(parseFloat(e.target.value) || 0)}
                  className={`w-full text-sm font-mono font-bold border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 ${getSemaphoreInputStyle(validation.presSemaphore)}`}
                />
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">
                    Aceitável: {(specs.pressure.min ?? 0).toFixed(2)} a {(specs.pressure.max ?? 0).toFixed(2)} bar
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
                    {doPhase ? `${processHours}h · ${doPhase.phase}` : `${processHours}h · Livre`}
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
