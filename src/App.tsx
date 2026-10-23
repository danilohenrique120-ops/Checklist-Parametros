import React, { useState, useEffect } from 'react';
import { ChecklistRecord, ScaleVolume } from './types/bioreactor';
import { SEED_CHECKLISTS } from './data/seedData';
import { REACTORS, SCALE_SPECS, getScaleByReactorId } from './constants/reactorConfig';
import { TopNav } from './components/TopNav';
import { ParameterAveragesPanel } from './components/ParameterAveragesPanel';
import { InteractiveCharts } from './components/InteractiveCharts';
import { TraceabilityTable } from './components/TraceabilityTable';
import { ChecklistModal } from './components/ChecklistModal';
import { PDFReportModal } from './components/PDFReportModal';
import { DOReferenceModal } from './components/DOReferenceModal';
import {
  auth,
  User,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
  saveChecklistRecordToFirestore,
  toggleBatchArchiveInFirestore,
  deleteChecklistFromFirestore,
  seedInitialChecklistsIfNeeded,
  resetCloudChecklistsToSeed,
  subscribeToPlantChecklists,
} from './firebase';
import {
  Activity,
  CheckCircle,
  Thermometer,
  Gauge,
  RotateCw,
  Wind,
  FileDown,
  Plus,
  RefreshCw,
  Info,
  Cloud,
  LogIn,
} from 'lucide-react';

const STORAGE_KEY = 'biotrack_checklists_v3';

