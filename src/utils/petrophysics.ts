/**
 * AGI SuperSting R8/IP - Unified Petrophysical & Exploration Module
 * 
 * Centralizes petrophysical classification ranges across Adquisición,
 * Tendido, Oro Aluvial, and IA Minera. Editable per project and persisted
 * in localStorage.
 */

export interface PetrophysicalUnit {
  id: string;
  name: string;
  environment: 'hardrock' | 'alluvial';
  category:
    | 'massive_sulfide'
    | 'disseminated_sulfide'
    | 'argillic_alteration'
    | 'porphyry_stockwork'
    | 'siliceous_vein'
    | 'host_rock'
    | 'alluvial_overburden'
    | 'alluvial_sand'
    | 'alluvial_gravel'
    | 'alluvial_saprolite'
    | 'alluvial_bedrock';
  minResistivity: number; // Ohm-m
  maxResistivity: number; // Ohm-m
  minChargeability: number; // mV/V (AGI / Newmont standard M11-M14, 2.0s cycle)
  maxChargeability: number; // mV/V
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  geologicalRole: string;
  typicalGeology: string;
}

export interface IPMeasurementStandard {
  standardName: string;
  windowDefinition: string;
  delayTimeMs: number;
  integrationTimeMs: number;
  totalCycleSec: number;
  waveform: string;
  noiseRejection: string;
  haloIpRange: string;
}

export const IP_MEASUREMENT_STANDARD: IPMeasurementStandard = {
  standardName: 'Norma Newmont / AGI SuperSting Standard',
  windowDefinition: 'Ventanas M11-M14 (td = 100 ms, tw = 1000 ms)',
  delayTimeMs: 100,
  integrationTimeMs: 1000,
  totalCycleSec: 2.0,
  waveform: 'Bipolar cuadrada con 50% ciclo de trabajo (ON+, OFF, ON-, OFF)',
  noiseRejection: '> 120 dB @ 16⅔, 20, 50 y 60 Hz',
  haloIpRange: '15 - 45 mV/V',
};

export interface PriorDrillhole {
  id: string;
  name: string;
  collarX: number; // meters along line
  collarElevationM: number; // msnm
  depthM: number;
  dipDeg: number; // e.g. -60°
  azimuthDeg: number; // e.g. 090°
  lithologyIntercepts: {
    fromM: number;
    toM: number;
    lithology: string;
    assayAuGpt?: number;
    assayCuPct?: number;
  }[];
  notes: string;
}

export interface SuggestedDrillhole {
  id: string;
  name: string;
  collarX: number; // meters along line
  collarElevationM: number; // msnm
  dipDeg: number; // e.g. -60°
  azimuthDeg: number; // e.g. 090°
  targetDepthM: number; // Total drill length
  targetX: number; // Intersection station X in meters
  targetZ: number; // Intersection vertical depth in meters
  targetElevationM: number; // msnm
  targetUnitId: string;
  targetAnomalyTitle: string;
  objectiveText: string;
  confidencePct: number;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  status: 'pending' | 'accepted' | 'rejected';
  acceptedAt?: string;
}

export interface AnomalyZone {
  id: string;
  title: string;
  unitId: string;
  category: string;
  xRange: [number, number]; // [Xmin, Xmax] in meters
  zRange: [number, number]; // [Zmin, Zmax] in meters
  meanTrueRho: number; // Ohm-m
  meanTrueIP: number; // mV/V
  confidencePct: number;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  geologicalInterpretation: string;
  suggestedDrillhole?: SuggestedDrillhole;
}

export interface InterpretationHistoryItem {
  id: string;
  timestamp: string;
  jobName: string;
  source: 'gemini' | 'offline_heuristic';
  rmsError: number;
  pointsAnalyzed: number;
  zonesCount: number;
  anomalyZones: AnomalyZone[];
  suggestedDrillholes: SuggestedDrillhole[];
  executiveSummary: string;
  status: 'completed' | 'queued_for_sync';
}

// -------------------------------------------------------------
// UNIFIED MASTER PETROPHYSICAL PRESETS
// Resolves conflicts across the entire app
// -------------------------------------------------------------

