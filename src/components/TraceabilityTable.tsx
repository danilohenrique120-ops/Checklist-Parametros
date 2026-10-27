import React, { useState, useMemo } from 'react';
import { ChecklistRecord, ScaleVolume, SemaphoreLevel } from '../types/bioreactor';
import { REACTORS, validateChecklistValues } from '../constants/reactorConfig';
import { downloadBioreactorPDF } from '../services/pdfService';
import {
  Search,
  AlertTriangle,
  Trash2,
  FileDown,
  Eye,
  ChevronDown,
  ChevronRight,
  Archive,
  RotateCcw,
  Layers,
  List,
  ChevronLeft,
  Pencil,
} from 'lucide-react';

interface TraceabilityTableProps {
  records: ChecklistRecord[];
  onDeleteRecord: (id: string) => void;
  onEditRecord?: (record: ChecklistRecord) => void;
  onToggleArchiveBatch: (batchId: string, reactorId: number, archive: boolean) => void;
  onOpenPDFModal: () => void;
  selectedReactorId: number | 'all';
  onSelectReactor: (id: number | 'all') => void;
}

interface BatchGroup {
  key: string;
  batchId: string;
  reactorId: number;
  reactorTag: string;
  scale: ScaleVolume;
  archived: boolean;
  records: ChecklistRecord[];
  deviationsCount: number;
  warningsCount: number;
  latestTimestamp: number;
  minHours: number;
  maxHours: number;
  avgTemp: number;
  avgO2: number;
  avgPress: number;
  avgAir: number;
}

