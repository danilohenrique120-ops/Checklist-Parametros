import React, { useState, useEffect, useRef } from 'react';
import { ChecklistRecord, ScaleVolume } from './types/bioreactor';
import { SEED_CHECKLISTS, INITIAL_OPERATORS } from './data/seedData';
import { REACTORS, SCALE_SPECS, getScaleByReactorId, validateChecklistValues } from './constants/reactorConfig';
import { TopNav } from './components/TopNav';
import { ParameterAveragesPanel } from './components/ParameterAveragesPanel';
import { InteractiveCharts } from './components/InteractiveCharts';
import { TraceabilityTable } from './components/TraceabilityTable';
import { ChecklistModal } from './components/ChecklistModal';
import { PDFReportModal } from './components/PDFReportModal';
import { DOReferenceModal } from './components/DOReferenceModal';
import { subscribeToCloudDoc, saveToCloudDoc } from './services/firestoreService';
import { exportStratifiedExcel } from './services/excelService';
import {
  Activity,
  CheckCircle,
  Thermometer,
  Gauge,
  RotateCw,
  Wind,
  FileDown,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Info,
} from 'lucide-react';

const STORAGE_KEY = 'biotrack_checklists_v5';
const CLOUD_COLLECTION = 'bioreactor_checklists';
const CLOUD_DOC_ID = 'shared_plant_state';

interface CloudChecklistDocument {
  data: ChecklistRecord[];
  operators?: string[];
  lastUpdatedISO?: string;
}

function formatLocalYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatLocalHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function revalidateRecordList(list: ChecklistRecord[]): ChecklistRecord[] {
  // Passo 1: Normaliza timestamp e calcula processHours caso inoculationDate/Time existam
  const normalized = list.map((rec) => {
    const parsedTs =
      rec.date && rec.time ? new Date(`${rec.date}T${rec.time}:00`).getTime() : rec.timestamp;
    const timestamp = !isNaN(parsedTs) ? parsedTs : rec.timestamp || Date.now();

    let inoculationDate = rec.inoculationDate;
    let inoculationTime = rec.inoculationTime;
    let processHours = typeof rec.processHours === 'number' ? rec.processHours : 0;

    if (inoculationDate && inoculationTime) {
      const inocTs = new Date(`${inoculationDate}T${inoculationTime}:00`).getTime();
      if (!isNaN(inocTs) && timestamp >= inocTs) {
        processHours = Number(((timestamp - inocTs) / (1000 * 60 * 60)).toFixed(1));
      }
    }

    return {
      ...rec,
      timestamp,
      inoculationDate,
      inoculationTime,
      processHours,
    };
  });

  // Passo 2: Para registros antigos do mesmo reator/lote que ficaram com processHours duplicado em horários diferentes,
  // estabelece a inoculação base do lote e calcula as horas reais a partir do horário de cada check
  const byReactorBatch = new Map<string, ChecklistRecord[]>();
  for (const r of normalized) {
    const key = `${r.reactorId}__${r.batchId || 'DEFAULT'}`;
    const arr = byReactorBatch.get(key) || [];
    arr.push(r);
    byReactorBatch.set(key, arr);
  }

  byReactorBatch.forEach((group) => {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
      const uniqueHours = new Set(sorted.map((item) => item.processHours));
      // Se há múltiplos registros em horários diferentes mas com o mesmo processHours
      if (uniqueHours.size < sorted.length) {
        const first = sorted[0];
        let baseInocTs: number;
        if (first.inoculationDate && first.inoculationTime) {
          baseInocTs = new Date(`${first.inoculationDate}T${first.inoculationTime}:00`).getTime();
        } else {
          const initialOffsetHours =
            first.processHours > 0 && first.processHours !== 24 ? first.processHours : 2;
          const d = new Date(first.timestamp - initialOffsetHours * 3600 * 1000);
          d.setMinutes(0, 0, 0);
          baseInocTs = d.getTime();
        }

        const baseInocDateObj = new Date(baseInocTs);
        const sharedInocDate = formatLocalYYYYMMDD(baseInocDateObj);
        const sharedInocTime = formatLocalHHMM(baseInocDateObj);

        sorted.forEach((item) => {
          if (!item.inoculationDate || !item.inoculationTime) {
            item.inoculationDate = sharedInocDate;
            item.inoculationTime = sharedInocTime;
          }
          const inocTs = new Date(`${item.inoculationDate}T${item.inoculationTime}:00`).getTime();
          if (!isNaN(inocTs) && item.timestamp >= inocTs) {
            item.processHours = Number(((item.timestamp - inocTs) / (1000 * 60 * 60)).toFixed(1));
          }
        });
      }
    }

    // Garante que qualquer registro sem data/hora de inoculação tenha o campo preenchido
    group.forEach((item) => {
      if (!item.inoculationDate || !item.inoculationTime) {
        const inocObj = new Date(item.timestamp - (item.processHours || 0) * 3600 * 1000);
        item.inoculationDate = formatLocalYYYYMMDD(inocObj);
        item.inoculationTime = formatLocalHHMM(inocObj);
      }
    });
  });

  // Passo 3: Revalida conformidade com o processHours atualizado
  return normalized.map((rec) => {
    const scale = rec.scale || getScaleByReactorId(rec.reactorId);
    const v = validateChecklistValues(scale, {
      temperature: rec.temperature,
      dissolvedOxygen: rec.dissolvedOxygen,
      standardCurveO2: rec.standardCurveO2,
      agitation: rec.agitation,
      pressure: rec.pressure,
      airflow: rec.airflow,
      processHours: rec.processHours,
    });
    return {
      ...rec,
      scale,
      isTemperatureNominal: v.isTemperatureNominal,
      isPressureNominal: v.isPressureNominal,
      isAgitationNominal: v.isAgitationNominal,
      isAirflowNominal: v.isAirflowNominal,
      isDONominal: v.isDONominal,
      isFullyNominal: v.isFullyNominal,
      deviationsCount: v.deviationsCount,
      deviationNotes: v.deviations.length > 0 ? v.deviations.join('; ') : undefined,
    };
  });
}