export const DEFAULT_HARDROCK_UNITS: PetrophysicalUnit[] = [
  {
    id: 'unit_massive_sulfide',
    name: 'Sulfuros Masivos (VMS / Cu-Pb-Zn-Ag)',
    environment: 'hardrock',
    category: 'massive_sulfide',
    minResistivity: 0.5,
    maxResistivity: 15,
    minChargeability: 45,
    maxChargeability: 95,
    color: '#0a228c',
    badgeBg: 'bg-blue-900/40',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-500/50',
    geologicalRole: 'Blanco Conductor de Alta Ley',
    typicalGeology: 'Lentes masivos de calcopirita, pirita, galena y esfalerita.',
  },
  {
    id: 'unit_disseminated_sulfide',
    name: 'Sulfuros Diseminados & Halo IP',
    environment: 'hardrock',
    category: 'disseminated_sulfide',
    minResistivity: 15,
    maxResistivity: 150,
    minChargeability: 15,
    maxChargeability: 45,
    color: '#06b6d4',
    badgeBg: 'bg-cyan-900/40',
    badgeText: 'text-cyan-300',
    badgeBorder: 'border-cyan-500/50',
    geologicalRole: 'Halo de Mineralización Aurífera / Cuprífera',
    typicalGeology: 'Diseminación de pirita-calcopirita en roca alterada (15-45 mV/V).',
  },
  {
    id: 'unit_argillic_alteration',
    name: 'Alteración Argílica / Fallas y Arcillas',
    environment: 'hardrock',
    category: 'argillic_alteration',
    minResistivity: 15,
    maxResistivity: 60,
    minChargeability: 4,
    maxChargeability: 14,
    color: '#10b981',
    badgeBg: 'bg-emerald-900/40',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/50',
    geologicalRole: 'Corredores de Falla / Arcillas Hidrotermales',
    typicalGeology: 'Ensamble illita-esmectita con agua entrampada y baja resistividad.',
  },
  {
    id: 'unit_porphyry_stockwork',
    name: 'Pórfido Cu-Au (Stockwork Diseminado)',
    environment: 'hardrock',
    category: 'porphyry_stockwork',
    minResistivity: 80,
    maxResistivity: 450,
    minChargeability: 20,
    maxChargeability: 40,
    color: '#f59e0b',
    badgeBg: 'bg-amber-900/40',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/50',
    geologicalRole: 'Zona Mineralizada Diseminada',
    typicalGeology: 'Venilleo de cuarzo-sulfuros en intrusivo diorítico/monzonítico.',
  },
  {
    id: 'unit_host_rock',
    name: 'Roca Encajonante Andesítica / Daciítica',
    environment: 'hardrock',
    category: 'host_rock',
    minResistivity: 450,
    maxResistivity: 2500,
    minChargeability: 1,
    maxChargeability: 8,
    color: '#ef4444',
    badgeBg: 'bg-rose-900/40',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-500/50',
    geologicalRole: 'Cuerpo de Roca Hospedante Competente',
    typicalGeology: 'Lavas andesíticas y tobas dacíticas moderadamente alteradas.',
  },
  {
    id: 'unit_siliceous_vein',
    name: 'Vetas Silíceas / Cuarzo Epitermal Au-Ag',
    environment: 'hardrock',
    category: 'siliceous_vein',
    minResistivity: 2500,
    maxResistivity: 8000,
    minChargeability: 2,
    maxChargeability: 12,
    color: '#9333ea',
    badgeBg: 'bg-purple-900/40',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/50',
    geologicalRole: 'Estructura Tabular Resistiva Aurífera',
    typicalGeology: 'Vetas de cuarzo bandeado, calcedonia y adularia con electrum.',
  },
];