export const TraceabilityTable: React.FC<TraceabilityTableProps> = ({
  records,
  onDeleteRecord,
  onEditRecord,
  onToggleArchiveBatch,
  onOpenPDFModal,
  selectedReactorId,
  onSelectReactor,
}) => {
  const [lifecycleTab, setLifecycleTab] = useState<'active' | 'archived'>('active');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [search, setSearch] = useState<string>('');
  const [scaleFilter, setScaleFilter] = useState<ScaleVolume | 'all'>('all');
  const [onlyDeviations, setOnlyDeviations] = useState<boolean>(false);
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [batchPageMap, setBatchPageMap] = useState<Record<string, number>>({});
  const [flatPage, setFlatPage] = useState<number>(1);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<ChecklistRecord | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 10;

  // Counts for Active vs Archived tabs
  const activeRecordsCount = records.filter((r) => !r.archived).length;
  const archivedRecordsCount = records.filter((r) => Boolean(r.archived)).length;

  // Filter records according to lifecycle tab & user filters
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const isArch = Boolean(rec.archived);
      if (lifecycleTab === 'active' && isArch) return false;
      if (lifecycleTab === 'archived' && !isArch) return false;

      if (selectedReactorId !== 'all' && rec.reactorId !== selectedReactorId) return false;
      if (scaleFilter !== 'all' && rec.scale !== scaleFilter) return false;
      if (onlyDeviations && rec.isFullyNominal) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchOp = rec.operatorName.toLowerCase().includes(q);
        const matchBatch = rec.batchId?.toLowerCase().includes(q);
        const matchNotes = rec.notes?.toLowerCase().includes(q);
        const matchTag = rec.reactorTag.toLowerCase().includes(q);
        if (!matchOp && !matchBatch && !matchNotes && !matchTag) return false;
      }
      return true;
    });
  }, [records, lifecycleTab, selectedReactorId, scaleFilter, onlyDeviations, search]);

  const sortedRecords = useMemo(
    () => [...filteredRecords].sort((a, b) => b.timestamp - a.timestamp || b.processHours - a.processHours),
    [filteredRecords]
  );

  // Build Batch Groups for Accordion view
  const batchGroups = useMemo<BatchGroup[]>(() => {
    const map = new Map<string, ChecklistRecord[]>();
    for (const r of sortedRecords) {
      const key = `${r.reactorId}__${r.batchId || 'SEM-LOTE'}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }

    const groups: BatchGroup[] = [];
    map.forEach((recs, key) => {
      const sorted = [...recs].sort((a, b) => a.processHours - b.processHours || a.timestamp - b.timestamp);
      const first = sorted[0];
      const deviationsCount = sorted.filter((item) => !item.isFullyNominal).length;

      let warningsCount = 0;
      sorted.forEach((item) => {
        const v = validateChecklistValues(item.scale, {
          temperature: item.temperature,
          dissolvedOxygen: item.dissolvedOxygen,
          standardCurveO2: item.standardCurveO2,
          agitation: item.agitation,
          pressure: item.pressure,
          airflow: item.airflow,
          processHours: item.processHours,
        });
        if (v.isFullyNominal && v.warningsCount > 0) warningsCount++;
      });

      const n = sorted.length;
      const avgTemp = sorted.reduce((acc, item) => acc + item.temperature, 0) / n;
      const avgO2 = sorted.reduce((acc, item) => acc + item.dissolvedOxygen, 0) / n;
      const avgPress = sorted.reduce((acc, item) => acc + item.pressure, 0) / n;
      const avgAir = sorted.reduce((acc, item) => acc + item.airflow, 0) / n;

      groups.push({
        key,
        batchId: first.batchId || 'Lote Padrão',
        reactorId: first.reactorId,
        reactorTag: first.reactorTag,
        scale: first.scale,
        archived: Boolean(first.archived),
        records: [...sorted].reverse(), // latest first inside table
        deviationsCount,
        warningsCount,
        latestTimestamp: Math.max(...sorted.map((i) => i.timestamp)),
        minHours: Math.min(...sorted.map((i) => i.processHours)),
        maxHours: Math.max(...sorted.map((i) => i.processHours)),
        avgTemp,
        avgO2,
        avgPress,
        avgAir,
      });
    });

    return groups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }, [sortedRecords]);

  const deviationsTotalInTab = records.filter(
    (r) => Boolean(r.archived) === (lifecycleTab === 'archived') && !r.isFullyNominal
  ).length;

  const toggleExpandBatch = (key: string) => {
    setExpandedBatches((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getCellSemaphoreStyle = (level: SemaphoreLevel) => {
    if (level === 'critical') {
      return 'bg-rose-950/80 text-rose-300 font-bold border-x border-rose-800/60';
    }
    if (level === 'warning') {
      return 'bg-amber-950/60 text-amber-300 font-semibold';
    }
    if (level === 'nominal') {
      return 'text-emerald-300';
    }
    return 'text-slate-400';
  };

  const handleExportBatchPDF = (group: BatchGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    const reactor = REACTORS.find((r) => r.id === group.reactorId);
    downloadBioreactorPDF(
      {
        reactor,
        records: [...group.records].sort((a, b) => a.processHours - b.processHours),
        title: `Relatório de Batelada ${group.batchId} · ${group.reactorTag} (${group.scale})`,
        generatedBy: group.records[0]?.operatorName || 'Sistema BioTrack',
      },
      `Relatorio_Lote_${group.batchId}_${group.reactorTag}.pdf`
    );
  };

  const renderRecordRows = (rows: ChecklistRecord[]) => {
    return rows.map((r, i) => {
      const valCheck = validateChecklistValues(r.scale, {
        temperature: r.temperature,
        dissolvedOxygen: r.dissolvedOxygen,
        standardCurveO2: r.standardCurveO2,
        agitation: r.agitation,
        pressure: r.pressure,
        airflow: r.airflow,
        processHours: r.processHours,
      });

      return (
        <tr
          key={r.id}
          className={`hover:bg-slate-800/60 transition-colors ${
            !r.isFullyNominal
              ? 'bg-rose-950/25'
              : valCheck.warningsCount > 0
              ? 'bg-amber-950/20'
              : i % 2 === 0
              ? 'bg-[#0B101B]'
              : 'bg-[#0F1624]/60'
          }`}
        >
          <td className="py-2 px-3 whitespace-nowrap">
            <span className="font-semibold text-slate-200">
              {r.date.split('-').reverse().slice(0, 2).join('/')}
            </span>{' '}
            <span className="text-slate-400">{r.time}</span>
          </td>

          <td className="py-2 px-3 whitespace-nowrap font-bold text-cyan-400">
            <button
              onClick={() => onSelectReactor(r.reactorId)}
              className="hover:text-cyan-300 underline text-left"
            >
              {r.reactorTag}
            </button>
          </td>

          <td className="py-2 px-3 whitespace-nowrap font-sans text-slate-400">{r.scale}</td>

          <td className="py-2 px-3 whitespace-nowrap font-sans text-slate-300">{r.batchId || '-'}</td>

          <td className="py-2 px-3 whitespace-nowrap font-sans font-medium text-slate-200">
            {r.operatorName}
          </td>

          <td className="py-2 px-2 text-center whitespace-nowrap text-slate-400">{r.processHours}h</td>

          {/* Temperature */}
          <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getCellSemaphoreStyle(valCheck.tempSemaphore)}`}>
            {r.temperature.toFixed(1)}
          </td>

          {/* Dissolved Oxygen */}
          <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getCellSemaphoreStyle(valCheck.doSemaphore)}`}>
            {r.dissolvedOxygen.toFixed(2)}%
          </td>

          {/* Agitation */}
          <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getCellSemaphoreStyle(valCheck.agitSemaphore)}`}>
            {r.agitation}
          </td>

          {/* Pressure */}
          <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getCellSemaphoreStyle(valCheck.presSemaphore)}`}>
            {r.pressure.toFixed(2)}
          </td>

          {/* Airflow */}
          <td className={`py-2 px-2.5 text-right whitespace-nowrap ${getCellSemaphoreStyle(valCheck.airSemaphore)}`}>
            {r.airflow}
          </td>

          {/* Status */}
          <td className="py-2 px-3 text-center whitespace-nowrap font-sans">
            {!r.isFullyNominal ? (
              <span
                title={r.deviationNotes}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 cursor-help"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                Fora da Faixa ({r.deviationsCount})
              </span>
            ) : valCheck.warningsCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Limite Próximo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Nominal
              </span>
            )}
          </td>

          {/* Actions */}
          <td className="py-2 px-2 text-center whitespace-nowrap">
            <div className="flex items-center justify-center gap-1 font-sans">
              <button
                title="Ver detalhes da leitura"
                onClick={() => setSelectedRecordForDetail(r)}
                className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              {onEditRecord && (
                <button
                  title="Editar checklist"
                  onClick={() => onEditRecord(r)}
                  className="p-1 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {pendingDeleteId === r.id ? (
                <button
                  onClick={() => {
                    onDeleteRecord(r.id);
                    setPendingDeleteId(null);
                  }}
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-600 text-white rounded"
                >
                  Confirmar
                </button>
              ) : (
                <button
                  title="Remover checklist"
                  onClick={() => setPendingDeleteId(r.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    });
  };

  // Pagination calculation for flat view
  const totalFlatPages = Math.max(1, Math.ceil(sortedRecords.length / ITEMS_PER_PAGE));
  const currentFlatPage = Math.min(flatPage, totalFlatPages);
  const paginatedFlatRecords = sortedRecords.slice(
    (currentFlatPage - 1) * ITEMS_PER_PAGE,
    currentFlatPage * ITEMS_PER_PAGE
  );

  return (
    <div className="bg-[#0F1624] border border-slate-800/90 rounded-xl p-5">
      {/* Top Lifecycle Tabs & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            Gestão Inteligente de Histórico & Rastreabilidade GMP
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Agrupamento compacto por Batelada/Lote, sinalização por cores e arquivamento de ciclos concluídos
          </p>
        </div>

        {/* Lifecycle Tabs: Active Batches vs Archived Batches */}
        <div className="flex items-center gap-1.5 p-1 bg-[#080C14] border border-slate-800 rounded-lg">
          <button
            onClick={() => {
              setLifecycleTab('active');
              setFlatPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              lifecycleTab === 'active'
                ? 'bg-[#131C2E] text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Bateladas Ativas ({activeRecordsCount} leituras)
          </button>

          <button
            onClick={() => {
              setLifecycleTab('archived');
              setFlatPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              lifecycleTab === 'archived'
                ? 'bg-[#131C2E] text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-slate-400" />
            Lotes Encerrados / Arquivo ({archivedRecordsCount} leituras)
          </button>
        </div>
      </div>

      {/* Filters & View Mode Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        {/* View Mode Selector (Sanfona por Lote vs Lista Paginada) */}
        <div className="flex items-center gap-1 p-1 bg-[#080C14] border border-slate-800 rounded-lg self-start">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'grouped'
                ? 'bg-[#131C2E] text-slate-100 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            Agrupado por Lote / Batelada ({batchGroups.length})
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              viewMode === 'flat'
                ? 'bg-[#131C2E] text-slate-100 border border-slate-700 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="w-3.5 h-3.5 text-cyan-400" />
            Lista Paginada ({sortedRecords.length})
          </button>
        </div>

        {/* Search & Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar lote, operador, reator..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFlatPage(1);
              }}
              className="text-xs bg-[#080C14] border border-slate-700/80 text-slate-100 placeholder:text-slate-500 rounded-lg pl-8 pr-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>

          <select
            value={scaleFilter}
            onChange={(e) => {
              setScaleFilter(e.target.value as any);
              setFlatPage(1);
            }}
            className="text-xs bg-[#080C14] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            <option value="all">Todas as Escalas</option>
            <option value="100L">100L</option>
            <option value="500L">500L</option>
            <option value="3000L">3000L</option>
            <option value="5000L">5000L</option>
          </select>

          {/* 1-Click Red Filter */}
          <button
            onClick={() => {
              setOnlyDeviations(!onlyDeviations);
              setFlatPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              onlyDeviations
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-[#131C2E] text-slate-200 border-slate-700/80 hover:bg-rose-950/60 hover:border-rose-700 hover:text-rose-300'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${onlyDeviations ? 'text-white' : 'text-rose-400'}`} />
            Apenas Fora da Faixa ({deviationsTotalInTab})
          </button>
        </div>
      </div>

      {/* Color Legend Strip */}
      <div className="mb-4 px-3.5 py-2.5 bg-[#080C14] border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-slate-300">Legenda Semáforo:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <strong className="text-emerald-300">Verde:</strong> Dentro da faixa aceitável
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <strong className="text-amber-300">Amarelo:</strong> Próximo ao limite (últimos 15% da tolerância)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <strong className="text-rose-400">Vermelho:</strong> FORA da faixa aceitável
          </span>
        </div>
        <span className="text-slate-500">
          Clique em uma batelada para abrir ou recolher suas leituras de 2 em 2 horas
        </span>
      </div>

      {/* MODE 1: ACCORDION GROUPED BY BATCH */}
      {viewMode === 'grouped' ? (
        <div className="space-y-3">
          {batchGroups.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 border border-slate-800 rounded-lg bg-[#080C14]/50">
              Nenhuma batelada encontrada para os filtros selecionados nesta aba.
            </div>
          ) : (
            batchGroups.map((group) => {
              const isExpanded = Boolean(expandedBatches[group.key]);
              const currentPage = batchPageMap[group.key] || 1;
              const totalBatchPages = Math.max(1, Math.ceil(group.records.length / ITEMS_PER_PAGE));
              const safePage = Math.min(currentPage, totalBatchPages);
              const visibleRecords = group.records.slice(
                (safePage - 1) * ITEMS_PER_PAGE,
                safePage * ITEMS_PER_PAGE
              );

              return (
                <div
                  key={group.key}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    group.deviationsCount > 0
                      ? 'border-rose-500/50 bg-rose-950/10'
                      : group.warningsCount > 0
                      ? 'border-amber-500/40 bg-amber-950/10'
                      : 'border-slate-800 bg-[#0B101B]'
                  }`}
                >
                  {/* Accordion Header Row */}
                  <div
                    onClick={() => toggleExpandBatch(group.key)}
                    className="cursor-pointer px-4 py-3.5 bg-[#131C2E]/90 hover:bg-[#172238] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-slate-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>

                      <span className="font-mono text-sm font-bold text-slate-100">
                        {group.reactorTag}
                      </span>
                      <span className="text-xs font-mono text-slate-400">· {group.scale} ·</span>
                      <span className="font-mono text-xs font-semibold text-cyan-400">
                        Lote {group.batchId}
                      </span>
                      <span className="text-xs text-slate-400">
                        · <strong className="text-slate-200">{group.records.length}</strong> checklists ({group.minHours}h a {group.maxHours}h)
                      </span>

                      {/* Semaphore Status of the Batch */}
                      {group.deviationsCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                          {group.deviationsCount} Fora da Faixa
                        </span>
                      ) : group.warningsCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          {group.warningsCount} Próximo ao Limite
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          100% Dentro da Faixa
                        </span>
                      )}
                    </div>

                    {/* Batch Quick Averages & Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4">
                      <div className="hidden xl:flex items-center gap-3 text-[11px] font-mono text-slate-400">
                        <span>Médias:</span>
                        <span>T: <strong className="text-slate-200">{group.avgTemp.toFixed(1)}°C</strong></span>
                        <span>·</span>
                        <span>O2: <strong className="text-slate-200">{group.avgO2.toFixed(1)}%</strong></span>
                        <span>·</span>
                        <span>P: <strong className="text-slate-200">{group.avgPress.toFixed(2)} bar</strong></span>
                        <span>·</span>
                        <span>Ar: <strong className="text-slate-200">{group.avgAir.toFixed(0)} L/m</strong></span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleExportBatchPDF(group, e)}
                          title="Baixar Relatório PDF apenas deste Lote"
                          className="px-2.5 py-1 text-xs font-semibold text-slate-200 bg-[#080C14] border border-slate-700 hover:border-cyan-500/50 hover:text-cyan-300 rounded-md flex items-center gap-1 whitespace-nowrap"
                        >
                          <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                          PDF do Lote
                        </button>

                        {lifecycleTab === 'active' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleArchiveBatch(group.batchId, group.reactorId, true);
                            }}
                            title="Encerrar esta batelada e mover para o Arquivo Histórico"
                            className="px-2.5 py-1 text-xs font-semibold text-slate-300 bg-[#080C14] border border-slate-700 hover:bg-amber-950/60 hover:text-amber-300 hover:border-amber-700 rounded-md flex items-center gap-1 whitespace-nowrap"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            Encerrar Lote
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleArchiveBatch(group.batchId, group.reactorId, false);
                            }}
                            title="Reativar este lote para a aba de Bateladas Ativas"
                            className="px-2.5 py-1 text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-700/60 hover:bg-cyan-900/70 rounded-md flex items-center gap-1 whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reativar Lote
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Accordion Content with Internal Pagination */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 bg-[#080C14]">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#0F1624] text-slate-300 font-semibold border-b border-slate-800">
                              <th className="py-2 px-3 whitespace-nowrap">Data / Horário</th>
                              <th className="py-2 px-3 whitespace-nowrap">Biorreator</th>
                              <th className="py-2 px-3 whitespace-nowrap">Escala</th>
                              <th className="py-2 px-3 whitespace-nowrap">Lote</th>
                              <th className="py-2 px-3 whitespace-nowrap">Operador</th>
                              <th className="py-2 px-2 text-center whitespace-nowrap">Idade (h)</th>
                              <th className="py-2 px-2.5 text-right whitespace-nowrap">Temp (°C)</th>
                              <th className="py-2 px-2.5 text-right whitespace-nowrap">O2 (%)</th>
                              <th className="py-2 px-2.5 text-right whitespace-nowrap">Agit (RPM)</th>
                              <th className="py-2 px-2.5 text-right whitespace-nowrap">Pressão (bar)</th>
                              <th className="py-2 px-2.5 text-right whitespace-nowrap">Vazão (L/min)</th>
                              <th className="py-2 px-3 text-center whitespace-nowrap">Status Semáforo</th>
                              <th className="py-2 px-2 text-center whitespace-nowrap">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80 text-slate-300 font-mono">
                            {renderRecordRows(visibleRecords)}
                          </tbody>
                        </table>
                      </div>

                      {/* Internal Pagination Footer for this Batch */}
                      {totalBatchPages > 1 && (
                        <div className="px-4 py-2.5 bg-[#0F1624] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                          <span>
                            Exibindo {(safePage - 1) * ITEMS_PER_PAGE + 1} a{' '}
                            {Math.min(safePage * ITEMS_PER_PAGE, group.records.length)} de {group.records.length} leituras deste lote
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={safePage <= 1}
                              onClick={() =>
                                setBatchPageMap((prev) => ({ ...prev, [group.key]: safePage - 1 }))
                              }
                              className="px-2.5 py-1 bg-[#131C2E] border border-slate-700 text-slate-200 rounded disabled:opacity-40 hover:bg-slate-800"
                            >
                              Anterior
                            </button>
                            <span className="font-mono px-2 text-slate-300">
                              Página {safePage} de {totalBatchPages}
                            </span>
                            <button
                              disabled={safePage >= totalBatchPages}
                              onClick={() =>
                                setBatchPageMap((prev) => ({ ...prev, [group.key]: safePage + 1 }))
                              }
                              className="px-2.5 py-1 bg-[#131C2E] border border-slate-700 text-slate-200 rounded disabled:opacity-40 hover:bg-slate-800"
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* MODE 2: FLAT PAGINATED TABLE */
        <div>
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#131C2E] text-slate-300 font-semibold border-b border-slate-800">
                  <th className="py-2.5 px-3 whitespace-nowrap">Data / Horário</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Biorreator</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Escala</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Lote (Batch)</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Operador</th>
                  <th className="py-2.5 px-2 text-center whitespace-nowrap">Idade (h)</th>
                  <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Temp (°C)</th>
                  <th className="py-2.5 px-2.5 text-right whitespace-nowrap">O2 (%)</th>
                  <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Agit (RPM)</th>
                  <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Pressão (bar)</th>
                  <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Vazão (L/min)</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Status Semáforo</th>
                  <th className="py-2.5 px-2 text-center whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300 font-mono">
                {paginatedFlatRecords.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-8 text-center text-slate-500 font-sans">
                      Nenhum registro encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  renderRecordRows(paginatedFlatRecords)
                )}
              </tbody>
            </table>
          </div>

          {/* Flat Pagination Controls */}
          {totalFlatPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                Mostrando página <strong className="text-slate-200">{currentFlatPage}</strong> de <strong className="text-slate-200">{totalFlatPages}</strong> ({sortedRecords.length} registros no total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentFlatPage <= 1}
                  onClick={() => setFlatPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-[#131C2E] border border-slate-700 text-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-800 flex items-center gap-1 font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>
                <button
                  disabled={currentFlatPage >= totalFlatPages}
                  onClick={() => setFlatPage((p) => Math.min(totalFlatPages, p + 1))}
                  className="px-3 py-1.5 bg-[#131C2E] border border-slate-700 text-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-800 flex items-center gap-1 font-medium"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Record Detail Modal */}
      {selectedRecordForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-[#0F1624] rounded-xl shadow-2xl border border-slate-700/80 w-full max-w-lg p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Checklist {selectedRecordForDetail.reactorTag} · {selectedRecordForDetail.scale}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedRecordForDetail.date} às {selectedRecordForDetail.time} · Operador:{' '}
                  {selectedRecordForDetail.operatorName}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5 bg-[#080C14] p-3.5 rounded-lg border border-slate-800 font-mono">
                <div>
                  <span className="text-slate-400 block text-[11px]">Temperatura:</span>
                  <span className="font-bold text-slate-100">{selectedRecordForDetail.temperature}°C</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Oxigênio Dissolvido:</span>
                  <span className="font-bold text-slate-100">{selectedRecordForDetail.dissolvedOxygen}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Agitação:</span>
                  <span className="font-bold text-slate-100">{selectedRecordForDetail.agitation} RPM</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Pressão:</span>
                  <span className="font-bold text-slate-100">{selectedRecordForDetail.pressure} bar</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Vazão de Ar:</span>
                  <span className="font-bold text-slate-100">{selectedRecordForDetail.airflow} L/min</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Tempo de Cultivo:</span>
                  <span className="font-bold text-cyan-300">{selectedRecordForDetail.processHours}h</span>
                </div>
                {selectedRecordForDetail.inoculationDate && selectedRecordForDetail.inoculationTime && (
                  <div className="col-span-2 pt-1.5 border-t border-slate-800/80">
                    <span className="text-slate-400 block text-[11px]">Data / Horário de Inoculação:</span>
                    <span className="font-bold text-slate-200">
                      {selectedRecordForDetail.inoculationDate.split('-').reverse().join('/')} às{' '}
                      {selectedRecordForDetail.inoculationTime}
                    </span>
                  </div>
                )}
              </div>

              {selectedRecordForDetail.deviationNotes && (
                <div className="p-3 bg-rose-950/60 border border-rose-700/70 rounded-lg text-rose-200">
                  <span className="font-bold block mb-1 text-rose-300">Desvios registrados (Fora da Faixa):</span>
                  <p>{selectedRecordForDetail.deviationNotes}</p>
                </div>
              )}

              {selectedRecordForDetail.notes && (
                <div className="p-3 bg-[#131C2E] border border-slate-800 rounded-lg text-slate-200">
                  <span className="font-bold block mb-1 text-slate-400">Observações / Ações Corretivas:</span>
                  <p className="italic">"{selectedRecordForDetail.notes}"</p>
                </div>
              )}

              <div className="pt-2 text-[11px] text-slate-500 font-mono flex justify-between">
                <span>Rubrica: {selectedRecordForDetail.operatorSignature || 'OP-CONFIRMED'}</span>
                <span>Lote: {selectedRecordForDetail.batchId}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              {onEditRecord && (
                <button
                  onClick={() => {
                    const recToEdit = selectedRecordForDetail;
                    setSelectedRecordForDetail(null);
                    onEditRecord(recToEdit);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-amber-300 bg-amber-950/50 border border-amber-700/60 hover:bg-amber-900/60 rounded-lg flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar Checklist
                </button>
              )}
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-200 bg-[#131C2E] border border-slate-700 hover:bg-slate-800 rounded-lg"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
