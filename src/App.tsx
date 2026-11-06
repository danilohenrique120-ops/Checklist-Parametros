import React, { useState, useEffect, useRef } from 'react';
import { ChecklistRecord, ScaleVolume } from './types/bioreactor';
import { INITIAL_OPERATORS, isFictionalSeedRecord } from './data/seedData';
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

function toSafeNumber(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function revalidateRecordList(list: ChecklistRecord[]): ChecklistRecord[] {
  // Remove permanentemente qualquer registro fictício de demonstração antiga
  const realRecords = (Array.isArray(list) ? list : []).filter(
    (rec) => rec && typeof rec.id === 'string' && !isFictionalSeedRecord(rec)
  );

  // Deduplica por ID mantendo a primeira ocorrência (mais recente)
  const seenIds = new Set<string>();
  const uniqueRecords: ChecklistRecord[] = [];
  for (const rec of realRecords) {
    if (!seenIds.has(rec.id)) {
      seenIds.add(rec.id);
      uniqueRecords.push(rec);
    }
  }

  // Passo 1: Normaliza números, timestamp e calcula processHours caso inoculationDate/Time existam
  const normalized = uniqueRecords.map((rec) => {
    const parsedTs =
      rec.date && rec.time ? new Date(`${rec.date}T${rec.time}:00`).getTime() : rec.timestamp;
    const timestamp = !isNaN(parsedTs) ? parsedTs : toSafeNumber(rec.timestamp, Date.now());

    const inoculationDate = rec.inoculationDate;
    const inoculationTime = rec.inoculationTime;
    let processHours = toSafeNumber(rec.processHours, 0);

    if (inoculationDate && inoculationTime) {
      const inocTs = new Date(`${inoculationDate}T${inoculationTime}:00`).getTime();
      if (!isNaN(inocTs) && timestamp >= inocTs) {
        processHours = Number(((timestamp - inocTs) / (1000 * 60 * 60)).toFixed(1));
      }
    }

    return {
      ...rec,
      reactorId: toSafeNumber(rec.reactorId, 1),
      timestamp,
      inoculationDate,
      inoculationTime,
      processHours,
      temperature: toSafeNumber(rec.temperature, 30),
      dissolvedOxygen: rec.noDOProbe ? 0 : toSafeNumber(rec.dissolvedOxygen, 0),
      agitation: toSafeNumber(rec.agitation, 95),
      pressure: toSafeNumber(rec.pressure, 0.1),
      airflow: toSafeNumber(rec.airflow, 85),
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
      noDOProbe: rec.noDOProbe,
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
  hasLocalCache: boolean;
} {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const cleaned = revalidateRecordList(parsed);
        return {
          data: cleaned,
          operators: [...INITIAL_OPERATORS],
          lastUpdatedISO: null,
          hasLocalCache: cleaned.length > 0,
        };
      }
      if (parsed && Array.isArray(parsed.data)) {
        const cleaned = revalidateRecordList(parsed.data);
        return {
          data: cleaned,
          operators: mergeOperatorsList(parsed.operators),
          lastUpdatedISO: typeof parsed.lastUpdatedISO === 'string' ? parsed.lastUpdatedISO : null,
          hasLocalCache: true,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load records from localStorage', e);
  }
  return {
    data: [],
    operators: [...INITIAL_OPERATORS],
    lastUpdatedISO: null,
    hasLocalCache: false,
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

  const recordsRef = useRef<ChecklistRecord[]>(initialLocal.data);
  const operatorsRef = useRef<string[]>(initialLocal.operators);
  // Guarda registros salvos localmente nesta sessão para garantir que nenhum snapshot antigo da nuvem os apague
  const pendingLocalRecordsRef = useRef<Map<string, ChecklistRecord>>(new Map());
  const deletedRecordIdsRef = useRef<Set<string>>(new Set());
  const lastLocalSaveMsRef = useRef<number>(0);

  // Inicia filtrado em TODAS as escalas e TODOS os biorreatores ('all')
  const [selectedScale, setSelectedScale] = useState<ScaleVolume | 'all'>('all');
  const [selectedReactorId, setSelectedReactorId] = useState<number | 'all'>('all');
  const [activeSection, setActiveSection] = useState<'dashboard' | 'averages' | 'trends' | 'table'>('dashboard');
  const [complianceScope, setComplianceScope] = useState<'all' | 'selected'>('all');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Modals
  const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);
  const [checklistPresetReactorId, setChecklistPresetReactorId] = useState<number>(1);
  const [editingRecord, setEditingRecord] = useState<ChecklistRecord | null>(null);
  const [isPDFModalOpen, setIsPDFModalOpen] = useState<boolean>(false);
  const [isDORefModalOpen, setIsDORefModalOpen] = useState<boolean>(false);

  // Salva explicitamente no localStorage e no Firestore quando o usuário realiza uma ação
  const persistStateToCloudAndLocal = (
    cleanRecords: ChecklistRecord[],
    mergedOps: string[]
  ) => {
    const nowIso = new Date().toISOString();
    saveToLocalStorage(cleanRecords, mergedOps, nowIso);
    setSyncStatus('saving');

    saveToCloudDoc(CLOUD_COLLECTION, CLOUD_DOC_ID, {
      data: cleanRecords,
      operators: mergedOps,
      lastUpdatedISO: nowIso,
    })
      .then(() => {
        setSyncStatus('synced');
      })
      .catch((error) => {
        console.warn('Falha ao salvar no Firestore:', error);
        setSyncStatus('offline');
      });
  };

  // Escuta o documento no Firestore em tempo real, preservando sempre novos registros locais
  useEffect(() => {
    setSyncStatus('loading');

    const cached = loadFromLocalStorage();
    recordsRef.current = cached.data;
    operatorsRef.current = cached.operators;
    setRecords(cached.data);
    setOperators(cached.operators);

    const unsubscribe = subscribeToCloudDoc<CloudChecklistDocument>(
      CLOUD_COLLECTION,
      CLOUD_DOC_ID,
      (cloudData, fromCache) => {
        // Se o usuário acabou de salvar localmente, ignora snapshots vindos do cache local antigo do Firestore
        if (fromCache && lastLocalSaveMsRef.current > 0) {
          return;
        }

        if (cloudData && Array.isArray(cloudData.data)) {
          const hadFictionalInCloud = cloudData.data.some((rec) => isFictionalSeedRecord(rec));
          const mergedOps = mergeOperatorsList([
            ...(cloudData.operators || []),
            ...operatorsRef.current,
          ]);

          // Filtra registros excluídos localmente nesta sessão
          const incomingFiltered = cloudData.data.filter(
            (rec) => rec && !deletedRecordIdsRef.current.has(rec.id)
          );

          // Verifica quais registros pendentes locais ainda não constam na nuvem
          const cloudMap = new Map<string, ChecklistRecord>();
          for (const rec of incomingFiltered) {
            cloudMap.set(rec.id, rec);
          }

          let missingLocalInCloud = false;
          pendingLocalRecordsRef.current.forEach((localRec, id) => {
            if (deletedRecordIdsRef.current.has(id)) {
              pendingLocalRecordsRef.current.delete(id);
              return;
            }
            const inCloud = cloudMap.get(id);
            if (!inCloud) {
              missingLocalInCloud = true;
            } else if (!fromCache && Date.now() - lastLocalSaveMsRef.current > 3000) {
              // Confirmado no servidor
              pendingLocalRecordsRef.current.delete(id);
            }
          });

          // Mescla os registros locais pendentes no topo da lista vinda da nuvem
          const combinedList: ChecklistRecord[] = [];
          pendingLocalRecordsRef.current.forEach((localRec) => {
            combinedList.push(localRec);
          });
          for (const rec of incomingFiltered) {
            if (!pendingLocalRecordsRef.current.has(rec.id)) {
              combinedList.push(rec);
            }
          }

          const revalidatedCloud = revalidateRecordList(combinedList);

          recordsRef.current = revalidatedCloud;
          operatorsRef.current = mergedOps;
          setRecords(revalidatedCloud);
          setOperators(mergedOps);
          saveToLocalStorage(
            revalidatedCloud,
            mergedOps,
            cloudData.lastUpdatedISO || new Date().toISOString()
          );
          setSyncStatus('synced');

          // Se a nuvem tinha dados fictícios ou estava sem algum registro recém-salvo localmente, sincroniza
          if ((hadFictionalInCloud || missingLocalInCloud) && !fromCache) {
            saveToCloudDoc(CLOUD_COLLECTION, CLOUD_DOC_ID, {
              data: revalidatedCloud,
              operators: mergedOps,
              lastUpdatedISO: new Date().toISOString(),
            }).catch(() => {});
          }
        } else if (!fromCache && recordsRef.current.length > 0) {
          const nowIso = new Date().toISOString();
          saveToCloudDoc(CLOUD_COLLECTION, CLOUD_DOC_ID, {
            data: recordsRef.current,
            operators: operatorsRef.current,
            lastUpdatedISO: nowIso,
          })
            .then(() => setSyncStatus('synced'))
            .catch(() => setSyncStatus('offline'));
        } else {
          setSyncStatus('synced');
        }
      },
      () => {
        setSyncStatus('offline');
      }
    );

    return () => unsubscribe();
  }, []);

  // Incrementar novo operador na lista suspensa
  const handleAddOperator = (newOp: string) => {
    const trimmed = newOp.trim();
    if (!trimmed) return;
    if (operatorsRef.current.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    const mergedOps = mergeOperatorsList([...operatorsRef.current, trimmed]);
    operatorsRef.current = mergedOps;
    lastLocalSaveMsRef.current = Date.now();
    setOperators(mergedOps);
    persistStateToCloudAndLocal(recordsRef.current, mergedOps);
  };

  // Handle adding or updating a record (atômico: atualiza registros + operador em uma única gravação)
  const handleSaveRecord = (savedRec: ChecklistRecord) => {
    const prev = recordsRef.current;
    const exists = prev.some((r) => r.id === savedRec.id);
    const rawNextRecords = exists
      ? prev.map((r) => (r.id === savedRec.id ? savedRec : r))
      : [savedRec, ...prev];

    const cleanRecords = revalidateRecordList(rawNextRecords);
    const syncedSavedRec = cleanRecords.find((r) => r.id === savedRec.id) || savedRec;

    deletedRecordIdsRef.current.delete(savedRec.id);
    pendingLocalRecordsRef.current.set(savedRec.id, syncedSavedRec);
    lastLocalSaveMsRef.current = Date.now();

    const mergedOps = mergeOperatorsList([
      ...operatorsRef.current,
      savedRec.operatorName ? savedRec.operatorName.trim() : '',
    ]);

    recordsRef.current = cleanRecords;
    operatorsRef.current = mergedOps;

    setRecords(cleanRecords);
    setOperators(mergedOps);
    setEditingRecord(null);

    // Ajusta filtro de tanque e escala para garantir que o check recém-salvo fique imediatamente visível
    setSelectedReactorId(savedRec.reactorId);
    const savedScale = savedRec.scale || getScaleByReactorId(savedRec.reactorId);
    if (selectedScale !== 'all' && selectedScale !== savedScale) {
      setSelectedScale(savedScale);
    }

    persistStateToCloudAndLocal(cleanRecords, mergedOps);
  };

  // Handle opening modal to edit an existing record
  const handleEditRecord = (record: ChecklistRecord) => {
    setEditingRecord(record);
    setChecklistPresetReactorId(record.reactorId);
    setIsChecklistOpen(true);
  };

  // Handle deleting record
  const handleDeleteRecord = (id: string) => {
    deletedRecordIdsRef.current.add(id);
    pendingLocalRecordsRef.current.delete(id);
    lastLocalSaveMsRef.current = Date.now();

    const cleanRecords = revalidateRecordList(recordsRef.current.filter((r) => r.id !== id));
    recordsRef.current = cleanRecords;
    setRecords(cleanRecords);
    persistStateToCloudAndLocal(cleanRecords, operatorsRef.current);
  };

  // Handle archiving / unarchiving a batch
  const handleToggleArchiveBatch = (batchId: string, reactorId: number, archive: boolean) => {
    lastLocalSaveMsRef.current = Date.now();
    const rawNext = recordsRef.current.map((r) => {
      if (r.reactorId === reactorId && (r.batchId || 'Lote Padrão') === batchId) {
        const updated = { ...r, archived: archive };
        pendingLocalRecordsRef.current.set(updated.id, updated);
        return updated;
      }
      return r;
    });
    const cleanRecords = revalidateRecordList(rawNext);
    recordsRef.current = cleanRecords;
    setRecords(cleanRecords);
    persistStateToCloudAndLocal(cleanRecords, operatorsRef.current);
  };

  const handleSelectScale = (newScale: ScaleVolume | 'all') => {
    setSelectedScale(newScale);
    if (newScale !== 'all' && selectedReactorId !== 'all') {
      const currentTankScale = getScaleByReactorId(selectedReactorId);
      if (currentTankScale !== newScale) {
        setSelectedReactorId('all');
      }
    }
  };

  const handleSelectReactor = (newReactorId: number | 'all') => {
    setSelectedReactorId(newReactorId);
    if (newReactorId !== 'all' && selectedScale !== 'all') {
      const tankScale = getScaleByReactorId(newReactorId);
      if (tankScale !== selectedScale) {
        setSelectedScale(tankScale);
      }
    }
  };

  const handleOpenChecklistForReactor = (reactorId: number) => {
    setEditingRecord(null);
    setChecklistPresetReactorId(reactorId);
    setIsChecklistOpen(true);
  };

  // Active scale
  const activeScale: ScaleVolume =
    selectedReactorId !== 'all'
      ? getScaleByReactorId(selectedReactorId)
      : selectedScale !== 'all'
      ? selectedScale
      : '100L';
  const activeSpecs = SCALE_SPECS[activeScale];
  const activeReactor = selectedReactorId === 'all' ? null : REACTORS.find((r) => r.id === selectedReactorId);

  // Filtered records for charts & parameter averages (filtra por escala e/ou tanque selecionados)
  const rawScopeRecords = records.filter((r) => {
    if (selectedReactorId !== 'all' && r.reactorId !== selectedReactorId) {
      return false;
    }
    if (selectedScale !== 'all' && r.scale !== selectedScale) {
      return false;
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

  const scaleCounts: Record<ScaleVolume | 'all', number> = {
    all: activeRecords.length,
    '100L': activeRecords.filter((r) => r.scale === '100L').length,
    '500L': activeRecords.filter((r) => r.scale === '500L').length,
    '3000L': activeRecords.filter((r) => r.scale === '3000L').length,
    '5000L': activeRecords.filter((r) => r.scale === '5000L').length,
  };

  const complianceNum = Number(globalComplianceRate);
  const arcRadius = 56;
  const arcCircumference = Math.PI * arcRadius; // Semicircle arc length
  const arcDashOffset =
    arcCircumference - (Math.min(100, Math.max(0, complianceNum)) / 100) * arcCircumference;

  const formattedToday = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 pb-16 relative overflow-hidden">
      {/* Ambient Radial Light Glows (Matching the Video's Warm Amber Top-Right & Cobalt Blue Left/Bottom Atmosphere) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {/* Warm Amber / Gold Glow (Top Right behind Gauge Card) */}
        <div
          className="absolute -top-28 -right-20 w-[560px] h-[560px] rounded-full opacity-35 blur-[120px]"
          style={{
            background:
              'radial-gradient(circle, rgba(245, 158, 11, 0.55) 0%, rgba(217, 119, 6, 0.18) 50%, transparent 75%)',
          }}
        />
        {/* Royal Cobalt Blue Glow (Top Left / Sidebar) */}
        <div
          className="absolute top-12 -left-28 w-[620px] h-[620px] rounded-full opacity-35 blur-[130px]"
          style={{
            background:
              'radial-gradient(circle, rgba(37, 99, 235, 0.55) 0%, rgba(29, 78, 216, 0.18) 55%, transparent 75%)',
          }}
        />
        {/* Deep Blue / Cyan Glow (Center Bottom behind Chart) */}
        <div
          className="absolute bottom-0 left-1/3 w-[680px] h-[480px] rounded-full opacity-25 blur-[140px]"
          style={{
            background:
              'radial-gradient(circle, rgba(59, 130, 246, 0.45) 0%, rgba(14, 165, 233, 0.12) 55%, transparent 75%)',
          }}
        />
      </div>

      {/* Sidebar & Responsive Navigation */}
      <TopNav
        onOpenDORefModal={() => setIsDORefModalOpen(true)}
        activeSection={activeSection}
        onNavigate={setActiveSection}
        selectedScale={selectedScale}
        onSelectScale={handleSelectScale}
        scaleCounts={scaleCounts}
        onOpenChecklist={() =>
          handleOpenChecklistForReactor(
            selectedReactorId !== 'all'
              ? selectedReactorId
              : selectedScale !== 'all'
              ? REACTORS.find((r) => r.scale === selectedScale)?.id || 1
              : 1
          )
        }
        onOpenPDFModal={() => setIsPDFModalOpen(true)}
        onExportExcel={() => exportStratifiedExcel({ records, selectedReactorId })}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Single-Page Viewport */}
      <main
        className={`relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:pr-8 pt-6 space-y-6 transition-all duration-300 ${
          isSidebarCollapsed ? 'lg:pl-24' : 'lg:pl-72'
        }`}
      >
        {/* Top Header Bar (Video Style: Greeting/Title on Left + Filters & Blue "+ Lançar Checklist" CTA on Right) */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-1">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {activeReactor
                ? `Checklist de Parâmetros · ${activeReactor.tag}`
                : selectedScale !== 'all'
                ? `Checklist de Parâmetros · Escala ${selectedScale}`
                : 'Checklist de Parâmetros'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1 capitalize">
              <span>{formattedToday}</span>
              <span aria-hidden="true">·</span>
              <span className="normal-case text-blue-400 font-medium">
                {activeReactor
                  ? `Escala ${activeScale} · Monitoramento Individual`
                  : selectedScale !== 'all'
                  ? `Filtro por Escala (${selectedScale})`
                  : 'Todos os Biorreatores (1 ao 16)'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filtro por Escala no Topo */}
            <select
              value={selectedScale}
              onChange={(e) => handleSelectScale(e.target.value as ScaleVolume | 'all')}
              className="text-xs font-mono glass-subcard rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60 font-semibold cursor-pointer"
              title="Filtrar por Escala"
            >
              <option value="all" className="bg-[#0B101E]">Todas as Escalas</option>
              <option value="100L" className="bg-[#0B101E]">Escala 100L (Tanques 1 ao 5)</option>
              <option value="500L" className="bg-[#0B101E]">Escala 500L (Tanques 6 ao 10)</option>
              <option value="5000L" className="bg-[#0B101E]">Escala 5000L (Tanques 11 ao 14)</option>
              <option value="3000L" className="bg-[#0B101E]">Escala 3000L (Tanques 15 e 16)</option>
            </select>

            {/* Filtro por Tanque no Topo */}
            <select
              value={selectedReactorId}
              onChange={(e) => handleSelectReactor(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs font-mono glass-subcard rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60 font-semibold cursor-pointer"
              title="Filtrar por Tanque / Biorreator"
            >
              <option value="all" className="bg-[#0B101E]">
                {selectedScale === 'all'
                  ? 'Todos os Biorreatores (1 ao 16)'
                  : `Todos os Tanques (${selectedScale})`}
              </option>
              {(selectedScale === 'all' || selectedScale === '100L') && (
                <optgroup label="100L (Tanques 1 ao 5)" className="bg-[#0B101E]">
                  {REACTORS.filter((r) => r.scale === '100L').map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#0B101E]">
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {(selectedScale === 'all' || selectedScale === '500L') && (
                <optgroup label="500L (Tanques 6 ao 10)" className="bg-[#0B101E]">
                  {REACTORS.filter((r) => r.scale === '500L').map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#0B101E]">
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {(selectedScale === 'all' || selectedScale === '5000L') && (
                <optgroup label="5000L (Tanques 11 ao 14)" className="bg-[#0B101E]">
                  {REACTORS.filter((r) => r.scale === '5000L').map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#0B101E]">
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {(selectedScale === 'all' || selectedScale === '3000L') && (
                <optgroup label="3000L (Tanques 15 e 16)" className="bg-[#0B101E]">
                  {REACTORS.filter((r) => r.scale === '3000L').map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#0B101E]">
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <button
              onClick={() => setIsPDFModalOpen(true)}
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-200 glass-subcard hover:bg-white/[0.08] rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title="Gerar Relatório em PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-amber-400" />
              PDF
            </button>

            <button
              onClick={() => exportStratifiedExcel({ records, selectedReactorId })}
              className="px-3.5 py-2.5 text-xs font-semibold text-emerald-200 glass-subcard hover:bg-emerald-500/15 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title="Extrair planilha Excel estratificada por parâmetro, lote, escala e desvios"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Excel
            </button>

            <button
              onClick={() =>
                handleOpenChecklistForReactor(
                  selectedReactorId !== 'all'
                    ? selectedReactorId
                    : selectedScale !== 'all'
                    ? REACTORS.find((r) => r.scale === selectedScale)?.id || 1
                    : 1
                )
              }
              className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-full transition-all flex items-center gap-1.5 whitespace-nowrap shadow-[0_0_26px_rgba(37,99,235,0.55)]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Lançar Checklist
            </button>
          </div>
        </div>

        {/* Hero Dashboard Row (Video Style): Left Main KPI + Parameter Precision Studio & Right Circular Gauge Card */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
          {/* Left 9 Columns: 3 Headline KPIs + 5 Parameter Precision Cards */}
          <div className="xl:col-span-9 glass-panel rounded-3xl p-6 flex flex-col justify-between space-y-6">
            {/* Top 3 Headline Metrics Strip (Like "Today, so far", "Last 7 days", "Orders today" in the Video) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-white/[0.07] pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 flex-1">
                <div>
                  <span className="text-xs text-slate-400 block mb-1">Checklists Avaliados</span>
                  <div className="text-3xl font-bold font-mono text-white tabular-nums tracking-tight">
                    {totalEvaluated}
                  </div>
                  <div className="text-xs text-blue-400 mt-1.5 font-medium">
                    {activeReactor ? `Tanque ${activeReactor.tag}` : 'Leituras ativas na planta'}
                  </div>
                </div>

                <div className="sm:border-l sm:border-white/[0.07] sm:pl-6">
                  <span className="text-xs text-slate-400 block mb-1">Leituras Nominais</span>
                  <div className="text-3xl font-bold font-mono text-white tabular-nums tracking-tight">
                    {nominalChecklists}
                  </div>
                  <div className="text-xs text-emerald-400 mt-1.5 font-medium">
                    {globalComplianceRate}% dentro dos limites
                  </div>
                </div>

                <div className="sm:border-l sm:border-white/[0.07] sm:pl-6">
                  <span className="text-xs text-slate-400 block mb-1">Fora da Faixa (Desvios)</span>
                  <div className="text-3xl font-bold font-mono text-white tabular-nums tracking-tight">
                    {deviationChecklists}
                  </div>
                  <div
                    className={`text-xs mt-1.5 font-medium ${
                      deviationChecklists > 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    {deviationChecklists > 0
                      ? 'Requer atenção / ação corretiva'
                      : 'Zero desvios registrados'}
                  </div>
                </div>
              </div>

              {/* Scope Switcher Pill */}
              <div className="flex items-center gap-1 p-1 bg-[#070B16]/90 border border-white/[0.08] rounded-full self-start">
                <button
                  onClick={() => setComplianceScope('all')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                    complianceScope === 'all'
                      ? 'bg-blue-600 text-white font-semibold shadow-[0_0_16px_rgba(37,99,235,0.45)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Consolidado Geral ({activeRecords.length})
                </button>
                <button
                  onClick={() => setComplianceScope('selected')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                    complianceScope === 'selected'
                      ? 'bg-blue-600 text-white font-semibold shadow-[0_0_16px_rgba(37,99,235,0.45)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {activeReactor ? activeReactor.tag : 'Filtro Atual'} ({chartRecords.length})
                </button>
              </div>
            </div>

            {/* Bottom 5-Column Parameter Precision Breakdown */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-300">
                  Precisão por Parâmetro ao Longo do Tempo
                </h2>
                <span className="text-[11px] text-slate-400 font-mono">
                  Dentro vs. Fora da Faixa
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {parameterComplianceList.map((item) => {
                  const Icon = item.icon;
                  const isPerfect = item.out === 0;
                  return (
                    <div
                      key={item.label}
                      className={`p-3.5 rounded-2xl transition-all ${
                        isPerfect
                          ? 'glass-subcard hover:border-white/15'
                          : 'bg-rose-950/30 border border-rose-500/45 shadow-[0_0_24px_rgba(244,63,94,0.12)]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                        <span className="font-semibold text-slate-200 truncate">{item.label}</span>
                        <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      </div>

                      <div className="flex items-baseline justify-between mt-1">
                        <span
                          className={`text-xl font-bold font-mono tabular-nums ${
                            isPerfect ? 'text-white' : 'text-rose-200'
                          }`}
                        >
                          {item.pct.toFixed(1)}%
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {item.total} {item.total === 1 ? 'leitura' : 'leituras'}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden my-2.5">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isPerfect
                              ? 'bg-gradient-to-r from-blue-500 to-emerald-400'
                              : 'bg-gradient-to-r from-amber-400 to-emerald-400'
                          }`}
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

          {/* Right 3 Columns: Circular Arc Gauge Card (Modeled after "November goal 76%" in Video) */}
          <div className="xl:col-span-3 glass-panel rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden">
            {/* Subtle Warm Glow Inside Gauge Card */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-35 blur-2xl"
              style={{
                background:
                  'radial-gradient(circle, rgba(245, 158, 11, 0.6) 0%, rgba(37, 99, 235, 0.2) 70%, transparent 100%)',
              }}
            />

            <div className="flex items-center justify-between relative z-10">
              <div>
                <h2 className="text-sm font-bold text-white">Conformidade Geral</h2>
                <p className="text-[11px] text-slate-400">Índice de aderência GMP</p>
              </div>
              <CheckCircle className="w-4 h-4 text-amber-400" />
            </div>

            {/* Semi-Circular Arc Gauge */}
            <div className="my-3 flex flex-col items-center justify-center relative z-10">
              <svg viewBox="0 0 140 86" className="w-44 h-28 overflow-visible">
                <defs>
                  <linearGradient id="complianceArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="55%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                </defs>
                {/* Background Track Arc */}
                <path
                  d="M 14 72 A 56 56 0 0 1 126 72"
                  fill="none"
                  stroke="rgba(255,255,255,0.09)"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                {/* Foreground Value Arc */}
                <path
                  d="M 14 72 A 56 56 0 0 1 126 72"
                  fill="none"
                  stroke="url(#complianceArcGrad)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={arcCircumference}
                  strokeDashoffset={arcDashOffset}
                  className="transition-all duration-500"
                />
                <text
                  x="70"
                  y="60"
                  textAnchor="middle"
                  className="fill-white font-mono font-bold text-2xl"
                >
                  {globalComplianceRate}%
                </text>
                <text
                  x="70"
                  y="76"
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px] font-sans"
                >
                  dentro da especificação
                </text>
              </svg>
            </div>

            {/* Summary Breakdown Rows (Matching Right Card Rows in Video) */}
            <div className="space-y-2 pt-3 border-t border-white/[0.08] text-xs relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Dentro da faixa</span>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                  {nominalChecklists}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Fora da faixa</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    deviationChecklists > 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {deviationChecklists}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Base avaliada</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {totalEvaluated} {totalEvaluated === 1 ? 'check' : 'checks'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Parameter Target and Delta Reference Strip */}
        <div className="glass-panel rounded-2xl px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-400">
                Critérios Técnicos da Escala {activeScale} · Deltas Homologados
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-mono text-slate-300 pt-0.5">
              <div>
                <span className="text-slate-400 font-sans">Temperatura: </span>
                <strong className="text-white">30.0 °C</strong> (Delta ±2.0 °C · 28.0 a 32.0 °C)
              </div>
              <div>
                <span className="text-slate-400 font-sans">Pressão: </span>
                <strong className="text-white">{activeSpecs.pressure.target.toFixed(2)} bar</strong> (Delta ±0.05 bar · {(activeSpecs.pressure.min ?? 0).toFixed(2)} a {(activeSpecs.pressure.max ?? 0).toFixed(2)} bar)
              </div>
              <div>
                <span className="text-slate-400 font-sans">Agitação: </span>
                <strong className="text-white">{activeSpecs.agitation.target} RPM</strong> (Sem delta)
              </div>
              <div>
                <span className="text-slate-400 font-sans">Vazão de ar: </span>
                <strong className="text-white">{activeSpecs.airflow.target} L/min</strong> (Delta ±10 L/min)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsDORefModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Info className="w-3.5 h-3.5" />
              Tabela O2 (100L / 5000L)
            </button>
          </div>
        </div>

        {/* Section 1: Interactive Charts Studio */}
        <section id="trends">
          <InteractiveCharts
            records={chartRecords}
            scale={activeScale}
            selectedScale={selectedScale}
            onSelectScale={handleSelectScale}
            selectedReactorId={selectedReactorId}
            onSelectReactor={handleSelectReactor}
            onOpenDORefModal={() => setIsDORefModalOpen(true)}
          />
        </section>

        {/* Section 2: Parameter Averages Visualization */}
        <section id="averages">
          <ParameterAveragesPanel
            records={selectedReactorId === 'all' ? (activeRecords.length > 0 ? activeRecords : records) : chartRecords}
            scale={activeScale}
            selectedReactorId={selectedReactorId}
          />
        </section>

        {/* Section 3: Smart History & Traceability Table */}
        <section id="table">
          <TraceabilityTable
            records={records}
            onDeleteRecord={handleDeleteRecord}
            onEditRecord={handleEditRecord}
            onToggleArchiveBatch={handleToggleArchiveBatch}
            onOpenPDFModal={() => setIsPDFModalOpen(true)}
            selectedReactorId={selectedReactorId}
            onSelectReactor={handleSelectReactor}
          />
        </section>

        {/* Quiet Footer */}
        <footer className="pt-6 border-t border-white/[0.07] text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>BioTrack · Monitoramento e Rastreabilidade de Biorreatores</span>
            <span>·</span>
            <span>GMP / BPF Compliant</span>
          </div>
        </footer>
      </main>

      {/* Modals */}
      <ChecklistModal
        isOpen={isChecklistOpen}
        onClose={() => {
          setIsChecklistOpen(false);
          setEditingRecord(null);
        }}
        onSave={handleSaveRecord}
        initialReactorId={checklistPresetReactorId}
        operators={operators}
        onAddOperator={handleAddOperator}
        existingRecords={records}
        editingRecord={editingRecord}
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

