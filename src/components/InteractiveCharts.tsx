import React, { useState } from 'react';
import { ChecklistRecord, ScaleVolume } from '../types/bioreactor';
import { DO_REFERENCE_100L, DO_REFERENCE_5000L, REACTORS, SCALE_SPECS, getDOPhaseForHours } from '../constants/reactorConfig';
import { AlertTriangle, Info } from 'lucide-react';

interface InteractiveChartsProps {
  records: ChecklistRecord[];
  scale: ScaleVolume;
  selectedScale: ScaleVolume | 'all';
  onSelectScale: (scale: ScaleVolume | 'all') => void;
  selectedReactorId: number | 'all';
  onSelectReactor: (reactorId: number | 'all') => void;
  onSelectRecord?: (record: ChecklistRecord) => void;
  onOpenDORefModal: () => void;
}

type ParameterKey = 'temperature' | 'pressure' | 'agitation' | 'airflow' | 'dissolvedOxygen';

interface ParamConfig {
  key: ParameterKey;
  label: string;
  unit: string;
  color: string;
  targetGetter: (scale: ScaleVolume) => number;
  deltaGetter: (scale: ScaleVolume) => number | null;
  valGetter: (r: ChecklistRecord) => number;
  minMaxDomain: (scale: ScaleVolume) => [number, number];
}

const PARAM_CONFIGS: Record<ParameterKey, ParamConfig> = {
  temperature: {
    key: 'temperature',
    label: 'Temperatura',
    unit: '°C',
    color: '#38bdf8', // sky-400
    targetGetter: () => 30.0,
    deltaGetter: () => 2.0,
    valGetter: (r) => r.temperature,
    minMaxDomain: () => [26, 34],
  },
  pressure: {
    key: 'pressure',
    label: 'Pressão',
    unit: 'bar',
    color: '#818cf8', // indigo-400
    targetGetter: (s) => SCALE_SPECS[s].pressure.target,
    deltaGetter: () => 0.05,
    valGetter: (r) => r.pressure,
    minMaxDomain: (s) => {
      const tgt = SCALE_SPECS[s].pressure.target;
      return [Math.max(0, Number((tgt - 0.12).toFixed(2))), Number((tgt + 0.12).toFixed(2))];
    },
  },
  agitation: {
    key: 'agitation',
    label: 'Agitação',
    unit: 'RPM',
    color: '#2dd4bf', // teal-400
    targetGetter: (s) => SCALE_SPECS[s].agitation.target,
    deltaGetter: () => null, // Sem delta
    valGetter: (r) => r.agitation,
    minMaxDomain: (s) => {
      const tgt = SCALE_SPECS[s].agitation.target;
      return [Math.max(0, tgt - 40), tgt + 40];
    },
  },
  airflow: {
    key: 'airflow',
    label: 'Vazão de Ar',
    unit: 'L/min',
    color: '#fbbf24', // amber-400
    targetGetter: (s) => SCALE_SPECS[s].airflow.target,
    deltaGetter: () => 10,
    valGetter: (r) => r.airflow,
    minMaxDomain: (s) => {
      const tgt = SCALE_SPECS[s].airflow.target;
      return [tgt - 25, tgt + 25];
    },
  },
  dissolvedOxygen: {
    key: 'dissolvedOxygen',
    label: 'Oxigênio Dissolvido',
    unit: '% O2',
    color: '#06b6d4', // cyan-500
    targetGetter: () => 20.0,
    deltaGetter: () => null,
    valGetter: (r) => r.dissolvedOxygen,
    minMaxDomain: () => [12, 25],
  },
};

const ALL_SCALES_ORDER: ScaleVolume[] = ['100L', '500L', '3000L', '5000L'];

const SCALE_VISUAL_CONFIG: Record<
  ScaleVolume,
  {
    color: string;
    fill: string;
    textFill: string;
    badgeBg: string;
    label: string;
  }
> = {
  '100L': {
    color: '#38BDF8', // Azul Ciano (Sky-400)
    fill: 'rgba(56, 189, 248, 0.13)',
    textFill: '#7DD3FC',
    badgeBg: 'bg-sky-400',
    label: '100L',
  },
  '500L': {
    color: '#10B981', // Verde Esmeralda (Emerald-500)
    fill: 'rgba(16, 185, 129, 0.13)',
    textFill: '#6EE7B7',
    badgeBg: 'bg-emerald-500',
    label: '500L',
  },
  '3000L': {
    color: '#F59E0B', // Âmbar / Laranja (Amber-500)
    fill: 'rgba(245, 158, 11, 0.13)',
    textFill: '#FCD34D',
    badgeBg: 'bg-amber-500',
    label: '3000L',
  },
  '5000L': {
    color: '#A855F7', // Roxo / Violeta (Purple-500)
    fill: 'rgba(168, 85, 247, 0.13)',
    textFill: '#D8B4FE',
    badgeBg: 'bg-purple-500',
    label: '5000L',
  },
};

