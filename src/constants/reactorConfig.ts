import { DOPhaseReference, ReactorMetadata, ScaleParametersSpec, ScaleVolume, SemaphoreLevel } from '../types/bioreactor';

export const REACTORS: ReactorMetadata[] = [
  // 100L (1 ao 5)
  { id: 1, tag: 'BR-01', name: 'Biorreator 01', scale: '100L', status: 'active', currentBatch: 'L-100-24A' },
  { id: 2, tag: 'BR-02', name: 'Biorreator 02', scale: '100L', status: 'active', currentBatch: 'L-100-24B' },
  { id: 3, tag: 'BR-03', name: 'Biorreator 03', scale: '100L', status: 'active', currentBatch: 'L-100-24C' },
  { id: 4, tag: 'BR-04', name: 'Biorreator 04', scale: '100L', status: 'idle' },
  { id: 5, tag: 'BR-05', name: 'Biorreator 05', scale: '100L', status: 'active', currentBatch: 'L-100-24D' },

  // 500L (6 ao 10)
  { id: 6, tag: 'BR-06', name: 'Biorreator 06', scale: '500L', status: 'active', currentBatch: 'L-500-18A' },
  { id: 7, tag: 'BR-07', name: 'Biorreator 07', scale: '500L', status: 'cip' },
  { id: 8, tag: 'BR-08', name: 'Biorreator 08', scale: '500L', status: 'active', currentBatch: 'L-500-18B' },
  { id: 9, tag: 'BR-09', name: 'Biorreator 09', scale: '500L', status: 'active', currentBatch: 'L-500-18C' },
  { id: 10, tag: 'BR-10', name: 'Biorreator 10', scale: '500L', status: 'idle' },

  // 5000L (11 ao 14)
  { id: 11, tag: 'BR-11', name: 'Biorreator 11', scale: '5000L', status: 'active', currentBatch: 'L-5K-09A' },
  { id: 12, tag: 'BR-12', name: 'Biorreator 12', scale: '5000L', status: 'active', currentBatch: 'L-5K-09B' },
  { id: 13, tag: 'BR-13', name: 'Biorreator 13', scale: '5000L', status: 'active', currentBatch: 'L-5K-09C' },
  { id: 14, tag: 'BR-14', name: 'Biorreator 14', scale: '5000L', status: 'maintenance' },

  // 3000L (15 e 16)
  { id: 15, tag: 'BR-15', name: 'Biorreator 15', scale: '3000L', status: 'active', currentBatch: 'L-3K-12A' },
  { id: 16, tag: 'BR-16', name: 'Biorreator 16', scale: '3000L', status: 'active', currentBatch: 'L-3K-12B' },
];

export const DO_REFERENCE_100L: DOPhaseReference[] = [
  {
    phase: 'Inicial',
    intervalHours: '2-14 h',
    minHours: 2,
    maxHours: 14,
    o2ProbeMin: 21.92,
    o2ProbeMax: 22.36,
    standardCurveMin: 0.222,
    standardCurveMax: 0.258,
  },
  {
    phase: 'Aceleração',
    intervalHours: '16-32 h',
    minHours: 16,
    maxHours: 32,
    o2ProbeMin: 20.00,
    o2ProbeMax: 21.69,
    standardCurveMin: 0.293,
    standardCurveMax: 0.896,
  },
  {
    phase: 'Maior demanda',
    intervalHours: '34-48 h',
    minHours: 34,
    maxHours: 48,
    o2ProbeMin: 14.28,
    o2ProbeMax: 19.51,
    standardCurveMin: 1.034,
    standardCurveMax: 2.845,
  },
  {
    phase: 'Recuperação',
    intervalHours: '50-58 h',
    minHours: 50,
    maxHours: 58,
    o2ProbeMin: 14.57,
    o2ProbeMax: 17.01,
    standardCurveMin: 3.164,
    standardCurveMax: 4.509,
  },
];

export const DO_REFERENCE_5000L: DOPhaseReference[] = [
  {
    phase: 'Inicial',
    intervalHours: '2-14 h',
    minHours: 2,
    maxHours: 14,
    o2ProbeMin: 21.27,
    o2ProbeMax: 23.03,
    standardCurveMin: 0.227,
    standardCurveMax: 0.347,
  },
  {
    phase: 'Aceleração',
    intervalHours: '16-32 h',
    minHours: 16,
    maxHours: 32,
    o2ProbeMin: 17.08,
    o2ProbeMax: 20.92,
    standardCurveMin: 0.395,
    standardCurveMax: 1.400,
  },
  {
    phase: 'Maior demanda',
    intervalHours: '34-48 h',
    minHours: 34,
    maxHours: 48,
    o2ProbeMin: 16.29,
    o2ProbeMax: 17.49,
    standardCurveMin: 1.626,
    standardCurveMax: 3.651,
  },
  {
    phase: 'Trecho final avaliado',
    intervalHours: '50-58 h',
    minHours: 50,
    maxHours: 58,
    o2ProbeMin: 16.52,
    o2ProbeMax: 17.45,
    standardCurveMin: 3.958,
    standardCurveMax: 5.094,
  },
];