export const DEFAULT_ALLUVIAL_UNITS: PetrophysicalUnit[] = [
  {
    id: 'unit_alluvial_overburden',
    name: 'Sobrecarga Estéril (Limos / Arcillas saturadas)',
    environment: 'alluvial',
    category: 'alluvial_overburden',
    minResistivity: 15,
    maxResistivity: 60,
    minChargeability: 1,
    maxChargeability: 6,
    color: '#0284c7',
    badgeBg: 'bg-sky-900/40',
    badgeText: 'text-sky-300',
    badgeBorder: 'border-sky-500/50',
    geologicalRole: 'Estéril Aluvial a Remover',
    typicalGeology: 'Limos y arcillas de llanura de inundación de baja resistividad.',
  },
  {
    id: 'unit_alluvial_sand',
    name: 'Arenas y Limos de Terraza (Transición)',
    environment: 'alluvial',
    category: 'alluvial_sand',
    minResistivity: 60,
    maxResistivity: 180,
    minChargeability: 0.5,
    maxChargeability: 3,
    color: '#14b8a6',
    badgeBg: 'bg-teal-900/40',
    badgeText: 'text-teal-300',
    badgeBorder: 'border-teal-500/50',
    geologicalRole: 'Transición Aluvial Arenosa',
    typicalGeology: 'Arenas medias a finas de canal secundario.',
  },
  {
    id: 'unit_alluvial_gravel',
    name: 'Gravas Auríferas del Paleocanal (Paystreak)',
    environment: 'alluvial',
    category: 'alluvial_gravel',
    minResistivity: 180,
    maxResistivity: 800,
    minChargeability: 0,
    maxChargeability: 3,
    color: '#eab308',
    badgeBg: 'bg-yellow-900/40',
    badgeText: 'text-yellow-300',
    badgeBorder: 'border-yellow-500/50',
    geologicalRole: 'Horizonte Mineralizado de Alto Valor Gravimétrico',
    typicalGeology: 'Gravas gruesas y cantos rodados con oro libre y minerales pesados.',
  },
  {
    id: 'unit_alluvial_saprolite',
    name: 'Saprolito / Roca Basamento Meteorizada',
    environment: 'alluvial',
    category: 'alluvial_saprolite',
    minResistivity: 800,
    maxResistivity: 1200,
    minChargeability: 1,
    maxChargeability: 4,
    color: '#f97316',
    badgeBg: 'bg-orange-900/40',
    badgeText: 'text-orange-300',
    badgeBorder: 'border-orange-500/50',
    geologicalRole: 'Roca Alterada de Transición al Piso',
    typicalGeology: 'Meteorización de roca madre subyacente.',
  },
  {
    id: 'unit_alluvial_bedrock',
    name: 'Piso de Roca Madre / Basamento Competente',
    environment: 'alluvial',
    category: 'alluvial_bedrock',
    minResistivity: 1200,
    maxResistivity: 5000,
    minChargeability: 0.5,
    maxChargeability: 4,
    color: '#a855f7',
    badgeBg: 'bg-fuchsia-900/40',
    badgeText: 'text-fuchsia-300',
    badgeBorder: 'border-fuchsia-500/50',
    geologicalRole: 'Fondo del Paleocanal (Bedrock)',
    typicalGeology: 'Basamento rocoso impermeable que retiene el oro en el fondo del thalweg.',
  },
];

export const DEFAULT_PRIOR_DRILLHOLES: PriorDrillhole[] = [
  {
    id: 'ddh-prior-01',
    name: 'DDH-24-001 (Histórico)',
    collarX: 75,
    collarElevationM: 3862,
    depthM: 45,
    dipDeg: -60,
    azimuthDeg: 90,
    lithologyIntercepts: [
      { fromM: 0, toM: 6.5, lithology: 'Sobrecarga coluvial y toba meteorizada' },
      { fromM: 6.5, toM: 22.0, lithology: 'Dacita con alteración argílica pervasiva' },
      { fromM: 22.0, toM: 34.5, lithology: 'Veta cuarcífera bandeada epitermal', assayAuGpt: 3.42 },
      { fromM: 34.5, toM: 45.0, lithology: 'Andesita propilítica con pirita diseminada 1%', assayAuGpt: 0.18 },
    ],
    notes: 'Confirmó veta de cuarzo resistiva (>3000 Ohm-m) a 26m de profundidad vertical.',
  },
  {
    id: 'ddh-prior-02',
    name: 'DDH-24-002 (Histórico)',
    collarX: 185,
    collarElevationM: 3868,
    depthM: 50,
    dipDeg: -55,
    azimuthDeg: 90,
    lithologyIntercepts: [
      { fromM: 0, toM: 4.2, lithology: 'Suelo pedregoso y tobas' },
      { fromM: 4.2, toM: 19.8, lithology: 'Brecha hidrotermal con matriz de sulfuros semimasivos', assayCuPct: 1.15, assayAuGpt: 1.25 },
      { fromM: 19.8, toM: 50.0, lithology: 'Diorita con stockwork de calcopirita diseminada', assayCuPct: 0.42 },
    ],
    notes: 'Interceptó zona conductora (<15 Ohm-m) de alta cargabilidad (>45 mV/V).',
  },
];

