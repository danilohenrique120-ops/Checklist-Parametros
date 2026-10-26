import React from 'react';
import { ChecklistRecord, ScaleVolume } from '../types/bioreactor';
import { SCALE_SPECS } from '../constants/reactorConfig';
import { Thermometer, Gauge, RotateCw, Wind, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ParameterAveragesPanelProps {
  records: ChecklistRecord[];
  scale: ScaleVolume;
  selectedReactorId: number | 'all';
}

export const ParameterAveragesPanel: React.FC<ParameterAveragesPanelProps> = ({
  records,
  scale,
  selectedReactorId,
}) => {
  const specs = SCALE_SPECS[scale];
  const count = records.length;

  const calcStats = (values: number[]) => {
    if (values.length === 0) return { avg: 0, min: 0, max: 0 };
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { avg, min, max };
  };

  const tempStats = calcStats(records.map((r) => r.temperature));
  const doStats = calcStats(records.map((r) => r.dissolvedOxygen));
  const agitStats = calcStats(records.map((r) => r.agitation));
  const pressStats = calcStats(records.map((r) => r.pressure));
  const airStats = calcStats(records.map((r) => r.airflow));

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
      targetLabel: '30.0 °C',
      deltaLabel: '± 2.0 °C (28.0 a 32.0 °C)',
      isNominal: count === 0 || (tempStats.avg >= 28.0 && tempStats.avg <= 32.0),
      diffFromTarget: count > 0 ? tempStats.avg - 30.0 : 0,
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
      targetLabel: scale === '100L' || scale === '5000L' ? 'Curva 4 Fases' : 'Monitoramento Livre',
      deltaLabel:
        scale === '100L'
          ? '14.28% a 22.36% (Fases 2-58h)'
          : scale === '5000L'
          ? '16.29% a 23.03% (Fases 2-58h)'
          : 'Sem curva padrão definida',
      isNominal: true,
      diffFromTarget: null,
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
      targetLabel: `${specs.agitation.target} RPM`,
      deltaLabel: 'Sem delta (Alvo fixo)',
      isNominal: count === 0 || Math.abs(agitStats.avg - specs.agitation.target) <= 0.5,
      diffFromTarget: count > 0 ? agitStats.avg - specs.agitation.target : 0,
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
      targetLabel: `${specs.pressure.target.toFixed(2)} bar`,
      deltaLabel: `± 0.05 bar (${(specs.pressure.min ?? 0).toFixed(2)} a ${(specs.pressure.max ?? 0).toFixed(2)} bar)`,
      isNominal:
        count === 0 ||
        (pressStats.avg >= (specs.pressure.min ?? 0) && pressStats.avg <= (specs.pressure.max ?? 1)),
      diffFromTarget: count > 0 ? pressStats.avg - specs.pressure.target : 0,
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
      targetLabel: `${specs.airflow.target} L/min`,
      deltaLabel: `± 10 L/min (${specs.airflow.min} a ${specs.airflow.max} L/min)`,
      isNominal:
        count === 0 ||
        (airStats.avg >= (specs.airflow.min ?? 0) && airStats.avg <= (specs.airflow.max ?? 1000)),
      diffFromTarget: count > 0 ? airStats.avg - specs.airflow.target : 0,
    },
  ];

  return (
    <div className="bg-[#0F1624] border border-slate-800/90 rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-100 tracking-tight">
              Média de Cada Parâmetro Monitorado
            </h2>
            <span className="text-xs font-mono text-cyan-400">
              · {selectedReactorId === 'all' ? `Consolidado (${scale})` : `BR-${String(selectedReactorId).padStart(2, '0')} (${scale})`}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Consolidação estatística (Média, Mínimo, Máximo e Delta frente ao Alvo) baseada em {count}{' '}
            {count === 1 ? 'leitura registrada' : 'leituras registradas'}
          </p>
        </div>
      </div>

      {count === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Nenhuma leitura registrada para calcular a média deste biorreator.
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
                    <span className="text-[11px] text-slate-400 block">Média Calculada</span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-2xl font-bold font-mono text-slate-50 tabular-nums">
                        {param.avg.toFixed(param.decimals)}
                      </span>
                      <span className="text-xs font-mono uppercase text-slate-400">{param.unit}</span>
                    </div>
                  </div>

                  {/* Delta from Target */}
                  {param.diffFromTarget !== null && (
                    <div className="text-[11px] font-mono mt-1">
                      <span className="text-slate-400">Desvio médio: </span>
                      <span
                        className={`font-semibold ${
                          Math.abs(param.diffFromTarget) < 0.01
                            ? 'text-emerald-400'
                            : param.isNominal
                            ? 'text-cyan-300'
                            : 'text-rose-400'
                        }`}
                      >
                        {param.diffFromTarget >= 0 ? `+${param.diffFromTarget.toFixed(param.decimals)}` : param.diffFromTarget.toFixed(param.decimals)}{' '}
                        {param.unit}
                      </span>
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
                  <div className="flex justify-between text-slate-400">
                    <span>Alvo:</span>
                    <span className="text-slate-300">{param.targetLabel}</span>
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