export const SCALE_SPECS: Record<ScaleVolume, ScaleParametersSpec> = {
  '100L': {
    temperature: { name: 'Temperatura', unit: '°C', target: 30.0, delta: 2.0, min: 28.0, max: 32.0 },
    pressure: { name: 'Pressão', unit: 'bar', target: 0.1, delta: 0.05, min: 0.05, max: 0.15 },
    agitation: { name: 'Agitação', unit: 'RPM', target: 95, delta: null, min: 95, max: 95 },
    airflow: { name: 'Vazão de Ar', unit: 'L/min', target: 85, delta: 10, min: 75, max: 95 },
    dissolvedOxygenNotes: 'Possui curva padrão de referência em 4 fases (2-58 h)',
    doPhases: DO_REFERENCE_100L,
  },
  '500L': {
    temperature: { name: 'Temperatura', unit: '°C', target: 30.0, delta: 2.0, min: 28.0, max: 32.0 },
    pressure: { name: 'Pressão', unit: 'bar', target: 0.2, delta: 0.05, min: 0.15, max: 0.25 },
    agitation: { name: 'Agitação', unit: 'RPM', target: 117, delta: null, min: 117, max: 117 },
    airflow: { name: 'Vazão de Ar', unit: 'L/min', target: 220, delta: 10, min: 210, max: 230 },
    dissolvedOxygenNotes: 'Sem faixa de O2 definida para 500L (registro livre)',
  },
  '3000L': {
    temperature: { name: 'Temperatura', unit: '°C', target: 30.0, delta: 2.0, min: 28.0, max: 32.0 },
    pressure: { name: 'Pressão', unit: 'bar', target: 0.3, delta: 0.05, min: 0.25, max: 0.35 },
    agitation: { name: 'Agitação', unit: 'RPM', target: 200, delta: null, min: 200, max: 200 },
    airflow: { name: 'Vazão de Ar', unit: 'L/min', target: 800, delta: 10, min: 790, max: 810 },
    dissolvedOxygenNotes: 'Sem faixa de O2 definida para 3000L (registro livre)',
  },
  '5000L': {
    temperature: { name: 'Temperatura', unit: '°C', target: 30.0, delta: 2.0, min: 28.0, max: 32.0 },
    pressure: { name: 'Pressão', unit: 'bar', target: 0.5, delta: 0.05, min: 0.45, max: 0.55 },
    agitation: { name: 'Agitação', unit: 'RPM', target: 200, delta: null, min: 200, max: 200 },
    airflow: { name: 'Vazão de Ar', unit: 'L/min', target: 800, delta: 10, min: 790, max: 810 },
    dissolvedOxygenNotes: 'Possui curva padrão de referência em 4 fases (2-58 h)',
    doPhases: DO_REFERENCE_5000L,
  },
};

export function getReactorById(id: number): ReactorMetadata | undefined {
  return REACTORS.find((r) => r.id === id);
}

export function getScaleByReactorId(reactorId: number): ScaleVolume {
  if (reactorId >= 1 && reactorId <= 5) return '100L';
  if (reactorId >= 6 && reactorId <= 10) return '500L';
  if (reactorId >= 11 && reactorId <= 14) return '5000L';
  if (reactorId >= 15 && reactorId <= 16) return '3000L';
  return '100L';
}

export function getDOPhaseForHours(scale: ScaleVolume, processHours: number): DOPhaseReference | null {
  const specs = SCALE_SPECS[scale];
  if (!specs.doPhases) return null;
  // Find exact interval or closest phase if in transition hour (e.g., 15h, 33h, 49h)
  const exact = specs.doPhases.find((p) => processHours >= p.minHours && processHours <= p.maxHours);
  if (exact) return exact;
  if (processHours > 0 && processHours < 16) return specs.doPhases[0];
  if (processHours >= 15 && processHours < 34) return specs.doPhases[1];
  if (processHours >= 33 && processHours < 50) return specs.doPhases[2];
  if (processHours >= 49 && processHours <= 64) return specs.doPhases[3];
  return null;
}

/**
 * Evaluates a value against [min, max] and returns a 3-tier SemaphoreLevel:
 * - 'critical' (Red): out of [min, max]
 * - 'warning' (Amber): inside [min, max], but within 15% of either boundary
 * - 'nominal' (Green): comfortably within [min, max]
 */
export function evaluateRangeSemaphore(val: number, min: number, max: number): SemaphoreLevel {
  if (val < min || val > max) return 'critical';
  const span = max - min;
  if (span <= 0) {
    return Math.abs(val - min) <= 0.01 ? 'nominal' : 'critical';
  }
  const margin = span * 0.15;
  if (val < min + margin || val > max - margin) {
    return 'warning';
  }
  return 'nominal';
}