function mergeOperatorsList(savedOperators?: string[]): string[] {
  const base = [...INITIAL_OPERATORS];
  if (Array.isArray(savedOperators)) {
    for (const op of savedOperators) {
      const trimmed = typeof op === 'string' ? op.trim() : '';
      if (
        trimmed &&
        !base.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())
      ) {
        base.push(trimmed);
      }
    }
  }
  return base;
}

function loadFromLocalStorage(): {
  data: ChecklistRecord[];
  operators: string[];
  lastUpdatedISO: string | null;
} {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return {
          data: revalidateRecordList(parsed),
          operators: [...INITIAL_OPERATORS],
          lastUpdatedISO: null,
        };
      }
      if (parsed && Array.isArray(parsed.data)) {
        return {
          data: revalidateRecordList(parsed.data),
          operators: mergeOperatorsList(parsed.operators),
          lastUpdatedISO: typeof parsed.lastUpdatedISO === 'string' ? parsed.lastUpdatedISO : null,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load records from localStorage', e);
  }
  return {
    data: revalidateRecordList(SEED_CHECKLISTS),
    operators: [...INITIAL_OPERATORS],
    lastUpdatedISO: null,
  };
}

function saveToLocalStorage(
  data: ChecklistRecord[],
  operators: string[],
  lastUpdatedISO?: string
) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        data,
        operators,
        lastUpdatedISO: lastUpdatedISO || new Date().toISOString(),
      })
    );
  } catch (e) {
    console.error('Failed to save records to localStorage', e);
  }
}

