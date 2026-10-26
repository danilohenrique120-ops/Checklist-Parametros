import React, { useState } from 'react';
import { ChecklistRecord, ScaleVolume } from '../types/bioreactor';
import { DO_REFERENCE_100L, DO_REFERENCE_5000L, SCALE_SPECS, getDOPhaseForHours } from '../constants/reactorConfig';
import { AlertTriangle, Info } from 'lucide-react';

interface InteractiveChartsProps {
  records: ChecklistRecord[];
  scale: ScaleVolume;
  selectedReactorId: number | 'all';
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

export const InteractiveCharts: React.FC<InteractiveChartsProps> = ({
  records,
  scale,
  selectedReactorId,
  onOpenDORefModal,
}) => {
  const [activeTab, setActiveTab] = useState<ParameterKey>('temperature');
  const [hoveredPoint, setHoveredPoint] = useState<{
    record: ChecklistRecord;
    x: number;
    y: number;
    param: ParameterKey;
  } | null>(null);

  // Sort records by processHours then timestamp
  const sortedRecords = [...records].sort((a, b) => a.processHours - b.processHours || a.timestamp - b.timestamp);

  const currentConfig = PARAM_CONFIGS[activeTab];
  const target = currentConfig.targetGetter(scale);
  const delta = currentConfig.deltaGetter(scale);
  const [domainMin, domainMax] = currentConfig.minMaxDomain(scale);

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

  // Process hours range (0h to 60h in steps of 2h)
  const maxHours = Math.max(60, ...sortedRecords.map((r) => Math.ceil((r.processHours || 10) / 2) * 2));
  const minHours = 0;

  // Generate 2-hour ticks: 0, 2, 4, 6, 8, ..., maxHours
  const twoHourTicks: number[] = [];
  for (let h = minHours; h <= maxHours; h += 2) {
    twoHourTicks.push(h);
  }

  // Helper to get the clock horario (HH:mm) for any 2-hour tick
  const getClockTimeForHour = (h: number): string => {
    const exactRec = sortedRecords.find((r) => Math.abs(r.processHours - h) < 0.25);
    if (exactRec) return exactRec.time;

    let baseHour = 6;
    let baseMin = 0;
    if (sortedRecords.length > 0) {
      const first = sortedRecords[0];
      const [hh, mm] = first.time.split(':').map(Number);
      if (!isNaN(hh)) {
        baseHour = (hh - Math.round(first.processHours) + 240) % 24;
        baseMin = mm || 0;
      }
    }
    const clockH = (baseHour + h) % 24;
    return `${String(clockH).padStart(2, '0')}:${String(baseMin).padStart(2, '0')}`;
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

  // Build path for points
  const points = sortedRecords.map((r) => {
    const val = currentConfig.valGetter(r);
    return {
      x: scaleX(r.processHours),
      y: scaleY(val),
      val,
      record: r,
    };
  });

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // References for DO Phases (100L and 5000L)
  const doPhases = scale === '100L' ? DO_REFERENCE_100L : scale === '5000L' ? DO_REFERENCE_5000L : null;

  // Build stepped/connected Max and Min limit lines for O2 across the 4 phases
  let doMaxLinePoints = '';
  let doMinLinePoints = '';
  let doBandPolygonPoints = '';

  if (doPhases && doPhases.length > 0) {
    const maxCoords: { x: number; y: number }[] = [];
    const minCoords: { x: number; y: number }[] = [];

    doPhases.forEach((phase) => {
      const x1 = scaleX(phase.minHours);
      const x2 = scaleX(phase.maxHours);
      const yMax = scaleY(Math.max(phase.o2ProbeMin, phase.o2ProbeMax));
      const yMin = scaleY(Math.min(phase.o2ProbeMin, phase.o2ProbeMax));

      maxCoords.push({ x: x1, y: yMax }, { x: x2, y: yMax });
      minCoords.push({ x: x1, y: yMin }, { x: x2, y: yMin });
    });

    doMaxLinePoints = maxCoords.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    doMinLinePoints = minCoords.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');

    const polygonCoords = [...maxCoords, ...[...minCoords].reverse()];
    doBandPolygonPoints = polygonCoords.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  }

  // Hover point DO phase lookup
  const hoveredDOPhase =
    hoveredPoint && activeTab === 'dissolvedOxygen'
      ? getDOPhaseForHours(scale, hoveredPoint.record.processHours)
      : null;

  return (
    <div className="bg-[#0F1624] border border-slate-800/90 rounded-xl p-5">
      {/* Top Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-100 tracking-tight">
              Monitoramento de Tendências & Tolerâncias (A cada 2 Horas)
            </h2>
            <span className="text-xs font-mono text-cyan-400">
              · Escala {scale} {selectedReactorId !== 'all' ? `· BR-${String(selectedReactorId).padStart(2, '0')}` : '· Todos'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhamento ponto a ponto de 2 em 2 horas com linhas de limites mínimo/máximo e média
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 p-1 bg-[#080C14] border border-slate-800 rounded-lg overflow-x-auto">
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

      {/* Target, Average & Delta Metric Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 bg-[#131C2E]/80 p-3.5 rounded-lg border border-slate-800 text-xs">
        <div>
          <span className="text-slate-400 block">Alvo (Setpoint)</span>
          <span className="text-sm font-bold font-mono text-slate-100">
            {activeTab === 'dissolvedOxygen'
              ? doPhases
                ? 'Curva 4 Fases'
                : 'Livre'
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
              ? doPhases
                ? 'Linhas Mín e Máx por Fase'
                : 'Sem limite'
              : delta !== null
              ? `± ${delta} ${currentConfig.unit}`
              : 'Sem delta (Fixo)'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Faixa Nominal</span>
          <span className="text-sm font-bold font-mono text-slate-100">
            {activeTab === 'dissolvedOxygen'
              ? scale === '100L'
                ? '14.28% a 22.36%'
                : scale === '5000L'
                ? '16.29% a 23.03%'
                : 'Registro Livre'
              : delta !== null
              ? `${(target - delta).toFixed(1)} a ${(target + delta).toFixed(1)} ${currentConfig.unit}`
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
      <div className="relative w-full overflow-x-auto pb-1">
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

          {/* DO Phase Columns + Min & Max Limit Lines for 100L or 5000L */}
          {activeTab === 'dissolvedOxygen' && doPhases && (
            <g>
              {/* Background Phase Columns */}
              {doPhases.map((phase, idx) => {
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
                    {/* Phase Header Label */}
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

                    {/* Phase Max value label directly above Max line segment */}
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

                    {/* Phase Min value label directly below Min line segment */}
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
                  </g>
                );
              })}

              {/* Shaded Corridor between Min and Max O2 Lines */}
              {doBandPolygonPoints && (
                <polygon points={doBandPolygonPoints} fill="url(#doTunnelGradientDark)" />
              )}

              {/* LINE 1: LIMITE MÁXIMO DE O2 (Teal Dashed Line) */}
              {doMaxLinePoints && (
                <polyline
                  fill="none"
                  stroke="#2DD4BF"
                  strokeWidth="2"
                  strokeDasharray="6,3"
                  points={doMaxLinePoints}
                />
              )}

              {/* LINE 2: LIMITE MÍNIMO DE O2 (Amber Dashed Line) */}
              {doMinLinePoints && (
                <polyline
                  fill="none"
                  stroke="#FBBF24"
                  strokeWidth="2"
                  strokeDasharray="6,3"
                  points={doMinLinePoints}
                />
              )}
            </g>
          )}

          {/* Tolerance Band (Delta) for non-DO parameters */}
          {activeTab !== 'dissolvedOxygen' && delta !== null && yUpper !== null && yLower !== null && (
            <g>
              <rect
                x={padding.left}
                y={yUpper}
                width={chartW}
                height={Math.abs(yLower - yUpper)}
                fill="url(#bandGradientDark)"
              />
              {/* Upper tolerance line */}
              <line
                x1={padding.left}
                y1={yUpper}
                x2={padding.left + chartW}
                y2={yUpper}
                stroke="#38BDF8"
                strokeWidth="1.2"
                strokeDasharray="4,4"
                strokeOpacity="0.65"
              />
              <text
                x={padding.left + chartW - 6}
                y={yUpper - 5}
                textAnchor="end"
                fontSize="9"
                fontWeight="600"
                fill="#38BDF8"
              >
                Limite Sup: {(target + delta).toFixed(1)} {currentConfig.unit}
              </text>

              {/* Lower tolerance line */}
              <line
                x1={padding.left}
                y1={yLower}
                x2={padding.left + chartW}
                y2={yLower}
                stroke="#38BDF8"
                strokeWidth="1.2"
                strokeDasharray="4,4"
                strokeOpacity="0.65"
              />
              <text
                x={padding.left + chartW - 6}
                y={yLower + 12}
                textAnchor="end"
                fontSize="9"
                fontWeight="600"
                fill="#38BDF8"
              >
                Limite Inf: {(target - delta).toFixed(1)} {currentConfig.unit}
              </text>
            </g>
          )}

          {/* Target Setpoint Line */}
          {activeTab !== 'dissolvedOxygen' && (
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
                Alvo (Setpoint): {target} {currentConfig.unit}
              </text>
            </g>
          )}

          {/* Average Value Line */}
          {avgValue !== null && yAvg !== null && (
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

          {/* Time Series Measured Line */}
          {points.length > 1 && (
            <polyline
              fill="none"
              stroke={currentConfig.color}
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
                  fill={isNominal ? currentConfig.color : '#F43F5E'}
                  stroke="#090D16"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {/* X-Axis (Every 2 Hours + Horários Ponto a Ponto) */}
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
            const hasPointAtHour = sortedRecords.some((r) => Math.abs(r.processHours - h) < 0.25);

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
                {/* Horário (HH:mm) */}
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
                {/* Horas de Processo (2h, 4h, 6h...) */}
                <text
                  x={x}
                  y={padding.top + chartH + 29}
                  textAnchor="middle"
                  fontSize="8"
                  fill={hasPointAtHour ? '#38BDF8' : '#475569'}
                  fontWeight={hasPointAtHour ? '600' : '400'}
                >
                  {h}h
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
            Horários Ponto a Ponto (A cada 2 horas · HH:mm / Tempo de Processo)
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

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute z-20 pointer-events-none bg-[#080C14]/95 text-slate-100 rounded-lg p-3 text-xs shadow-2xl border border-slate-700 w-64 transform -translate-x-1/2 -translate-y-full mb-3"
            style={{
              left: `${Math.min(88, Math.max(12, (hoveredPoint.x / svgWidth) * 100))}%`,
              top: `${(hoveredPoint.y / svgHeight) * 100}%`,
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5 font-mono">
              <span className="font-semibold text-slate-200">
                {hoveredPoint.record.reactorTag} · {hoveredPoint.record.processHours}h
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

              {activeTab === 'dissolvedOxygen' && hoveredDOPhase && (
                <div className="flex justify-between items-center text-slate-300 font-mono">
                  <span>Limites ({hoveredDOPhase.phase}):</span>
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
                  <span>Alvo / Delta:</span>
                  <span className="font-mono">
                    {target} {delta ? `(±${delta})` : '(Fixo)'} {currentConfig.unit}
                  </span>
                </div>
              )}

              {hoveredPoint.record.standardCurveO2 !== undefined && activeTab === 'dissolvedOxygen' && (
                <div className="flex justify-between items-center text-slate-400">
                  <span>Curva Padrão:</span>
                  <span className="font-mono text-cyan-400">{hoveredPoint.record.standardCurveO2}</span>
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
        )}
      </div>

      {/* Reference note for 500L & 3000L if DO is selected */}
      {activeTab === 'dissolvedOxygen' && (scale === '500L' || scale === '3000L') && (
        <div className="mt-3 p-3 bg-amber-950/40 border border-amber-700/60 rounded-lg text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Observação técnica:</strong> Conforme diretriz de processo, as escalas de <strong>500L</strong> e{' '}
            <strong>3000L</strong> não possuem faixas de referência tabeladas para oxigênio dissolvido.
          </span>
        </div>
      )}

      {/* Bottom Summary Indicators */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          {activeTab === 'dissolvedOxygen' && doPhases ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-teal-400 border-b border-dashed border-teal-400 inline-block"></span>
                <span className="font-medium text-teal-300">Linha Limite Máximo (Tabela O2)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-400 border-b border-dashed border-amber-400 inline-block"></span>
                <span className="font-medium text-amber-300">Linha Limite Mínimo (Tabela O2)</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-slate-200 inline-block"></span>
              <span>Linha de Alvo (Setpoint)</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-purple-400 border-b border-dashed border-purple-400 inline-block"></span>
            <span className="text-purple-300">Média do Parâmetro</span>
          </div>
          {activeTab !== 'dissolvedOxygen' && delta !== null && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 bg-sky-500/20 border border-sky-400 border-dashed inline-block"></span>
              <span>Faixa de Tolerância (± Delta)</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span>
            <span>Leitura Nominal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block ring-2 ring-rose-500/40"></span>
            <span>Desvio (Fora de Spec)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