export function validateChecklistValues(
  scale: ScaleVolume,
  values: {
    temperature: number;
    dissolvedOxygen: number;
    noDOProbe?: boolean;
    standardCurveO2?: number;
    agitation: number;
    pressure: number;
    airflow: number;
    processHours?: number;
  }
) {
  const specs = SCALE_SPECS[scale];

  // Temperature: Target 30C, delta +/- 2C -> [28, 32]
  const tempMin = specs.temperature.min ?? 28;
  const tempMax = specs.temperature.max ?? 32;
  const tempSemaphore = evaluateRangeSemaphore(values.temperature, tempMin, tempMax);
  const isTempNominal = tempSemaphore !== 'critical';

  // Pressure: Target, delta +/- 0.05 bar
  const presMin = specs.pressure.min ?? 0;
  const presMax = specs.pressure.max ?? 1;
  const presSemaphore = evaluateRangeSemaphore(values.pressure, presMin, presMax);
  const isPresNominal = presSemaphore !== 'critical';

  // Agitation: Exact target (no delta)
  const isAgitNominal = Math.abs(values.agitation - specs.agitation.target) <= 0.01;
  const agitSemaphore: SemaphoreLevel = isAgitNominal ? 'nominal' : 'critical';

  // Airflow: Target, delta +/- 10 L/min
  const airMin = specs.airflow.min ?? 0;
  const airMax = specs.airflow.max ?? 1000;
  const airSemaphore = evaluateRangeSemaphore(values.airflow, airMin, airMax);
  const isAirNominal = airSemaphore !== 'critical';

  // Dissolved Oxygen: if noDOProbe is checked, exempt from deviation; otherwise if 100L or 5000L, check phase range
  let isDONominal = true;
  let doSemaphore: SemaphoreLevel = 'free';
  let curveSemaphore: SemaphoreLevel = 'free';
  let doMessage: string | null = null;

  if (!values.noDOProbe && (scale === '100L' || scale === '5000L')) {
    const phase = getDOPhaseForHours(scale, values.processHours ?? 24);
    if (phase) {
      const minO2 = Math.min(phase.o2ProbeMin, phase.o2ProbeMax);
      const maxO2 = Math.max(phase.o2ProbeMin, phase.o2ProbeMax);
      doSemaphore = evaluateRangeSemaphore(values.dissolvedOxygen, minO2, maxO2);
      if (doSemaphore === 'critical') {
        isDONominal = false;
        doMessage = `O2 Sonda (${values.dissolvedOxygen}%) fora da Fase "${phase.phase}" (${minO2.toFixed(2)}% a ${maxO2.toFixed(2)}%)`;
      }

      if (values.standardCurveO2 !== undefined && !isNaN(values.standardCurveO2)) {
        curveSemaphore = evaluateRangeSemaphore(
          values.standardCurveO2,
          phase.standardCurveMin,
          phase.standardCurveMax
        );
        if (curveSemaphore === 'critical') {
          isDONominal = false;
          const curveMsg = `Curva Padrão O2 (${values.standardCurveO2}) fora da Fase "${phase.phase}" (${phase.standardCurveMin.toFixed(3)} a ${phase.standardCurveMax.toFixed(3)})`;
          doMessage = doMessage ? `${doMessage}; ${curveMsg}` : curveMsg;
        }
      }
    }
  }

  const deviations: string[] = [];
  if (!isTempNominal) {
    deviations.push(`Temperatura fora da faixa (${values.temperature}°C vs ${tempMin.toFixed(1)}°C a ${tempMax.toFixed(1)}°C)`);
  }
  if (!isPresNominal) {
    deviations.push(
      `Pressão fora da faixa (${values.pressure} bar vs ${presMin.toFixed(2)} a ${presMax.toFixed(2)} bar)`
    );
  }
  if (!isAgitNominal) {
    deviations.push(`Agitação fora do alvo fixo (${values.agitation} RPM vs ${specs.agitation.target} RPM)`);
  }
  if (!isAirNominal) {
    deviations.push(
      `Vazão de ar fora da faixa (${values.airflow} L/min vs ${airMin} a ${airMax} L/min)`
    );
  }
  if (!isDONominal && doMessage) {
    deviations.push(doMessage);
  }

  const warnings: string[] = [];
  if (tempSemaphore === 'warning') {
    warnings.push(`Temperatura próxima do limite (${values.temperature}°C · Limite: ${tempMin}–${tempMax}°C)`);
  }
  if (presSemaphore === 'warning') {
    warnings.push(`Pressão próxima do limite (${values.pressure} bar · Limite: ${presMin.toFixed(2)}–${presMax.toFixed(2)} bar)`);
  }
  if (airSemaphore === 'warning') {
    warnings.push(`Vazão próxima do limite (${values.airflow} L/min · Limite: ${airMin}–${airMax} L/min)`);
  }
  if (doSemaphore === 'warning') {
    warnings.push(`O2 Sonda próximo do limite da fase (${values.dissolvedOxygen}%)`);
  }

  const isFullyNominal = deviations.length === 0;

  return {
    isTemperatureNominal: isTempNominal,
    isPressureNominal: isPresNominal,
    isAgitationNominal: isAgitNominal,
    isAirflowNominal: isAirNominal,
    isDONominal,
    isFullyNominal,
    tempSemaphore,
    presSemaphore,
    agitSemaphore,
    airSemaphore,
    doSemaphore,
    curveSemaphore,
    deviationsCount: deviations.length,
    deviations,
    warningsCount: warnings.length,
    warnings,
  };
}