export default function App() {
  const initialLocal = loadFromLocalStorage();
  const [records, setRecords] = useState<ChecklistRecord[]>(initialLocal.data);
  const [operators, setOperators] = useState<string[]>(initialLocal.operators);
  const [, setSyncStatus] = useState<'loading' | 'saving' | 'synced' | 'offline'>('loading');

  const isRemoteSyncRef = useRef<boolean>(false);
  const isInitialLoadDoneRef = useRef<boolean>(false);

  // Inicia filtrado em TODOS os biorreatores ('all')
  const [selectedReactorId, setSelectedReactorId] = useState<number | 'all'>('all');
  const [activeSection, setActiveSection] = useState<'dashboard' | 'averages' | 'trends' | 'table'>('dashboard');
  const [complianceScope, setComplianceScope] = useState<'all' | 'selected'>('all');

  // Modals
  const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);
  const [checklistPresetReactorId, setChecklistPresetReactorId] = useState<number>(1);
  const [isPDFModalOpen, setIsPDFModalOpen] = useState<boolean>(false);
  const [isDORefModalOpen, setIsDORefModalOpen] = useState<boolean>(false);

  // EFEITO 1: Carregar e escutar o documento no Firestore em tempo real (sem login)
  useEffect(() => {
    isInitialLoadDoneRef.current = false;
    setSyncStatus('loading');

    // 1. Carrega instantaneamente do cache local (localStorage)
    const cached = loadFromLocalStorage();
    isRemoteSyncRef.current = true;
    setRecords(cached.data);
    setOperators(cached.operators);

    let isFirstCloudSnapshot = true;

    // 2. Abre conexão em tempo real com o Firestore
    const unsubscribe = subscribeToCloudDoc<CloudChecklistDocument>(
      CLOUD_COLLECTION,
      CLOUD_DOC_ID,
      (cloudData) => {
        const localTime = cached.lastUpdatedISO ? Date.parse(cached.lastUpdatedISO) : 0;
        const cloudTime = cloudData?.lastUpdatedISO ? Date.parse(cloudData.lastUpdatedISO) : 0;

        // Verifica se o cache local tem edições mais novas que a nuvem no 1º carregamento
        const isLocalNewerOnFirstLoad =
          isFirstCloudSnapshot && localTime > 0 && localTime > cloudTime;
        isFirstCloudSnapshot = false;

        if (cloudData && Array.isArray(cloudData.data) && !isLocalNewerOnFirstLoad) {
          // A nuvem tem dados mais recentes -> atualiza a tela e o localStorage
          const mergedOps = mergeOperatorsList(cloudData.operators);
          const revalidatedCloud = revalidateRecordList(cloudData.data);
          isRemoteSyncRef.current = true;
          setRecords(revalidatedCloud);
          setOperators(mergedOps);
          saveToLocalStorage(revalidatedCloud, mergedOps, cloudData.lastUpdatedISO);

          setSyncStatus('synced');
          isInitialLoadDoneRef.current = true;
          setTimeout(() => {
            isRemoteSyncRef.current = false;
          }, 150);
        } else {
          // O documento ainda não existe na nuvem OU o cache local é mais novo -> envia para a nuvem
          const nowIso = cached.lastUpdatedISO || new Date().toISOString();
          isRemoteSyncRef.current = false;
          saveToCloudDoc(CLOUD_COLLECTION, CLOUD_DOC_ID, {
            data: cached.data,
            operators: cached.operators,
            lastUpdatedISO: nowIso,
          })
            .then(() => {
              setSyncStatus('synced');
              isInitialLoadDoneRef.current = true;
            })
            .catch(() => {
              setSyncStatus('offline');
              isInitialLoadDoneRef.current = true;
            });
        }
      },
      () => {
        // Se estiver sem internet ou sem permissão, opera em modo local sem travar
        isRemoteSyncRef.current = false;
        setSyncStatus('offline');
        isInitialLoadDoneRef.current = true;
      }
    );

    return () => unsubscribe();
  }, []);

  // EFEITO 2: Salvar automaticamente (Debounce de 500ms) quando o usuário edita algo
  useEffect(() => {
    // Não salva de volta na nuvem se a mudança veio da própria nuvem ou antes de terminar o load inicial
    if (isRemoteSyncRef.current || !isInitialLoadDoneRef.current) {
      return;
    }

    const nowIso = new Date().toISOString();

    // Salva imediatamente no localStorage com o novo timestamp
    saveToLocalStorage(records, operators, nowIso);

    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await saveToCloudDoc(CLOUD_COLLECTION, CLOUD_DOC_ID, {
          data: records,
          operators,
          lastUpdatedISO: nowIso,
        });
        setSyncStatus('synced');
      } catch (error) {
        console.warn('Falha ao salvar no Firestore:', error);
        setSyncStatus('offline');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [records, operators]);

  // Incrementar novo operador na lista suspensa
  const handleAddOperator = (newOp: string) => {
    const trimmed = newOp.trim();
    if (!trimmed) return;
    setOperators((prev) => {
      if (prev.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return [...prev, trimmed];
    });
  };

  // Handle adding new record
  const handleSaveRecord = (newRec: ChecklistRecord) => {
    setRecords((prev) => [newRec, ...prev]);
    setSelectedReactorId(newRec.reactorId);
  };

  // Handle deleting record
  const handleDeleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  // Handle archiving / unarchiving a batch
  const handleToggleArchiveBatch = (batchId: string, reactorId: number, archive: boolean) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.reactorId === reactorId && (r.batchId || 'Lote Padrão') === batchId) {
          return { ...r, archived: archive };
        }
        return r;
      })
    );
  };

  const handleResetData = () => {
    setRecords(SEED_CHECKLISTS);
    setOperators([...INITIAL_OPERATORS]);
    setSelectedReactorId('all');
  };

  const handleOpenChecklistForReactor = (reactorId: number) => {
    setChecklistPresetReactorId(reactorId);
    setIsChecklistOpen(true);
  };

  // Active scale
  const activeScale: ScaleVolume =
    selectedReactorId === 'all' ? '100L' : getScaleByReactorId(selectedReactorId);
  const activeSpecs = SCALE_SPECS[activeScale];
  const activeReactor = selectedReactorId === 'all' ? null : REACTORS.find((r) => r.id === selectedReactorId);

  // Filtered records for charts & parameter averages (quando 'all', inclui todos os biorreatores)
  const rawScopeRecords = records.filter((r) => {
    if (selectedReactorId !== 'all') {
      return r.reactorId === selectedReactorId;
    }
    return true;
  });

  const activeScopeRecords = rawScopeRecords.filter((r) => !r.archived);
  const chartRecords = activeScopeRecords.length > 0 ? activeScopeRecords : rawScopeRecords;

  // KPI Calculations (Active batches)
  const activeRecords = records.filter((r) => !r.archived);
  const recordsForCompliance = complianceScope === 'all' ? activeRecords : chartRecords;
  const totalEvaluated = recordsForCompliance.length;
  const nominalChecklists = recordsForCompliance.filter((r) => r.isFullyNominal).length;
  const deviationChecklists = totalEvaluated - nominalChecklists;
  const globalComplianceRate =
    totalEvaluated > 0 ? ((nominalChecklists / totalEvaluated) * 100).toFixed(1) : '100.0';

  // Per-Parameter Compliance Breakdown over time
  const calcParamCompliance = (
    label: string,
    icon: React.ElementType,
    isNominalFn: (r: ChecklistRecord) => boolean
  ) => {
    const total = recordsForCompliance.length;
    const within = recordsForCompliance.filter(isNominalFn).length;
    const out = total - within;
    const pct = total > 0 ? (within / total) * 100 : 100;
    return {
      label,
      icon,
      total,
      within,
      out,
      pct,
    };
  };

  const parameterComplianceList = [
    calcParamCompliance('Temperatura', Thermometer, (r) => r.isTemperatureNominal),
    calcParamCompliance('Oxigênio Dissolvido', Activity, (r) => r.isDONominal),
    calcParamCompliance('Agitação', RotateCw, (r) => r.isAgitationNominal),
    calcParamCompliance('Pressão', Gauge, (r) => r.isPressureNominal),
    calcParamCompliance('Vazão de Ar', Wind, (r) => r.isAirflowNominal),
  ];

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 pb-16">
      {/* Top Nav */}
      <TopNav
        onOpenDORefModal={() => setIsDORefModalOpen(true)}
        activeSection={activeSection}
        onNavigate={setActiveSection}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Banner with Context & Quick Filter */}
        <div className="bg-[#0F1624] border border-slate-800/90 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/30">
                <Activity className="w-4 h-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-50">
                {activeReactor ? `${activeReactor.tag} · ${activeReactor.name}` : 'Todos os Biorreatores (1 ao 16)'}
              </h1>
              <span className="text-xs font-mono text-cyan-400 font-semibold">
                {activeReactor ? `· Escala ${activeScale}` : '· Visão Consolidada'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Planta de bioprocesso: 16 reatores (1-5: 100L · 6-10: 500L · 11-14: 5000L · 15-16: 3000L). Controle por semáforo de cores, médias e histórico inteligente por lotes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedReactorId}
              onChange={(e) => setSelectedReactorId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs font-mono bg-[#080C14] border border-slate-700/90 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 font-semibold"
            >
              <option value="all">Todos os Biorreatores (1 ao 16)</option>
              <optgroup label="100L (Tanques 1 ao 5)">
                {REACTORS.filter((r) => r.scale === '100L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="500L (Tanques 6 ao 10)">
                {REACTORS.filter((r) => r.scale === '500L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="5000L (Tanques 11 ao 14)">
                {REACTORS.filter((r) => r.scale === '5000L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="3000L (Tanques 15 e 16)">
                {REACTORS.filter((r) => r.scale === '3000L').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.tag} · {r.name}
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              onClick={() => handleOpenChecklistForReactor(selectedReactorId === 'all' ? 1 : selectedReactorId)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              Lançar Checklist
            </button>

            <button
              onClick={() => setIsPDFModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#131C2E] border border-slate-700/80 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title="Gerar Relatório em PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-cyan-400" />
              PDF
            </button>

            <button
              onClick={() => exportStratifiedExcel({ records, selectedReactorId })}
              className="px-3.5 py-2 text-xs font-semibold text-emerald-200 bg-emerald-950/50 border border-emerald-500/50 hover:bg-emerald-900/60 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title="Extrair planilha Excel estratificada por parâmetro, lote, escala e desvios"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Excel
            </button>
          </div>
        </div>

        {/* Dashboard Compliance Row: Card 1 (General Compliance) + Card 2 (Consolidated Accuracy by Parameter over time) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Kept Card: Indicador de Conformidade */}
          <div className="lg:col-span-3 bg-[#0F1624] border border-slate-800/90 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-semibold text-slate-200">Conformidade Geral</span>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-slate-50 tabular-nums mt-1">
                {globalComplianceRate}%
              </div>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5 font-mono">
                <span className="text-emerald-400 font-semibold">{nominalChecklists} dentro</span>
                <span>·</span>
                <span className={deviationChecklists > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                  {deviationChecklists} fora da faixa
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Base avaliada:</span>
              <span className="font-mono font-semibold text-slate-200">
                {totalEvaluated} {totalEvaluated === 1 ? 'checklist' : 'checklists'}
              </span>
            </div>
          </div>

          {/* Consolidated Card: Precisão de Cada Parâmetro ao Longo do Tempo */}
          <div className="lg:col-span-9 bg-[#0F1624] border border-slate-800/90 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Consolidado de Precisão por Parâmetro ao Longo do Tempo
                </h2>
                <p className="text-xs text-slate-400">
                  Proporção de checklists precisos (dentro da faixa) vs. fora da faixa em {totalEvaluated} leituras
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#080C14] border border-slate-800 rounded-lg self-start">
                <button
                  onClick={() => setComplianceScope('all')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    complianceScope === 'all'
                      ? 'bg-[#131C2E] text-cyan-300 border border-cyan-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Consolidado Geral ({activeRecords.length})
                </button>
                <button
                  onClick={() => setComplianceScope('selected')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    complianceScope === 'selected'
                      ? 'bg-[#131C2E] text-cyan-300 border border-cyan-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {activeReactor ? activeReactor.tag : 'Filtro Atual'} ({chartRecords.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {parameterComplianceList.map((item) => {
                const Icon = item.icon;
                const isPerfect = item.out === 0;
                return (
                  <div
                    key={item.label}
                    className={`p-3.5 rounded-lg border transition-colors ${
                      isPerfect
                        ? 'bg-[#131C2E]/90 border-slate-800'
                        : 'bg-rose-950/30 border-rose-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold text-slate-200 truncate">{item.label}</span>
                      <Icon className="w-3.5 h-3.5 text-cyan-400/80 shrink-0" />
                    </div>

                    <div className="flex items-baseline justify-between mt-1">
                      <span
                        className={`text-xl font-bold font-mono tabular-nums ${
                          isPerfect ? 'text-emerald-400' : 'text-slate-100'
                        }`}
                      >
                        {item.pct.toFixed(1)}%
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.total} {item.total === 1 ? 'leitura' : 'leituras'}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-rose-500/40 rounded-full overflow-hidden my-2">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-300"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>

                    {/* Exact counts within vs out */}
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-emerald-400 font-semibold">
                        {item.within} dentro
                      </span>
                      <span className={item.out > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                        {item.out} fora
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Parameter Target and Delta Reference Strip */}
        <div className="bg-[#0F1624] border border-slate-800/90 text-slate-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-cyan-400">
                Critérios Técnicos da Escala {activeScale} · Deltas Homologados
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-mono text-slate-300 pt-1">
              <div>
                <span className="text-slate-400 font-sans">Temperatura: </span>
                <strong className="text-slate-100">30.0 °C</strong> (Delta ±2.0 °C · Faixa 28.0 a 32.0 °C)
              </div>
              <div>
                <span className="text-slate-400 font-sans">Pressão: </span>
                <strong className="text-slate-100">{activeSpecs.pressure.target.toFixed(2)} bar</strong> (Delta ±0.05 bar · Faixa {(activeSpecs.pressure.min ?? 0).toFixed(2)} a {(activeSpecs.pressure.max ?? 0).toFixed(2)} bar)
              </div>
              <div>
                <span className="text-slate-400 font-sans">Agitação: </span>
                <strong className="text-slate-100">{activeSpecs.agitation.target} RPM</strong> (Sem delta)
              </div>
              <div>
                <span className="text-slate-400 font-sans">Vazão de ar: </span>
                <strong className="text-slate-100">{activeSpecs.airflow.target} L/min</strong> (Delta ±10 L/min)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsDORefModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-700/60 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Info className="w-3.5 h-3.5" />
              Tabela O2 (100L / 5000L)
            </button>
          </div>
        </div>

        {/* Section 1: Parameter Averages Visualization */}
        <section id="averages">
          <ParameterAveragesPanel
            records={chartRecords}
            scale={activeScale}
            selectedReactorId={selectedReactorId}
          />
        </section>

        {/* Section 2: Interactive Charts with 2-hour X-axis and O2 Min/Max Lines */}
        <section id="trends">
          <InteractiveCharts
            records={chartRecords}
            scale={activeScale}
            selectedReactorId={selectedReactorId}
            onOpenDORefModal={() => setIsDORefModalOpen(true)}
          />
        </section>

        {/* Section 3: Smart History & Traceability Table */}
        <section id="table">
          <TraceabilityTable
            records={records}
            onDeleteRecord={handleDeleteRecord}
            onToggleArchiveBatch={handleToggleArchiveBatch}
            onOpenPDFModal={() => setIsPDFModalOpen(true)}
            selectedReactorId={selectedReactorId}
            onSelectReactor={setSelectedReactorId}
          />
        </section>

        {/* Quiet Footer with data management & GMP disclaimer */}
        <footer className="pt-6 border-t border-slate-800/80 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>Checklist Parâmetros de Processo · Monitoramento e Rastreabilidade de Biorreatores</span>
            <span>·</span>
            <span>GMP / BPF Compliant</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetData}
              className="text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Restaurar Dados Padrão
            </button>
          </div>
        </footer>
      </main>

      {/* Modals */}
      <ChecklistModal
        isOpen={isChecklistOpen}
        onClose={() => setIsChecklistOpen(false)}
        onSave={handleSaveRecord}
        initialReactorId={checklistPresetReactorId}
        operators={operators}
        onAddOperator={handleAddOperator}
        existingRecords={records}
      />

      <PDFReportModal
        isOpen={isPDFModalOpen}
        onClose={() => setIsPDFModalOpen(false)}
        records={records}
        currentReactorId={selectedReactorId}
      />

      <DOReferenceModal
        isOpen={isDORefModalOpen}
        onClose={() => setIsDORefModalOpen(false)}
      />
    </div>
  );
}