export default function App() {
  const [records, setRecords] = useState<ChecklistRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load records from storage', e);
    }
    return SEED_CHECKLISTS;
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);

  const [selectedReactorId, setSelectedReactorId] = useState<number | 'all'>(2);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'averages' | 'trends' | 'table'>('dashboard');
  const [complianceScope, setComplianceScope] = useState<'all' | 'selected'>('all');

  // Modals
  const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);
  const [checklistPresetReactorId, setChecklistPresetReactorId] = useState<number>(2);
  const [isPDFModalOpen, setIsPDFModalOpen] = useState<boolean>(false);
  const [isDORefModalOpen, setIsDORefModalOpen] = useState<boolean>(false);

  // Track Firebase Auth state
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setIsCloudSynced(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Attach real-time Firestore listener when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    let unsubSnapshot: (() => void) | undefined;
    let isMounted = true;

    async function initCloudSync() {
      try {
        await seedInitialChecklistsIfNeeded(SEED_CHECKLISTS);
        if (!isMounted) return;
        unsubSnapshot = subscribeToPlantChecklists(
          (cloudRecords) => {
            if (!isMounted) return;
            if (cloudRecords.length > 0) {
              setRecords(cloudRecords);
            }
            setIsCloudSynced(true);
          },
          () => {
            if (isMounted) setIsCloudSynced(false);
          }
        );
      } catch (err) {
        console.error('Failed to initialize cloud sync:', err);
      }
    }

    initCloudSync();

    return () => {
      isMounted = false;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [authReady, user]);

  // Keep local storage cache updated as offline backup
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('Failed to save records locally', e);
    }
  }, [records]);

  const handleSignIn = async () => {
    try {
      setCloudNotice(null);
      await signInWithGoogle();
    } catch (err) {
      console.error('Google Sign-In error:', err);
      setCloudNotice('Não foi possível concluir o login com Google. Verifique se pop-ups estão permitidos.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setIsCloudSynced(false);
    } catch (err) {
      console.error('Sign-Out error:', err);
    }
  };

  // Handle adding new record
  const handleSaveRecord = async (newRec: ChecklistRecord) => {
    setRecords((prev) => [newRec, ...prev]);
    setSelectedReactorId(newRec.reactorId);

    if (user) {
      try {
        await saveChecklistRecordToFirestore(newRec);
      } catch (err) {
        console.error('Failed to save checklist to Firestore:', err);
      }
    } else {
      setCloudNotice(
        'Checklist salvo localmente neste dispositivo. Clique em "Sincronizar Nuvem" para compartilhar em tempo real com toda a equipe.'
      );
    }
  };

  // Handle deleting record
  const handleDeleteRecord = async (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    if (user) {
      try {
        await deleteChecklistFromFirestore(id);
      } catch (err) {
        console.error('Failed to delete checklist from Firestore:', err);
      }
    }
  };

  // Handle archiving / unarchiving a batch
  const handleToggleArchiveBatch = async (batchId: string, reactorId: number, archive: boolean) => {
    const affectedRecords = records.filter(
      (r) => r.reactorId === reactorId && (r.batchId || 'Lote Padrão') === batchId
    );

    setRecords((prev) =>
      prev.map((r) => {
        if (r.reactorId === reactorId && (r.batchId || 'Lote Padrão') === batchId) {
          return { ...r, archived: archive };
        }
        return r;
      })
    );

    if (user && affectedRecords.length > 0) {
      try {
        await toggleBatchArchiveInFirestore(affectedRecords, archive);
      } catch (err) {
        console.error('Failed to toggle archive batch in Firestore:', err);
      }
    }
  };

  const handleResetData = async () => {
    setRecords(SEED_CHECKLISTS);
    setSelectedReactorId(2);
    localStorage.removeItem(STORAGE_KEY);
    if (user) {
      try {
        await resetCloudChecklistsToSeed(SEED_CHECKLISTS);
      } catch (err) {
        console.error('Failed to reset cloud data:', err);
      }
    }
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

  // Filtered records for charts & parameter averages (prefer active batches unless reactor only has archived)
  const rawScopeRecords = records.filter((r) => {
    if (selectedReactorId !== 'all') {
      return r.reactorId === selectedReactorId;
    }
    return r.scale === activeScale;
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
        onOpenChecklist={() => handleOpenChecklistForReactor(selectedReactorId === 'all' ? 2 : selectedReactorId)}
        onOpenPDFModal={() => setIsPDFModalOpen(true)}
        onOpenDORefModal={() => setIsDORefModalOpen(true)}
        activeSection={activeSection}
        onNavigate={setActiveSection}
        user={user}
        isCloudSynced={isCloudSynced}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Cloud Synchronization Status Banner */}
        {!user ? (
          <div className="bg-cyan-950/30 border border-cyan-500/40 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-200">
              <Cloud className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong className="text-cyan-300">Sincronização Multi-Usuário (Firebase Cloud):</strong> Conecte sua conta Google para que todos os operadores e gestores com o link aberto visualizem os lançamentos simultaneamente em tempo real.
              </span>
            </div>
            <button
              onClick={handleSignIn}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
            >
              <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
              Entrar com Google
            </button>
          </div>
        ) : (
          cloudNotice && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between">
              <span>{cloudNotice}</span>
              <button
                onClick={() => setCloudNotice(null)}
                className="text-amber-400 hover:text-amber-200 font-semibold ml-4"
              >
                Fechar
              </button>
            </div>
          )
        )}

        {!user && cloudNotice && (
          <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between">
            <span>{cloudNotice}</span>
            <button
              onClick={handleSignIn}
              className="text-cyan-300 hover:text-cyan-200 font-semibold ml-4 underline whitespace-nowrap"
            >
              Sincronizar Agora
            </button>
          </div>
        )}

        {/* Banner with Context & Quick Filter */}
        <div className="bg-[#0F1624] border border-slate-800/90 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/30">
                <Activity className="w-4 h-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-50">
                {activeReactor ? `${activeReactor.tag} · ${activeReactor.name}` : 'Visão Consolidada de Biorreatores'}
              </h1>
              <span className="text-xs font-mono text-cyan-400 font-semibold">
                · Escala {activeScale}
              </span>
              {user && isCloudSynced && (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 ml-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Tempo Real Ativo
                </span>
              )}
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
              <option value="all">Visão Consolidada (Escala 100L)</option>
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
              onClick={() => handleOpenChecklistForReactor(selectedReactorId === 'all' ? 2 : selectedReactorId)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              Lançar Checklist
            </button>

            <button
              onClick={() => setIsPDFModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#131C2E] border border-slate-700/80 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 text-cyan-400" />
              PDF
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
                  {activeReactor ? activeReactor.tag : `Escala ${activeScale}`} ({chartRecords.length})
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
                <strong className="text-slate-100">{activeSpecs.pressure.target} bar</strong> (Delta ±0.5 bar)
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
            <span>BioTrack · Sistema de Monitoramento e Rastreabilidade de Biorreatores Industriais</span>
            <span>·</span>
            <span>GMP / BPF Compliant · Sincronização Firebase Cloud</span>
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
        defaultOperatorName={user?.displayName || undefined}
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