export const InteractiveCharts: React.FC<InteractiveChartsProps> = ({
  records,
  scale,
  selectedScale,
  onSelectScale,
  selectedReactorId,
  onSelectReactor,
  onOpenDORefModal,
}) => {
  const [activeTab, setActiveTab] = useState<ParameterKey>('temperature');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>('all');
  const [hoveredPoint, setHoveredPoint] = useState<{
    record: ChecklistRecord;
    x: number;
    y: number;
    param: ParameterKey;
  } | null>(null);

  // Extract unique batches/dates available in current records scope
  const availableBatches = Array.from(
    new Set(records.map((r) => r.batchId || 'Lote Padrão'))
  );

  const effectiveBatchFilter =
    selectedBatchFilter === 'all' || availableBatches.includes(selectedBatchFilter)
      ? selectedBatchFilter
      : 'all';

  const baseFilteredByBatch =
    effectiveBatchFilter === 'all'
      ? records
      : records.filter((r) => (r.batchId || 'Lote Padrão') === effectiveBatchFilter);

  const filteredByBatch =
    activeTab === 'dissolvedOxygen'
      ? baseFilteredByBatch.filter((r) => !r.noDOProbe)
      : baseFilteredByBatch;

  // Helper: timestamp real do lançamento do check (data + horário registrado)
  const getRecordCheckTimestamp = (r: ChecklistRecord): number => {
    if (r.date && r.time) {
      const ts = new Date(`${r.date}T${r.time}:00`).getTime();
      if (!isNaN(ts)) return ts;
    }
    return r.timestamp || 0;
  };

  // Helper: deslocamento em horas a partir das 06:00 do relógio (06:00 -> 0h, 08:00 -> 2h, 10:00 -> 4h, 00:00 -> 18h)
  const getClockOffsetFrom06 = (r: ChecklistRecord): number => {
    const [hhStr, mmStr] = (r.time || '06:00').split(':');
    const hh = Number(hhStr);
    const mm = Number(mmStr);
    const validH = !isNaN(hh) ? hh : 6;
    const validM = !isNaN(mm) ? mm : 0;
    return ((validH - 6 + 24) % 24) + validM / 60;
  };

  // Helper: chave do dia operacional (cada ciclo de 24h do gráfico inicia às 06:00)
  const getOperationalDayKey = (r: ChecklistRecord): string => {
    if (!r.date) return 'default-day';
    const [y, m, d] = r.date.split('-').map(Number);
    const [hh] = (r.time || '06:00').split(':').map(Number);
    if (!y || !m || !d) return r.date;
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    if (!isNaN(hh) && hh < 6) {
      dt.setDate(dt.getDate() - 1);
    }
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  // Ordena os registros cronologicamente pela data e horário em que o check foi lançado
  const rawSorted = [...filteredByBatch].sort((a, b) => {
    const ta = getRecordCheckTimestamp(a);
    const tb = getRecordCheckTimestamp(b);
    if (ta !== tb) return ta - tb;
    return a.processHours - b.processHours;
  });

  // Dias operacionais presentes no filtro atual para posicionar cada check exatamente no horário do relógio em que foi lançado
  const uniqueOpDays = Array.from(new Set(rawSorted.map(getOperationalDayKey)));

  // Posiciona cada ponto no eixo X pelo horário real em que o check foi lançado (e não pelas horas de cultivo processHours)
  const plottedRecords: {
    record: ChecklistRecord;
    plotHours: number;
    baseClockHour: number;
  }[] = [];

  rawSorted.forEach((rec, idx) => {
    const dayIdx = Math.max(0, uniqueOpDays.indexOf(getOperationalDayKey(rec)));
    const baseClockHour = Number((dayIdx * 24 + getClockOffsetFrom06(rec)).toFixed(2));
    let plotH = baseClockHour;

    if (idx > 0) {
      const prev = plottedRecords[idx - 1];
      // Se dois checks foram lançados com poucos minutos de diferença no mesmo horário,
      // aplica um leve espaçamento mínimo visual (0.35h) para que ambos os pontos fiquem visíveis lado a lado no mesmo horário
      if (plotH <= prev.plotHours + 0.32) {
        plotH = Number((prev.plotHours + 0.35).toFixed(2));
      }
    }

    plottedRecords.push({
      record: rec,
      plotHours: Math.max(0, plotH),
      baseClockHour: Math.max(0, baseClockHour),
    });
  });

  const sortedRecords = plottedRecords.map((item) => item.record);
  const isAllScalesView = selectedScale === 'all' && selectedReactorId === 'all';

  const currentConfig = PARAM_CONFIGS[activeTab];
  const target = currentConfig.targetGetter(scale);
  const delta = currentConfig.deltaGetter(scale);

  // Calcula o domínio base do eixo Y: quando em "Todas as Escalas", abrange os limites mín/máx de todas as 4 escalas
  // para que nenhuma leitura nominal pareça um falso outlier fora do gráfico
  const [baseDomainMin, baseDomainMax] = (() => {
    if (!isAllScalesView) {
      return currentConfig.minMaxDomain(scale);
    }
    if (activeTab === 'pressure') return [0.0, 0.62] as [number, number];
    if (activeTab === 'agitation') return [75, 220] as [number, number];
    if (activeTab === 'airflow') return [40, 860] as [number, number];
    if (activeTab === 'dissolvedOxygen') return [12, 25] as [number, number];
    return [26, 34] as [number, number];
  })();

  // Dynamically expand Y-axis domain if any measured value is outside the base range
  const measuredValues = sortedRecords.map((r) => currentConfig.valGetter(r));
  const minMeasured = measuredValues.length > 0 ? Math.min(...measuredValues) : baseDomainMin;
  const maxMeasured = measuredValues.length > 0 ? Math.max(...measuredValues) : baseDomainMax;
  const span = Math.max(0.1, baseDomainMax - baseDomainMin);
  const domainMin =
    minMeasured < baseDomainMin ? Number((minMeasured - span * 0.12).toFixed(2)) : baseDomainMin;
  const domainMax =
    maxMeasured > baseDomainMax ? Number((maxMeasured + span * 0.12).toFixed(2)) : baseDomainMax;

  // Calculate average of the active parameter
  const avgValue =
    sortedRecords.length > 0
      ? sortedRecords.reduce((acc, r) => acc + currentConfig.valGetter(r), 0) / sortedRecords.length
      : null;

  // SVG dimensions - wide layout so every 2-hour point has clear spacing
  const svgWidth = 1260;
  const svgHeight = 330;
  const padding = { top: 34, right: 32, bottom: 68, left: 60 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  // Process hours range (0h to at least 60h in steps of 2h)
  const maxHours = Math.max(
    60,
    ...plottedRecords.map((item) => Math.ceil((item.plotHours || 10) / 2) * 2)
  );
  const minHours = 0;

  // Generate 2-hour ticks: 0, 2, 4, 6, 8, ..., maxHours
  const twoHourTicks: number[] = [];
  for (let h = minHours; h <= maxHours; h += 2) {
    twoHourTicks.push(h);
  }

  // Helper to get the full clock hour (always even full hours: 06:00, 08:00, 10:00, 12:00...) for any 2-hour tick
  const getClockTimeForHour = (h: number): string => {
    const baseHour = 6;
    const clockH = (((baseHour + Math.round(h)) % 24) + 24) % 24;
    return `${String(clockH).padStart(2, '0')}:00`;
  };

  const scaleX = (h: number) => padding.left + ((h - minHours) / (maxHours - minHours)) * chartW;
  const scaleY = (v: number) => {
    const clamped = Math.max(domainMin, Math.min(domainMax, v));
    return padding.top + chartH - ((clamped - domainMin) / (domainMax - domainMin)) * chartH;
  };

  // Coordinates for target, average, and delta bands
  const yTarget = scaleY(target);
  const yAvg = avgValue !== null ? scaleY(avgValue) : null;
  const yUpper = delta !== null ? scaleY(target + delta) : null;
  const yLower = delta !== null ? scaleY(target - delta) : null;

  // Build path for points using plotHours
  const points = plottedRecords.map((item) => {
    const val = currentConfig.valGetter(item.record);
    return {
      x: scaleX(item.plotHours),
      y: scaleY(val),
      val,
      plotHours: item.plotHours,
      record: item.record,
    };
  });

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Build helper for DO 4-phase polygon and min/max lines for a given phase list
  const buildDOPhaseGeometry = (phases: typeof DO_REFERENCE_100L | null) => {
    if (!phases || phases.length === 0) {
      return { maxLine: '', minLine: '', bandPolygon: '' };
    }
    const maxCoords: { x: number; y: number }[] = [];
    const minCoords: { x: number; y: number }[] = [];

    phases.forEach((phase) => {
      const x1 = scaleX(phase.minHours);
      const x2 = scaleX(phase.maxHours);
      const yMax = scaleY(Math.max(phase.o2ProbeMin, phase.o2ProbeMax));
      const yMin = scaleY(Math.min(phase.o2ProbeMin, phase.o2ProbeMax));

      maxCoords.push({ x: x1, y: yMax }, { x: x2, y: yMax });
      minCoords.push({ x: x1, y: yMin }, { x: x2, y: yMin });
    });

    const maxLine = maxCoords.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const minLine = minCoords.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const polygonCoords = [...maxCoords, ...[...minCoords].reverse()];
    const bandPolygon = polygonCoords.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');

    return { maxLine, minLine, bandPolygon };
  };

  // References for DO Phases (100L and 5000L)
  const doPhases = scale === '100L' ? DO_REFERENCE_100L : scale === '5000L' ? DO_REFERENCE_5000L : null;
  const singleDOGeom = buildDOPhaseGeometry(doPhases);
  const do100LGeom = buildDOPhaseGeometry(DO_REFERENCE_100L);
  const do5000LGeom = buildDOPhaseGeometry(DO_REFERENCE_5000L);

  // Hover point DO phase lookup (usa a escala real do registro sob o mouse)
  const hoveredDOPhase =
    hoveredPoint && activeTab === 'dissolvedOxygen'
      ? getDOPhaseForHours(hoveredPoint.record.scale, hoveredPoint.record.processHours)
      : null;

  return (
    <div className="bg-[#0F1624] border border-slate-800/90 rounded-xl p-5">
      {/* Top Header & Tabs */}
      <div className="flex flex-col gap-3.5 border-b border-slate-800/80 pb-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                Monitoramento de Tendências & Tolerâncias (A cada 2 Horas)
              </h2>
              <span className="text-xs font-mono text-cyan-400">
                · {selectedScale === 'all' && selectedReactorId === 'all' ? `Ref. Escala ${scale}` : `Escala ${scale}`}{' '}
                {selectedReactorId !== 'all' ? `· BR-${String(selectedReactorId).padStart(2, '0')}` : '· Todos os Tanques'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Acompanhamento ponto a ponto de 2 em 2 horas (horários cheios) com linhas de limites mínimo/máximo e média
            </p>
          </div>

          {/* Tab Buttons */}
          <div className="flex items-center gap-1 p-1 bg-[#080C14] border border-slate-800 rounded-lg overflow-x-auto self-start lg:self-auto">
            {(Object.keys(PARAM_CONFIGS) as ParameterKey[]).map((key) => {
              const cfg = PARAM_CONFIGS[key];
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter Bar Above the Chart: Escala + Tanque + Lote */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
              Escala:
            </label>
            <select
              value={selectedScale}
              onChange={(e) => onSelectScale(e.target.value as ScaleVolume | 'all')}
              className="text-xs font-mono bg-[#080C14] border border-slate-700/90 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-semibold"
              title="Filtrar gráfico por escala"
            >
              <option value="all">Todas as Escalas</option>
              <option value="100L">Escala 100L (Tanques 1 ao 5)</option>
              <option value="500L">Escala 500L (Tanques 6 ao 10)</option>
              <option value="5000L">Escala 5000L (Tanques 11 ao 14)</option>
              <option value="3000L">Escala 3000L (Tanques 15 e 16)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
              Tanque:
            </label>
            <select
              value={selectedReactorId}
              onChange={(e) =>
                onSelectReactor(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="text-xs font-mono bg-[#080C14] border border-slate-700/90 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-semibold"
              title="Filtrar gráfico por tanque"
            >
              <option value="all">
                {selectedScale === 'all'
                  ? 'Todos os Tanques (1 ao 16)'
                  : `Todos os Tanques (${selectedScale})`}
              </option>
              {(selectedScale === 'all' || selectedScale === '100L') && (
                <optgroup label="100L (Tanques 1 ao 5)">
                  {REACTORS.filter((r) => r.scale === '100L').map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {(selectedScale === 'all' || selectedScale === '500L') && (
                <optgroup label="500L (Tanques 6 ao 10)">
                  {REACTORS.filter((r) => r.scale === '500L').map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {(selectedScale === 'all' || selectedScale === '5000L') && (
                <optgroup label="5000L (Tanques 11 ao 14)">
                  {REACTORS.filter((r) => r.scale === '5000L').map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {(selectedScale === 'all' || selectedScale === '3000L') && (
                <optgroup label="3000L (Tanques 15 e 16)">
                  {REACTORS.filter((r) => r.scale === '3000L').map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.tag} · {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {availableBatches.length > 1 && (
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                Lote:
              </label>
              <select
                value={effectiveBatchFilter}
                onChange={(e) => setSelectedBatchFilter(e.target.value)}
                className="text-xs font-mono bg-[#080C14] border border-slate-700/90 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                title="Filtrar por lote no gráfico"
              >
                <option value="all">Todos os Lotes ({records.length})</option>
                {availableBatches.map((b) => (
                  <option key={b} value={b}>
                    Lote {b}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Target, Average & Delta Metric Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 bg-[#131C2E]/80 p-3.5 rounded-lg border border-slate-800 text-xs">
        <div>
          <span className="text-slate-400 block">Alvo (Setpoint)</span>
          <span className="text-sm font-bold font-mono text-slate-100">
            {activeTab === 'dissolvedOxygen'
              ? isAllScalesView
                ? 'Curvas 100L e 5000L'
                : doPhases
                ? 'Curva 4 Fases'
                : 'Livre'
              : isAllScalesView && activeTab !== 'temperature'
              ? activeTab === 'pressure'
                ? '0.10 / 0.20 / 0.30 / 0.50 bar'
                : activeTab === 'agitation'
                ? '95 / 117 / 200 RPM'
                : '85 / 220 / 800 L/min'
              : `${target} ${currentConfig.unit}`}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Média Calculada</span>
          <span className="text-sm font-bold font-mono text-cyan-400">
            {avgValue !== null ? `${avgValue.toFixed(2)} ${currentConfig.unit}` : '-'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Tolerância / Limites</span>
          <span className="text-sm font-bold font-mono text-slate-100">
            {activeTab === 'dissolvedOxygen'
              ? isAllScalesView || doPhases
                ? 'Linhas Mín e Máx por Escala/Fase'
                : 'Sem limite'
              : delta !== null
              ? `± ${delta} ${currentConfig.unit} (Por Escala)`
              : 'Sem delta (Alvo Fixo por Escala)'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Faixa Nominal</span>
          <span className="text-sm font-bold font-mono text-slate-100">
            {isAllScalesView
              ? activeTab === 'temperature'
                ? '28.0 a 32.0 °C (Todas)'
                : 'Faixas Coloridas por Escala'
              : activeTab === 'dissolvedOxygen'
              ? scale === '100L'
                ? '14.28% a 22.36%'
                : scale === '5000L'
                ? '16.29% a 23.03%'
                : 'Registro Livre'
              : delta !== null
              ? `${(target - delta).toFixed(activeTab === 'pressure' ? 2 : 1)} a ${(target + delta).toFixed(activeTab === 'pressure' ? 2 : 1)} ${currentConfig.unit}`
              : `${target} ${currentConfig.unit}`}
          </span>
        </div>
        <div className="flex items-center justify-between sm:justify-end">
          {activeTab === 'dissolvedOxygen' ? (
            <button
              onClick={onOpenDORefModal}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-700/60 px-2.5 py-1 rounded whitespace-nowrap"
            >
              <Info className="w-3.5 h-3.5" />
              Tabela de Fases O2
            </button>
          ) : (
            <div className="text-right">
              <span className="text-slate-400 block">Total de Amostras</span>
              <span className="text-sm font-bold font-mono text-slate-100">{sortedRecords.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Interactive Chart Stage */}
      <div className="relative w-full">
        <div className="w-full overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto select-none font-mono"
          style={{ minWidth: '920px', maxHeight: '370px' }}
        >
          <defs>
            <linearGradient id="bandGradientDark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="doTunnelGradientDark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.10" />
            </linearGradient>
          </defs>

          {/* Dark Grid Background */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartW}
            height={chartH}
            fill="#090D16"
            stroke="#1E293B"
            strokeWidth="1"
          />

          {/* Vertical 2-hour grid lines */}
          {twoHourTicks.map((h) => {
            const x = scaleX(h);
            return (
              <line
                key={`vgrid-${h}`}
                x1={x}
                y1={padding.top}
                x2={x}
                y2={padding.top + chartH}
                stroke="#131C2E"
                strokeWidth="1"
              />
            );
          })}

          {/* DO Phase Columns + Min & Max Limit Lines */}
          {activeTab === 'dissolvedOxygen' && (isAllScalesView || doPhases) && (
            <g>
              {/* Background Phase Columns */}
              {(doPhases || DO_REFERENCE_100L).map((phase, idx) => {
                const xStart = scaleX(phase.minHours);
                const xEnd = scaleX(phase.maxHours);
                const w = Math.max(0, xEnd - xStart);
                const colors = ['#0F172A', '#0D1F22', '#1C1917', '#0F1629'];
                const phaseColor = colors[idx % colors.length];
                const yMax = scaleY(Math.max(phase.o2ProbeMin, phase.o2ProbeMax));
                const yMin = scaleY(Math.min(phase.o2ProbeMin, phase.o2ProbeMax));

                return (
                  <g key={phase.phase}>
                    <rect
                      x={xStart}
                      y={padding.top}
                      width={w}
                      height={chartH}
                      fill={phaseColor}
                      fillOpacity="0.65"
                      stroke="#1E293B"
                      strokeWidth="0.8"
                      strokeDasharray="3,3"
                    />
                    <text
                      x={xStart + w / 2}
                      y={padding.top + 14}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#94A3B8"
                      fontWeight="700"
                    >
                      {phase.phase} ({phase.intervalHours})
                    </text>

                    {!isAllScalesView && (
                      <>
                        <text
                          x={xStart + w / 2}
                          y={Math.max(padding.top + 26, yMax - 6)}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="700"
                          fill="#2DD4BF"
                        >
                          Máx: {Math.max(phase.o2ProbeMin, phase.o2ProbeMax).toFixed(2)}%
                        </text>
                        <text
                          x={xStart + w / 2}
                          y={Math.min(padding.top + chartH - 5, yMin + 12)}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="700"
                          fill="#FBBF24"
                        >
                          Mín: {Math.min(phase.o2ProbeMin, phase.o2ProbeMax).toFixed(2)}%
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {isAllScalesView ? (
                <>
                  {/* 100L DO Corridor (Cyan) */}
                  {do100LGeom.bandPolygon && (
                    <polygon points={do100LGeom.bandPolygon} fill={SCALE_VISUAL_CONFIG['100L'].fill} />
                  )}
                  {do100LGeom.maxLine && (
                    <polyline
                      fill="none"
                      stroke={SCALE_VISUAL_CONFIG['100L'].color}
                      strokeWidth="1.8"
                      strokeDasharray="6,3"
                      points={do100LGeom.maxLine}
                    />
                  )}
                  {do100LGeom.minLine && (
                    <polyline
                      fill="none"
                      stroke={SCALE_VISUAL_CONFIG['100L'].color}
                      strokeWidth="1.8"
                      strokeDasharray="3,3"
                      points={do100LGeom.minLine}
                    />
                  )}
                  <text
                    x={padding.left + 8}
                    y={scaleY(22.36) - 5}
                    fontSize="8.5"
                    fontWeight="700"
                    fill={SCALE_VISUAL_CONFIG['100L'].textFill}
                  >
                    100L: Faixa O2 (14.28% a 22.36%)
                  </text>

                  {/* 5000L DO Corridor (Purple) */}
                  {do5000LGeom.bandPolygon && (
                    <polygon points={do5000LGeom.bandPolygon} fill={SCALE_VISUAL_CONFIG['5000L'].fill} />
                  )}
                  {do5000LGeom.maxLine && (
                    <polyline
                      fill="none"
                      stroke={SCALE_VISUAL_CONFIG['5000L'].color}
                      strokeWidth="1.8"
                      strokeDasharray="6,3"
                      points={do5000LGeom.maxLine}
                    />
                  )}
                  {do5000LGeom.minLine && (
                    <polyline
                      fill="none"
                      stroke={SCALE_VISUAL_CONFIG['5000L'].color}
                      strokeWidth="1.8"
                      strokeDasharray="3,3"
                      points={do5000LGeom.minLine}
                    />
                  )}
                  <text
                    x={padding.left + chartW - 8}
                    y={scaleY(23.03) - 5}
                    textAnchor="end"
                    fontSize="8.5"
                    fontWeight="700"
                    fill={SCALE_VISUAL_CONFIG['5000L'].textFill}
                  >
                    5000L: Faixa O2 (16.29% a 23.03%)
                  </text>
                </>
              ) : (
                <>
                  {singleDOGeom.bandPolygon && (
                    <polygon points={singleDOGeom.bandPolygon} fill="url(#doTunnelGradientDark)" />
                  )}
                  {singleDOGeom.maxLine && (
                    <polyline
                      fill="none"
                      stroke="#2DD4BF"
                      strokeWidth="2"
                      strokeDasharray="6,3"
                      points={singleDOGeom.maxLine}
                    />
                  )}
                  {singleDOGeom.minLine && (
                    <polyline
                      fill="none"
                      stroke="#FBBF24"
                      strokeWidth="2"
                      strokeDasharray="6,3"
                      points={singleDOGeom.minLine}
                    />
                  )}
                </>
              )}
            </g>
          )}

          {/* Multi-Scale Colored Limit Bands & Target Lines when viewing ALL Scales */}
          {activeTab !== 'dissolvedOxygen' && isAllScalesView && (
            <g>
              {activeTab === 'temperature' ? (
                /* Temperatura: Mesma faixa universal (28 a 32 °C), destacada com as 4 cores das escalas */
                <g>
                  <rect
                    x={padding.left}
                    y={scaleY(32)}
                    width={chartW}
                    height={Math.abs(scaleY(28) - scaleY(32))}
                    fill="url(#bandGradientDark)"
                  />
                  <line
                    x1={padding.left}
                    y1={scaleY(32)}
                    x2={padding.left + chartW}
                    y2={scaleY(32)}
                    stroke="#38BDF8"
                    strokeWidth="1.4"
                    strokeDasharray="5,3"
                  />
                  <text
                    x={padding.left + chartW - 6}
                    y={scaleY(32) - 5}
                    textAnchor="end"
                    fontSize="8.5"
                    fontWeight="700"
                    fill="#7DD3FC"
                  >
                    Máx (100L · 500L · 3000L · 5000L): 32.0 °C
                  </text>
                  <line
                    x1={padding.left}
                    y1={scaleY(30)}
                    x2={padding.left + chartW}
                    y2={scaleY(30)}
                    stroke="#E2E8F0"
                    strokeWidth="1.3"
                    strokeDasharray="4,4"
                    strokeOpacity="0.8"
                  />
                  <text
                    x={padding.left + 8}
                    y={scaleY(30) - 5}
                    fontSize="9"
                    fontWeight="600"
                    fill="#F8FAFC"
                  >
                    Alvo Universal: 30.0 °C
                  </text>
                  <line
                    x1={padding.left}
                    y1={scaleY(28)}
                    x2={padding.left + chartW}
                    y2={scaleY(28)}
                    stroke="#10B981"
                    strokeWidth="1.4"
                    strokeDasharray="5,3"
                  />
                  <text
                    x={padding.left + chartW - 6}
                    y={scaleY(28) + 12}
                    textAnchor="end"
                    fontSize="8.5"
                    fontWeight="700"
                    fill="#6EE7B7"
                  >
                    Mín (100L · 500L · 3000L · 5000L): 28.0 °C
                  </text>
                </g>
              ) : (
                /* Pressão, Agitação e Vazão de Ar: Faixas Mín/Máx e Alvos coloridos por Escala */
                ALL_SCALES_ORDER.map((sc, sIdx) => {
                  const vCfg = SCALE_VISUAL_CONFIG[sc];
                  const scTarget = currentConfig.targetGetter(sc);
                  const scDelta = currentConfig.deltaGetter(sc);
                  const yTgt = scaleY(scTarget);

                  // Evita sobrepor o texto de 3000L e 5000L quando possuem o mesmo valor nominal (Agitação 200 RPM / Vazão 800 L/min)
                  const isShared3000And5000 =
                    (activeTab === 'agitation' || activeTab === 'airflow') &&
                    (sc === '3000L' || sc === '5000L');

                  if (scDelta !== null) {
                    const maxVal = scTarget + scDelta;
                    const minVal = scTarget - scDelta;
                    const yMax = scaleY(maxVal);
                    const yMin = scaleY(minVal);
                    const decimals = activeTab === 'pressure' ? 2 : 0;

                    return (
                      <g key={`multiscale-band-${sc}`}>
                        {/* Shaded Band for this Scale */}
                        <rect
                          x={padding.left}
                          y={yMax}
                          width={chartW}
                          height={Math.max(2, Math.abs(yMin - yMax))}
                          fill={vCfg.fill}
                        />
                        {/* Max Limit Line */}
                        <line
                          x1={padding.left}
                          y1={yMax}
                          x2={padding.left + chartW}
                          y2={yMax}
                          stroke={vCfg.color}
                          strokeWidth="1.4"
                          strokeDasharray={sc === '5000L' && isShared3000And5000 ? '2,4' : '5,3'}
                          strokeOpacity="0.9"
                        />
                        {/* Min Limit Line */}
                        <line
                          x1={padding.left}
                          y1={yMin}
                          x2={padding.left + chartW}
                          y2={yMin}
                          stroke={vCfg.color}
                          strokeWidth="1.4"
                          strokeDasharray={sc === '5000L' && isShared3000And5000 ? '2,4' : '5,3'}
                          strokeOpacity="0.9"
                        />
                        {/* Subtle center target line */}
                        <line
                          x1={padding.left}
                          y1={yTgt}
                          x2={padding.left + chartW}
                          y2={yTgt}
                          stroke={vCfg.color}
                          strokeWidth="0.8"
                          strokeDasharray="2,4"
                          strokeOpacity="0.55"
                        />
                        {/* Scale Label with Min & Max */}
                        {(!isShared3000And5000 || sc === '3000L') && (
                          <text
                            x={sIdx % 2 === 0 ? padding.left + chartW - 8 : padding.left + 8}
                            y={yMax + Math.abs(yMin - yMax) / 2 + 3}
                            textAnchor={sIdx % 2 === 0 ? 'end' : 'start'}
                            fontSize="8.5"
                            fontWeight="700"
                            fill={vCfg.textFill}
                          >
                            {isShared3000And5000 ? '3000L / 5000L' : sc}: Mín {minVal.toFixed(decimals)} · Alvo{' '}
                            {scTarget.toFixed(decimals)} · Máx {maxVal.toFixed(decimals)} {currentConfig.unit}
                          </text>
                        )}
                      </g>
                    );
                  }

                  // Agitação (Sem delta - Alvo Fixo por Escala)
                  return (
                    <g key={`multiscale-fixed-${sc}`}>
                      <line
                        x1={padding.left}
                        y1={yTgt}
                        x2={padding.left + chartW}
                        y2={yTgt}
                        stroke={vCfg.color}
                        strokeWidth="1.6"
                        strokeDasharray={sc === '5000L' ? '3,5' : '6,3'}
                        strokeOpacity="0.9"
                      />
                      {(!isShared3000And5000 || sc === '3000L') && (
                        <text
                          x={sIdx % 2 === 0 ? padding.left + chartW - 8 : padding.left + 8}
                          y={yTgt - 5}
                          textAnchor={sIdx % 2 === 0 ? 'end' : 'start'}
                          fontSize="8.5"
                          fontWeight="700"
                          fill={vCfg.textFill}
                        >
                          {isShared3000And5000 ? '3000L / 5000L' : sc}: Alvo Fixo {scTarget} {currentConfig.unit}
                        </text>
                      )}
                    </g>
                  );
                })
              )}
            </g>
          )}

          {/* Single-Scale Tolerance Band (Delta) for non-DO parameters */}
          {activeTab !== 'dissolvedOxygen' && !isAllScalesView && delta !== null && yUpper !== null && yLower !== null && (
            <g>
              <rect
                x={padding.left}
                y={yUpper}
                width={chartW}
                height={Math.abs(yLower - yUpper)}
                fill={SCALE_VISUAL_CONFIG[scale].fill}
              />
              {/* Upper tolerance line */}
              <line
                x1={padding.left}
                y1={yUpper}
                x2={padding.left + chartW}
                y2={yUpper}
                stroke={SCALE_VISUAL_CONFIG[scale].color}
                strokeWidth="1.4"
                strokeDasharray="4,4"
                strokeOpacity="0.85"
              />
              <text
                x={padding.left + chartW - 6}
                y={yUpper - 5}
                textAnchor="end"
                fontSize="9"
                fontWeight="600"
                fill={SCALE_VISUAL_CONFIG[scale].textFill}
              >
                Limite Sup ({scale}): {(target + delta).toFixed(activeTab === 'pressure' ? 2 : 1)} {currentConfig.unit}
              </text>

              {/* Lower tolerance line */}
              <line
                x1={padding.left}
                y1={yLower}
                x2={padding.left + chartW}
                y2={yLower}
                stroke={SCALE_VISUAL_CONFIG[scale].color}
                strokeWidth="1.4"
                strokeDasharray="4,4"
                strokeOpacity="0.85"
              />
              <text
                x={padding.left + chartW - 6}
                y={yLower + 12}
                textAnchor="end"
                fontSize="9"
                fontWeight="600"
                fill={SCALE_VISUAL_CONFIG[scale].textFill}
              >
                Limite Inf ({scale}): {(target - delta).toFixed(activeTab === 'pressure' ? 2 : 1)} {currentConfig.unit}
              </text>
            </g>
          )}

          {/* Single-Scale Target Setpoint Line */}
          {activeTab !== 'dissolvedOxygen' && !isAllScalesView && (
            <g>
              <line
                x1={padding.left}
                y1={yTarget}
                x2={padding.left + chartW}
                y2={yTarget}
                stroke="#E2E8F0"
                strokeWidth="1.5"
                strokeDasharray="5,3"
                strokeOpacity="0.85"
              />
              <text
                x={padding.left + 8}
                y={yTarget - 6}
                fontSize="10"
                fontWeight="600"
                fill="#F8FAFC"
              >
                Alvo ({scale}): {target} {currentConfig.unit}
              </text>
            </g>
          )}

          {/* Average Value Line (Exibido quando filtrando uma escala ou tanque único, ou em Temperatura/O2) */}
          {avgValue !== null && yAvg !== null && (!isAllScalesView || activeTab === 'temperature') && (
            <g>
              <line
                x1={padding.left}
                y1={yAvg}
                x2={padding.left + chartW}
                y2={yAvg}
                stroke="#A855F7"
                strokeWidth="1.2"
                strokeDasharray="2,3"
                strokeOpacity="0.85"
              />
              <text
                x={padding.left + chartW - 6}
                y={yAvg - 5}
                textAnchor="end"
                fontSize="9"
                fontWeight="600"
                fill="#C084FC"
              >
                Média: {avgValue.toFixed(2)} {currentConfig.unit}
              </text>
            </g>
          )}

          {/* Time Series Measured Lines: Por Escala quando em "Todas as Escalas", ou linha única quando filtrado */}
          {isAllScalesView
            ? ALL_SCALES_ORDER.map((sc) => {
                const scPoints = points.filter((p) => p.record.scale === sc);
                if (scPoints.length < 2) return null;
                const scPoly = scPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                return (
                  <polyline
                    key={`poly-${sc}`}
                    fill="none"
                    stroke={SCALE_VISUAL_CONFIG[sc].color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={scPoly}
                  />
                );
              })
            : points.length > 1 && (
                <polyline
                  fill="none"
                  stroke={SCALE_VISUAL_CONFIG[scale].color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}

          {/* Data Points */}
          {points.map((pt, i) => {
            const isNominal =
              activeTab === 'temperature'
                ? pt.record.isTemperatureNominal
                : activeTab === 'pressure'
                ? pt.record.isPressureNominal
                : activeTab === 'agitation'
                ? pt.record.isAgitationNominal
                : activeTab === 'airflow'
                ? pt.record.isAirflowNominal
                : pt.record.isDONominal;

            const scaleColor = SCALE_VISUAL_CONFIG[pt.record.scale]?.color || currentConfig.color;
            const prevPt = i > 0 ? points[i - 1] : null;
            const isCloseToPrev = prevPt ? Math.abs(pt.x - prevPt.x) < 32 : false;
            const showTimeBadge = (points.length <= 24 && !isCloseToPrev) || !isNominal;
            const badgeY = pt.y > padding.top + 22 ? pt.y - 9 : pt.y + 15;

            return (
              <g
                key={pt.record.id || i}
                className="cursor-pointer group"
                onMouseEnter={() =>
                  setHoveredPoint({
                    record: pt.record,
                    x: pt.x,
                    y: pt.y,
                    param: activeTab,
                  })
                }
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {!isNominal && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="8.5"
                    fill="none"
                    stroke="#F43F5E"
                    strokeWidth="2"
                    strokeDasharray="2,2"
                    className="animate-pulse"
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4.5"
                  fill={isNominal ? scaleColor : '#F43F5E'}
                  stroke="#090D16"
                  strokeWidth="2"
                />
                {showTimeBadge && (
                  <text
                    x={pt.x}
                    y={badgeY}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="600"
                    fill={isNominal ? '#CBD5E1' : '#FDA4AF'}
                  >
                    {pt.record.time}
                  </text>
                )}
              </g>
            );
          })}

          {/* X-Axis (Every 2 Hours + Horários Cheios) */}
          <line
            x1={padding.left}
            y1={padding.top + chartH}
            x2={padding.left + chartW}
            y2={padding.top + chartH}
            stroke="#334155"
            strokeWidth="1"
          />

          {twoHourTicks.map((h) => {
            const x = scaleX(h);
            const clockTime = getClockTimeForHour(h);
            const hasPointAtHour = plottedRecords.some(
              (item) => Math.round(item.baseClockHour / 2) * 2 === h
            );
            const dayIdx = Math.floor(h / 24);
            const opDayStr = uniqueOpDays[dayIdx];
            const daySubLabel = opDayStr && opDayStr !== 'default-day'
              ? opDayStr.split('-').reverse().slice(0, 2).join('/')
              : `Dia ${dayIdx + 1}`;

            return (
              <g key={h}>
                <line
                  x1={x}
                  y1={padding.top + chartH}
                  x2={x}
                  y2={padding.top + chartH + 5}
                  stroke={hasPointAtHour ? '#38BDF8' : '#475569'}
                  strokeWidth={hasPointAtHour ? '1.5' : '1'}
                />
                {/* Horário Cheio do Relógio (06:00, 08:00, 10:00...) */}
                <text
                  x={x}
                  y={padding.top + chartH + 17}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight={hasPointAtHour ? '700' : '500'}
                  fill={hasPointAtHour ? '#F8FAFC' : '#64748B'}
                >
                  {clockTime}
                </text>
                {/* Data / Dia do Lançamento */}
                <text
                  x={x}
                  y={padding.top + chartH + 29}
                  textAnchor="middle"
                  fontSize="7.5"
                  fill={hasPointAtHour ? '#38BDF8' : '#475569'}
                  fontWeight={hasPointAtHour ? '600' : '400'}
                >
                  {daySubLabel}
                </text>
              </g>
            );
          })}
          <text
            x={padding.left + chartW / 2}
            y={padding.top + chartH + 50}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="600"
            fill="#94A3B8"
          >
            Horário de Lançamento do Check (A cada 2 horas · Horários Cheios 06:00, 08:00, 10:00...)
          </text>

          {/* Y-Axis Labels */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartH}
            stroke="#334155"
            strokeWidth="1"
          />

          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((pct) => {
            const val = domainMin + pct * (domainMax - domainMin);
            const y = scaleY(val);
            return (
              <g key={pct}>
                <line x1={padding.left - 4} y1={y} x2={padding.left} y2={y} stroke="#475569" />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94A3B8"
                >
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}
        </svg>
        </div>

        {/* Hover Tooltip Overlay (Placed outside overflow-x-auto and dynamically positioned so it never clips) */}
        {hoveredPoint && (() => {
          const xPct = (hoveredPoint.x / svgWidth) * 100;
          const yPct = (hoveredPoint.y / svgHeight) * 100;
          const placeOnLeft = xPct > 62;
          const clampedTopPct = Math.min(58, Math.max(4, yPct - 18));

          return (
            <div
              className={`absolute z-30 pointer-events-none bg-[#080C14]/95 text-slate-100 rounded-lg p-3 text-xs shadow-2xl border border-slate-600/90 w-64 ${
                placeOnLeft ? '-translate-x-full -ml-3' : 'ml-3'
              }`}
              style={{
                left: `${Math.min(94, Math.max(6, xPct))}%`,
                top: `${clampedTopPct}%`,
              }}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5 font-mono">
                <span className="font-semibold text-slate-200">
                  {hoveredPoint.record.reactorTag} ({hoveredPoint.record.scale}) · {hoveredPoint.record.processHours}h
                </span>
                <span className="text-cyan-400 font-bold">
                  {hoveredPoint.record.time} ({hoveredPoint.record.date.split('-').reverse().slice(0, 2).join('/')})
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{currentConfig.label}:</span>
                  <span className="font-bold text-white font-mono text-sm">
                    {currentConfig.valGetter(hoveredPoint.record)} {currentConfig.unit}
                  </span>
                </div>

                {hoveredPoint.record.inoculationDate && hoveredPoint.record.inoculationTime && (
                  <div className="flex justify-between items-center text-slate-400 font-mono">
                    <span>Inoculação:</span>
                    <span className="text-cyan-300">
                      {hoveredPoint.record.inoculationDate.split('-').reverse().slice(0, 2).join('/')}{' '}
                      {hoveredPoint.record.inoculationTime}
                    </span>
                  </div>
                )}

                {activeTab === 'dissolvedOxygen' && hoveredDOPhase && (
                  <div className="flex justify-between items-center text-slate-300 font-mono">
                    <span>Limites ({hoveredPoint.record.scale} · {hoveredDOPhase.phase}):</span>
                    <span className="text-teal-300">
                      {hoveredDOPhase.o2ProbeMin}% – {hoveredDOPhase.o2ProbeMax}%
                    </span>
                  </div>
                )}

                {avgValue !== null && (
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Média do Parâmetro:</span>
                    <span className="font-mono text-purple-300">
                      {avgValue.toFixed(2)} {currentConfig.unit}
                    </span>
                  </div>
                )}

                {activeTab !== 'dissolvedOxygen' && (
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Alvo / Delta ({hoveredPoint.record.scale}):</span>
                    <span className="font-mono text-slate-200">
                      {currentConfig.targetGetter(hoveredPoint.record.scale)}{' '}
                      {currentConfig.deltaGetter(hoveredPoint.record.scale) !== null
                        ? `(±${currentConfig.deltaGetter(hoveredPoint.record.scale)})`
                        : '(Fixo)'}{' '}
                      {currentConfig.unit}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
                  <span>Operador:</span>
                  <span className="text-slate-200">{hoveredPoint.record.operatorName}</span>
                </div>

                {hoveredPoint.record.notes && (
                  <div className="text-slate-300 italic pt-1 border-t border-slate-800 text-[11px]">
                    "{hoveredPoint.record.notes}"
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Reference note for 500L & 3000L if DO is selected */}
      {activeTab === 'dissolvedOxygen' && !isAllScalesView && (scale === '500L' || scale === '3000L') && (
        <div className="mt-3 p-3 bg-amber-950/40 border border-amber-700/60 rounded-lg text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Observação técnica:</strong> Conforme diretriz de processo, as escalas de <strong>500L</strong> e{' '}
            <strong>3000L</strong> não possuem faixas de referência tabeladas para oxigênio dissolvido.
          </span>
        </div>
      )}

      {/* Bottom Summary Indicators & Per-Scale Color Legend */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          {ALL_SCALES_ORDER.map((sc) => {
            const vCfg = SCALE_VISUAL_CONFIG[sc];
            const scTgt = currentConfig.targetGetter(sc);
            const scDlt = currentConfig.deltaGetter(sc);
            const rangeText =
              activeTab === 'dissolvedOxygen'
                ? sc === '100L'
                  ? '14.28–22.36%'
                  : sc === '5000L'
                  ? '16.29–23.03%'
                  : 'Livre'
                : scDlt !== null
                ? `${(scTgt - scDlt).toFixed(activeTab === 'pressure' ? 2 : 0)} a ${(scTgt + scDlt).toFixed(
                    activeTab === 'pressure' ? 2 : 0
                  )} ${currentConfig.unit}`
                : `${scTgt} ${currentConfig.unit}`;

            return (
              <div key={`legend-${sc}`} className="flex items-center gap-1.5 font-mono">
                <span
                  className="w-3 h-2.5 rounded-xs inline-block border"
                  style={{ backgroundColor: vCfg.fill, borderColor: vCfg.color }}
                />
                <span style={{ color: vCfg.textFill }} className="font-bold">
                  {sc}:
                </span>
                <span className="text-slate-300">{rangeText}</span>
              </div>
            );
          })}

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block ring-2 ring-rose-500/40"></span>
            <span className="text-rose-300 font-medium">Desvio (Fora de Spec)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
