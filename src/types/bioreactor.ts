export type ScaleVolume = '100L' | '500L' | '3000L' | '5000L';

export type SemaphoreLevel = 'nominal' | 'warning' | 'critical' | 'free';

export interface ReactorMetadata {
  id: number;
  name: string;
  tag: string; // e.g., "BR-01"
  scale: ScaleVolume;
  status: 'active' | 'maintenance' | 'cip' | 'idle';
  currentBatch?: string;
  batchStartHours?: number;
}

export interface DOPhaseReference {
  phase: string;
  intervalHours: string;
  minHours: number;
  maxHours: number;
  o2ProbeMin: number;
  o2ProbeMax: number;
  standardCurveMin: number;
  standardCurveMax: number;
}

export interface ParameterSpec {
  name: string;
  unit: string;
  target: number;
  delta: number | null; // null if no delta
  min: number | null;
  max: number | null;
}

export interface ScaleParametersSpec {
  temperature: ParameterSpec; // Target 30C, delta +/- 2C
  pressure: ParameterSpec;    // Target varies by scale, delta +/- 0.5 bar
  agitation: ParameterSpec;   // Target varies by scale, no delta
  airflow: ParameterSpec;     // Target varies by scale, delta +/- 10 L/min
  dissolvedOxygenNotes?: string;
  doPhases?: DOPhaseReference[];
}

export interface ChecklistRecord {
  id: string;
  reactorId: number;
  reactorTag: string;
  scale: ScaleVolume;
  batchId: string;
  operatorName: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  timestamp: number;  // unix ms
  processHours: number; // e.g., 24.5 h
  archived?: boolean; // Whether the batch/record is archived in completed batches
  
  // Measured values
  temperature: number;      // °C
  dissolvedOxygen: number;  // % O2 probe
  standardCurveO2?: number; // optional standard curve
  agitation: number;        // RPM
  pressure: number;         // bar
  airflow: number;          // L/min
  
  // Validation flags
  isTemperatureNominal: boolean;
  isPressureNominal: boolean;
  isAgitationNominal: boolean;
  isAirflowNominal: boolean;
  isDONominal: boolean;
  isFullyNominal: boolean;
  
  // Quality & Notes
  deviationsCount: number;
  deviationNotes?: string;
  operatorSignature?: string;
  notes?: string;
}

export interface FilterOptions {
  reactorId: number | 'all';
  scale: ScaleVolume | 'all';
  operator: string;
  search: string;
  onlyDeviations: boolean;
  startDate?: string;
  endDate?: string;
}