const LOCAL_STORAGE_PETRO_KEY = 'supersting_project_petrophysics_v2';
const LOCAL_STORAGE_DRILLHOLES_KEY = 'supersting_accepted_drillholes_v2';
const LOCAL_STORAGE_PRIOR_DRILL_KEY = 'supersting_prior_drillholes_v2';
const LOCAL_STORAGE_HISTORY_KEY = 'supersting_ai_history_v2';

/**
 * Loads project petrophysical units from localStorage or returns defaults
 */
export function loadProjectPetrophysics(): PetrophysicalUnit[] {
  if (typeof window === 'undefined') return [...DEFAULT_HARDROCK_UNITS, ...DEFAULT_ALLUVIAL_UNITS];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PETRO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading petrophysics from storage:', e);
  }
  return [...DEFAULT_HARDROCK_UNITS, ...DEFAULT_ALLUVIAL_UNITS];
}

/**
 * Saves project petrophysical units to localStorage
 */
export function saveProjectPetrophysics(units: PetrophysicalUnit[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_PETRO_KEY, JSON.stringify(units));
  } catch (e) {
    console.error('Error saving petrophysics to storage:', e);
  }
}

/**
 * Loads accepted drillholes
 */
export function loadAcceptedDrillholes(): SuggestedDrillhole[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DRILLHOLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading accepted drillholes:', e);
  }
  return [];
}

/**
 * Saves accepted drillholes
 */
export function saveAcceptedDrillholes(drillholes: SuggestedDrillhole[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_DRILLHOLES_KEY, JSON.stringify(drillholes));
  } catch (e) {
    console.error('Error saving accepted drillholes:', e);
  }
}

/**
 * Loads prior drillholes
 */
export function loadPriorDrillholes(): PriorDrillhole[] {
  if (typeof window === 'undefined') return DEFAULT_PRIOR_DRILLHOLES;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PRIOR_DRILL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading prior drillholes:', e);
  }
  return DEFAULT_PRIOR_DRILLHOLES;
}

/**
 * Saves prior drillholes
 */
export function savePriorDrillholes(drillholes: PriorDrillhole[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_PRIOR_DRILL_KEY, JSON.stringify(drillholes));
  } catch (e) {
    console.error('Error saving prior drillholes:', e);
  }
}

/**
 * Loads AI interpretation history
 */
export function loadInterpretationHistory(): InterpretationHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading interpretation history:', e);
  }
  return [];
}

/**
 * Saves an item to interpretation history
 */
export function saveInterpretationHistoryItem(item: InterpretationHistoryItem): void {
  if (typeof window === 'undefined') return;
  try {
    const history = loadInterpretationHistory();
    const updated = [item, ...history.filter((h) => h.id !== item.id)].slice(0, 20); // Keep last 20
    localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving interpretation history item:', e);
  }
}

/**
 * Classifies a point (rho, ip) against the project's petrophysical units
 */
export function classifyLithologyByPetrophysics(
  rho: number,
  ip: number,
  units: PetrophysicalUnit[],
  environment: 'hardrock' | 'alluvial' = 'hardrock'
): PetrophysicalUnit | null {
  const envUnits = units.filter((u) => u.environment === environment);

  // Exact range match
  const match = envUnits.find(
    (u) => rho >= u.minResistivity && rho <= u.maxResistivity && ip >= u.minChargeability && ip <= u.maxChargeability
  );
  if (match) return match;

  // Fallback match on resistivity only if IP is low or not defining
  const rhoMatch = envUnits.find((u) => rho >= u.minResistivity && rho <= u.maxResistivity);
  return rhoMatch || null;
}
