import React, { useState } from 'react';
import { ChecklistRecord, ScaleVolume } from '../types/bioreactor';
import { SCALE_SPECS } from '../constants/reactorConfig';
import { Thermometer, Gauge, RotateCw, Wind, Activity, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';

interface ParameterAveragesPanelProps {
  records: ChecklistRecord[];
  scale: ScaleVolume;
  selectedReactorId: number | 'all';
}

const ALL_SCALES: ScaleVolume[] = ['100L', '500L', '3000L', '5000L'];

export const ParameterAveragesPanel: React.FC<ParameterAveragesPanelProps> = ({
  records,
  scale,
  selectedReactorId,
}) => {
  const [selectedScaleTab, setSelectedScaleTab] = useState<ScaleVolume>(scale || '100L');

  React.useEffect(() => {
    if (scale) {
      setSelectedScaleTab(scale);
    }
  }, [scale]);

  // Se um biorreator específico está selecionado no filtro global, usamos a escala dele;
  // caso contrário, filtramos pela escala selecionada nas abas (100L, 500L, 3000L ou 5000L).
  const isGlobalAll = selectedReactorId === 'all';
  const effectiveScaleMode: ScaleVolume = isGlobalAll ? selectedScaleTab : scale;

  const filteredRecords = records.filter((r) => r.scale === effectiveScaleMode);

  const activeSingleScale: ScaleVolume = effectiveScaleMode;
  const specs = SCALE_SPECS[activeSingleScale];
  const count = filteredRecords.length;
  const isMultiScale = false;

  const calcStats = (values: number[]) => {
    if (values.length === 0) return { avg: 0, min: 0, max: 0 };
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { avg, min, max };
  };

  const tempStats = calcStats(filteredRecords.map((r) => r.temperature));
  const doStats = calcStats(filteredRecords.filter((r) => !r.noDOProbe).map((r) => r.dissolvedOxygen));
  const agitStats = calcStats(filteredRecords.map((r) => r.agitation));
  const pressStats = calcStats(filteredRecords.map((r) => r.pressure));
  const airStats = calcStats(filteredRecords.map((r) => r.airflow));

  // Calcula o desvio médio normalizado em relação ao alvo da própria escala de cada registro
  const calcNormalizedDiff = (
    getter: (r: ChecklistRecord) => number,
    targetGetter: (s: ScaleVolume) => number
  ): number => {
    if (filteredRecords.length === 0) return 0;
    const totalDiff = filteredRecords.reduce(
      (acc, r) => acc + (getter(r) - targetGetter(r.scale)),
      0
    );
    return totalDiff / filteredRecords.length;
  };

  const agitNormDiff = calcNormalizedDiff((r) => r.agitation, (s) => SCALE_SPECS[s].agitation.target);
  const pressNormDiff = calcNormalizedDiff((r) => r.pressure, (s) => SCALE_SPECS[s].pressure.target);
  const airNormDiff = calcNormalizedDiff((r) => r.airflow, (s) => SCALE_SPECS[s].airflow.target);

  // Médias estratificadas por escala para exibição quando em modo Multi-Escala
  const getScaleBreakdown = (
    getter: (r: ChecklistRecord) => number,
    targetGetter: (s: ScaleVolume) => string,
    decimals: number
  ) => {
    return ALL_SCALES.map((s) => {
      const recs = filteredRecords.filter((r) => r.scale === s);
      if (recs.length === 0) return null;
      const avg = recs.reduce((acc, r) => acc + getter(r), 0) / recs.length;
      return {
        scale: s,
        count: recs.length,
        avgFormatted: avg.toFixed(decimals),
        targetText: targetGetter(s),
      };
    }).filter(Boolean) as {
      scale: ScaleVolume;
      count: number;
      avgFormatted: string;
      targetText: string;
    }[];
  };

  const parameters = [
    {
      key: 'temperature',
      name: 'Temperatura',
      unit: '°C',
      icon: Thermometer,
      avg: tempStats.avg,
      min: tempStats.min,
      max: tempStats.max,
      decimals: 2,
      targetLabel: '30.0 °C (Universal)',
      deltaLabel: '± 2.0 °C (28.0 a 32.0 °C)',
      isNominal: count === 0 || (tempStats.avg >= 28.0 && tempStats.avg <= 32.0),
      diffFromTarget: count > 0 ? tempStats.avg - 30.0 : 0,
      scaleBreakdown: null,
    },
    {
      key: 'dissolvedOxygen',
      name: 'Oxigênio Dissolvido',
      unit: '% O2',
      icon: Activity,
      avg: doStats.avg,
      min: doStats.min,
      max: doStats.max,
      decimals: 2,
      targetLabel:
        activeSingleScale === '100L' || activeSingleScale === '5000L'
          ? 'Curva 4 Fases'
          : 'Monitoramento Livre',
      deltaLabel:
        activeSingleScale === '100L'
          ? '14.28% a 22.36% (Fases 2-58h)'
          : activeSingleScale === '5000L'
          ? '16.29% a 23.03% (Fases 2-58h)'
          : 'Sem curva padrão definida',
      isNominal:
        count === 0 || filteredRecords.every((r) => r.isDONominal),
      diffFromTarget: null,
      scaleBreakdown: isMultiScale
        ? getScaleBreakdown(
            (r) => r.dissolvedOxygen,
            (s) => (s === '100L' || s === '5000L' ? 'Curva 4 Fases' : 'Livre'),
            2
          )
        : null,
    },
    {
      key: 'agitation',
      name: 'Agitação',
      unit: 'RPM',
      icon: RotateCw,
      avg: agitStats.avg,
      min: agitStats.min,
      max: agitStats.max,
      decimals: 1,
      targetLabel: isMultiScale
        ? '100L:150 · 500/5000L:80 · 3000L:35'
        : `${specs.agitation.target} RPM`,
      deltaLabel: isMultiScale
        ? 'Alvo fixo conforme a escala do tanque'
        : 'Sem delta (Alvo fixo)',
      isNominal:
        count === 0 ||
        (isMultiScale
          ? Math.abs(agitNormDiff) <= 0.5
          : Math.abs(agitStats.avg - specs.agitation.target) <= 0.5),
      diffFromTarget: count > 0 ? agitNormDiff : 0,
      scaleBreakdown: isMultiScale
        ? getScaleBreakdown(
            (r) => r.agitation,
            (s) => `Alvo ${SCALE_SPECS[s].agitation.target}`,
            1
          )
        : null,
    },
    {
      key: 'pressure',
      name: 'Pressão',
      unit: 'bar',
      icon: Gauge,
      avg: pressStats.avg,
      min: pressStats.min,
      max: pressStats.max,
      decimals: 2,
      targetLabel: isMultiScale
        ? '100L:0.30 · 500L:0.50 · 3000L:0.40 · 5000L:0.25'
        : `${specs.pressure.target.toFixed(2)} bar`,
      deltaLabel: isMultiScale
        ? '± 0.05 bar sobre o alvo de cada escala'
        : `± 0.05 bar (${(specs.pressure.min ?? 0).toFixed(2)} a ${(specs.pressure.max ?? 0).toFixed(2)} bar)`,
      isNominal:
        count === 0 ||
        (isMultiScale
          ? Math.abs(pressNormDiff) <= 0.05
          : pressStats.avg >= (specs.pressure.min ?? 0) &&
            pressStats.avg <= (specs.pressure.max ?? 1)),
      diffFromTarget: count > 0 ? pressNormDiff : 0,
      scaleBreakdown: isMultiScale
        ? getScaleBreakdown(
            (r) => r.pressure,
            (s) => `Alvo ${SCALE_SPECS[s].pressure.target.toFixed(2)}`,
            2
          )
        : null,
    },
    {
      key: 'airflow',
      name: 'Vazão de Ar',
      unit: 'L/min',
      icon: Wind,
      avg: airStats.avg,
      min: airStats.min,
      max: airStats.max,
      decimals: 1,
      targetLabel: isMultiScale
        ? '100L:100 · 500L:175 · 3000L:300 · 5000L:600'
        : `${specs.airflow.target} L/min`,
      deltaLabel: isMultiScale
        ? '± 10 L/min sobre o alvo de cada escala'
        : `± 10 L/min (${specs.airflow.min} a ${specs.airflow.max} L/min)`,
      isNominal:
        count === 0 ||
        (isMultiScale
          ? Math.abs(airNormDiff) <= 10
          : airStats.avg >= (specs.airflow.min ?? 0) &&
            airStats.avg <= (specs.airflow.max ?? 1000)),
      diffFromTarget: count > 0 ? airNormDiff : 0,
      scaleBreakdown: isMultiScale
        ? getScaleBreakdown(
            (r) => r.airflow,
            (s) => `Alvo ${SCALE_SPECS[s].airflow.target}`,
            1
          )
        : null,
    },
  ];

  return (
    <div className="bg-[#0F1624] border border-slate-800/90 rounded-xl p-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-slate-100 tracking-tight">
              Média de Cada Parâmetro Monitorado
            </h2>
            <span className="text-xs font-mono text-cyan-400">
              ·{' '}
              {selectedReactorId === 'all'
                ? `Escala ${effectiveScaleMode}`
                : `BR-${String(selectedReactorId).padStart(2, '0')} (${scale})`}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Consolidação estatística (Média, Mínimo, Máximo e Desvio frente ao Alvo de cada escala) baseada em {count}{' '}
            {count === 1 ? 'leitura registrada' : 'leituras registradas'}
          </p>
        </div>

        {/* Seletor rápido de Escala quando "Todos os Biorreatores" está ativo */}
        {isGlobalAll && (
          <div className="flex items-center gap-1 p-1 bg-[#080C14] border border-slate-800 rounded-lg self-start overflow-x-auto">
            <span className="text-[11px] text-slate-400 px-2 flex items-center gap-1 whitespace-nowrap">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Escala:
            </span>
            {ALL_SCALES.map((s) => {
              const cnt = records.filter((r) => r.scale === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setSelectedScaleTab(s)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap ${
                    selectedScaleTab === s
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s} ({cnt})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {count === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Nenhuma leitura registrada para calcular a média nesta seleção de escala/biorreator.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {parameters.map((param) => {
            const Icon = param.icon;
            return (
              <div
                key={param.key}
                className={`rounded-lg p-4 border transition-colors flex flex-col justify-between ${
                  param.isNominal
                    ? 'bg-[#131C2E]/90 border-slate-800 hover:border-slate-700'
                    : 'bg-rose-950/30 border-rose-500/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="font-semibold text-slate-200">{param.name}</span>
                    <Icon className="w-4 h-4 text-cyan-400/80 shrink-0" />
                  </div>

                  {/* Primary Average Readout */}
                  <div className="my-1">
                    <span className="text-[11px] text-slate-400 block">
                      {param.scaleBreakdown ? 'Média Geral (Multi-Escala)' : 'Média Calculada'}
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-2xl font-bold font-mono text-slate-50 tabular-nums">
                        {param.avg.toFixed(param.decimals)}
                      </span>
                      <span className="text-xs font-mono uppercase text-slate-400">{param.unit}</span>
                    </div>
                  </div>

                  {/* Delta from Target (Normalizado por escala quando multi-escala) */}
                  {param.diffFromTarget !== null && (
                    <div className="text-[11px] font-mono mt-1">
                      <span className="text-slate-400">
                        {param.scaleBreakdown ? 'Desvio médio vs. Alvo: ' : 'Desvio médio: '}
                      </span>
                      <span
                        className={`font-semibold ${
                          Math.abs(param.diffFromTarget) < 0.01
                            ? 'text-emerald-400'
                            : param.isNominal
                            ? 'text-cyan-300'
                            : 'text-rose-400'
                        }`}
                      >
                        {param.diffFromTarget >= 0
                          ? `+${param.diffFromTarget.toFixed(param.decimals)}`
                          : param.diffFromTarget.toFixed(param.decimals)}{' '}
                        {param.unit}
                      </span>
                    </div>
                  )}

                  {/* Estratificação por Escala quando "Todas" está selecionado */}
                  {param.scaleBreakdown && param.scaleBreakdown.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90 block">
                        Média por Escala:
                      </span>
                      {param.scaleBreakdown.map((item) => (
                        <div
                          key={item.scale}
                          className="flex items-center justify-between text-[10px] font-mono bg-[#080C14]/70 px-2 py-0.5 rounded border border-slate-800/70"
                        >
                          <span className="text-slate-300 font-semibold">{item.scale}:</span>
                          <span className="text-slate-100 font-bold">
                            {item.avgFormatted} {param.unit}
                          </span>
                          <span className="text-slate-500">({item.targetText})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Min / Max & Spec Footer */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/90 space-y-1 text-[11px] font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Mín / Máx:</span>
                    <span className="font-semibold text-slate-200">
                      {param.min.toFixed(param.decimals)} / {param.max.toFixed(param.decimals)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 gap-2">
                    <span className="shrink-0">Alvo:</span>
                    <span className="text-slate-300 truncate text-right" title={param.targetLabel}>
                      {param.targetLabel}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans truncate" title={param.deltaLabel}>
                    {param.deltaLabel}
                  </div>
                  <div className="pt-1 flex items-center gap-1 font-sans font-semibold">
                    {param.isNominal ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Média Nominal
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        Média Fora de Spec
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
