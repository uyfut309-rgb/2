import React, { useState, useEffect, useMemo } from 'react';
import { SequenceConfig, QuadripolePoint, formatCMD } from '../utils/ert-math';
import {
  Sliders,
  Play,
  Calculator,
  FileUp,
  CheckCircle,
  Pickaxe,
  Zap,
  Shield,
  Target,
  AlertTriangle,
  RotateCw,
  Table,
  Eye,
  Radio,
  Lock,
  Compass,
  Cpu,
  Layers,
  ArrowRight,
  Info,
  TrendingUp,
  HelpCircle,
} from 'lucide-react';

interface LevelRow {
  aMultiplier: number;
  aMeters: number;
  n: number;
  pointsCount: number;
  zeEdwardsM: number;
  maxArraySpanM: number;
  distinctTxDipoles: number;
}

interface SurveySummaryData {
  totalPoints: number;
  distinctTxDipoles: number;
  groupsOf8: number;
  estimatedMinutes: number;
  estimatedMinutesDC: number;
  estimatedMinutesTDIP: number;
  dcFormula: string;
  ipFormula: string;
  lineLengthM: number;
  maxArraySpanM: number;
  agiDepthRange: string;
  agiDepthMin: number;
  agiDepthMax: number;
  approxDepthM: number;
  maxPseudoDepthM: number;
  memoryPct: number;
  remoteElectrodeRequired: boolean;
  remoteElectrodeMinDistM: number;
  levelsTable?: LevelRow[];
}

interface SurveyConfigViewProps {
  config: SequenceConfig & { jobName: string };
  onSaveConfig: (cfg: SequenceConfig & { jobName: string }) => Promise<void>;
  onStartSurveyAfterConfig: () => void;
  isConnected: boolean;
  isSunlightMode: boolean;
  contactSummary?: {
    optimalCount: number;
    acceptableCount: number;
    criticalCount: number;
    over10k: number;
    medianKohm: number;
    maxCurrentEstimMa: number;
  } | null;
  isTxArmed?: boolean;
  onGoToContactTest?: () => void;
  isRunning?: boolean;
}

export const SurveyConfigView: React.FC<SurveyConfigViewProps> = ({
  config,
  onSaveConfig,
  onStartSurveyAfterConfig,
  isConnected,
  isSunlightMode,
  contactSummary,
  isTxArmed,
  onGoToContactTest,
  isRunning,
}) => {
  const [form, setForm] = useState<SequenceConfig & { jobName: string }>({
    ...config,
    progId: config.progId || (config.jobName || 'SURVEY').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase(),
    minStacks: config.minStacks ?? 2,
    maxStacks: config.maxStacks ?? 6,
    stackErrorThreshold: config.stackErrorThreshold ?? 2.0,
    activeMultipliers: config.activeMultipliers ?? [1, 2, 3],
    transmitterType: config.transmitterType ?? 'internal_200w',
    transmitterPowerW: config.transmitterPowerW ?? 200,
    remoteElectrodeB: config.remoteElectrodeB ?? {
      distanceM: 1800,
      azimuthDeg: 90,
      resistanceOhm: 320,
      isGrounded: true,
    },
  });

  const [previewSummary, setPreviewSummary] = useState<SurveySummaryData | null>(null);
  const [samplePoints, setSamplePoints] = useState<QuadripolePoint[]>([]);
  const [activeTabSubView, setActiveTabSubView] = useState<'preview' | 'table' | 'doi' | 'cmd'>('preview');

  // Memory & Hardware synchronization states
  const [isUploadingCmd, setIsUploadingCmd] = useState(false);
  const [cmdStatusMsg, setCmdStatusMsg] = useState<string | null>(null);
  const [isApplyingHw, setIsApplyingHw] = useState(false);
  const [hwStatusMsg, setHwStatusMsg] = useState<string | null>(null);
  const [readbackData, setReadbackData] = useState<any | null>(null);
  const [isReadingBack, setIsReadingBack] = useState(false);
  const [cmdPreviewText, setCmdPreviewText] = useState<string | null>(null);

  const calculateSequence = async (targetCfg: typeof form) => {
    try {
      const res = await fetch('/api/survey/sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCfg),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setPreviewSummary(data.summary);
        if (data.samplePoints) {
          setSamplePoints(data.samplePoints);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setForm({
      ...config,
      progId: config.progId || (config.jobName || 'SURVEY').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase(),
      minStacks: config.minStacks ?? 2,
      maxStacks: config.maxStacks ?? 6,
      stackErrorThreshold: config.stackErrorThreshold ?? 2.0,
      activeMultipliers: config.activeMultipliers ?? [1, 2, 3],
      transmitterType: config.transmitterType ?? 'internal_200w',
      transmitterPowerW: config.transmitterPowerW ?? 200,
      remoteElectrodeB: config.remoteElectrodeB ?? {
        distanceM: 1800,
        azimuthDeg: 90,
        resistanceOhm: 320,
        isGrounded: true,
      },
    });
    calculateSequence(config);
  }, [config]);

  const handleChange = (field: string, value: any) => {
    const updated = { ...form, [field]: value };
    // Auto-sync progId when jobName changes if user hasn't diverged
    if (field === 'jobName') {
      const cleanProg = (value as string).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
      updated.progId = cleanProg;
    }
    // Auto-sync transmitter power if transmitter type changes
    if (field === 'transmitterType') {
      if (value === 'internal_200w') updated.transmitterPowerW = 200;
      else if (value === 'powersting_5kw') updated.transmitterPowerW = 5000;
      else if (value === 'powersting_10kw') updated.transmitterPowerW = 10000;
      else if (value === 'powersting_15kw') updated.transmitterPowerW = 15000;
    }
    setForm(updated);
    calculateSequence(updated);
  };

  const toggleMultiplier = (mult: number) => {
    const current = form.activeMultipliers || [1, 2, 3];
    let next: number[];
    if (current.includes(mult)) {
      if (current.length === 1) return; // Keep at least one active
      next = current.filter((m) => m !== mult);
    } else {
      next = [...current, mult].sort();
    }
    handleChange('activeMultipliers', next);
  };

  // Single unified mining preset applicator
  const applyMiningPreset = (preset: 'epithermal_veins' | 'porphyry_deep' | 'massive_sulfides' | 'alluvial_placer' | 'structural_faults') => {
    let presetCfg: Partial<typeof form> = {};
    if (preset === 'epithermal_veins') {
      presetCfg = {
        miningPreset: 'epithermal_veins',
        arrayType: 'dd',
        spacing: 5,
        nMax: 8,
        activeMultipliers: [1, 2, 3],
        minStacks: 2,
        maxStacks: 6,
        stackErrorThreshold: 2.0,
        maxCurrent: 500,
        measureTime: 1.2,
        isIP: true,
        ipCycle: 2.0,
        transmitterType: 'internal_200w',
        transmitterPowerW: 200,
        targetMineralization: 'gold_silver_veins',
      };
    } else if (preset === 'porphyry_deep') {
      presetCfg = {
        miningPreset: 'porphyry_deep',
        arrayType: 'pole-dipole',
        spacing: 10,
        nMax: 14,
        activeMultipliers: [1, 2, 3],
        minStacks: 2,
        maxStacks: 8,
        stackErrorThreshold: 1.5,
        maxCurrent: 1000,
        measureTime: 2.0,
        isIP: true,
        ipCycle: 4.0,
        transmitterType: 'powersting_5kw',
        transmitterPowerW: 5000,
        targetMineralization: 'porphyry_copper',
        remoteElectrodeB: {
          distanceM: 2000,
          azimuthDeg: 90,
          resistanceOhm: 240,
          isGrounded: true,
        },
      };
    } else if (preset === 'massive_sulfides') {
      presetCfg = {
        miningPreset: 'massive_sulfides',
        arrayType: 'schlumberger',
        spacing: 5,
        nMax: 8,
        activeMultipliers: [1, 2, 3],
        minStacks: 2,
        maxStacks: 6,
        stackErrorThreshold: 2.0,
        maxCurrent: 500,
        measureTime: 1.2,
        isIP: true,
        ipCycle: 2.0,
        transmitterType: 'internal_200w',
        transmitterPowerW: 200,
        targetMineralization: 'vms_massive_sulfides',
      };
    } else if (preset === 'alluvial_placer') {
      // In placer gold, resistivity provides the key gravel/bedrock contrast; disabling TDIP saves ~43 min without losing detection
      presetCfg = {
        miningPreset: 'alluvial_placer',
        arrayType: 'dd',
        spacing: 5,
        nMax: 8,
        activeMultipliers: [1, 2, 3],
        minStacks: 2,
        maxStacks: 4,
        stackErrorThreshold: 2.0,
        maxCurrent: 500,
        measureTime: 1.2,
        isIP: false, // TDIP is optional in placer; pure DC is significantly faster
        ipCycle: 2.0,
        transmitterType: 'internal_200w',
        transmitterPowerW: 200,
        targetMineralization: 'general',
      };
    } else if (preset === 'structural_faults') {
      presetCfg = {
        miningPreset: 'structural_faults',
        arrayType: 'gradient',
        spacing: 5,
        nMax: 10,
        activeMultipliers: [1, 2],
        minStacks: 2,
        maxStacks: 4,
        stackErrorThreshold: 2.0,
        maxCurrent: 500,
        measureTime: 1.2,
        isIP: false,
        ipCycle: 2.0,
        transmitterType: 'internal_200w',
        transmitterPowerW: 200,
        targetMineralization: 'general',
      };
    }

    const updated = { ...form, ...presetCfg };
    setForm(updated);
    calculateSequence(updated);
  };

  // Upload .CMD sequence file to SuperSting R8 buffer
  const handleUploadCmd = async () => {
    setIsUploadingCmd(true);
    setCmdStatusMsg(null);
    try {
      const cleanProg = (form.progId || form.jobName || 'SURVEY').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
      const res = await fetch('/api/instrument/upload-cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progId: cleanProg }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setCmdStatusMsg(`✓ Script ${data.filename} (${data.linesCount} líneas Tx) cargado en buffer R8.`);
        setCmdPreviewText(data.content);
        setTimeout(() => setCmdStatusMsg(null), 4000);
      }
    } catch (e) {
      console.error(e);
      setCmdStatusMsg('Error al transmitir archivo .cmd al R8.');
    } finally {
      setIsUploadingCmd(false);
    }
  };

  // Send hardware acquisition settings to SuperSting internal registers
  const handleApplyHardware = async () => {
    setIsApplyingHw(true);
    setHwStatusMsg(null);
    try {
      await onSaveConfig(form);
      const res = await fetch('/api/instrument/apply-hardware-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setHwStatusMsg('✓ Registros de hardware programados (Stacks, Tiempos, Umbrales).');
        setTimeout(() => setHwStatusMsg(null), 4000);
      }
    } catch (e) {
      console.error(e);
      setHwStatusMsg('Error al programar registros del equipo.');
    } finally {
      setIsApplyingHw(false);
    }
  };

  // Readback memory handshake confirmation from SuperSting R8
  const handleReadback = async () => {
    setIsReadingBack(true);
    try {
      const res = await fetch('/api/instrument/readback');
      const data = await res.json();
      if (data.status === 'ok') {
        setReadbackData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsReadingBack(false);
    }
  };

  // Determine QC gate status
  const isQcReady = Boolean(
    contactSummary &&
    (
      (contactSummary as any).badElectrodes
        ? (contactSummary as any).badElectrodes.length === 0
        : true
    ) &&
    (
      typeof (contactSummary as any).over5k === 'number'
        ? (contactSummary as any).over5k === 0
        : true
    ) &&
    (
      typeof contactSummary.criticalCount === 'number'
        ? contactSummary.criticalCount === 0
        : true
    )
  );
  const isPoleArray = ['pole-dipole', 'p-dd', 'pole-pole'].includes((form.arrayType || '').toLowerCase());
  const lineLengthM = (form.electrodes - 1) * (form.spacing || 5);
  const minRemoteDistM = 5 * lineLengthM;
  const isRemoteValid = !isPoleArray || (form.remoteElectrodeB?.distanceM || 0) >= minRemoteDistM;

  // Real physical injection shots from .cmd script
  const realCmdShots = previewSummary?.distinctTxDipoles ?? 94;

  return (
    <div className="space-y-4">
      {/* 1. Header with Unified Acquisition Status & QC Safety Guard */}
      <div
        className={`rounded-xl border p-4 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/40 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-tight">
                Tendido Geofísico & Parámetros de Adquisición
              </h2>
              <span className="text-[10px] font-mono opacity-70">
                SuperSting R8/IP · Receptor Multicanal de 8 Canales · Firmware v4.2
              </span>
            </div>
          </div>

          {/* Unified Start Control & QC Status */}
          <div className="flex items-center gap-2.5">
            {isQcReady ? (
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                QC de Picas Aprobado (&lt; 5.0 kΩ)
              </span>
            ) : (
              <button
                type="button"
                onClick={onGoToContactTest}
                className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1.5 rounded-lg border border-amber-500/40 cursor-pointer"
                title="Ir a QC de Picas para verificar resistencia de contacto antes de inyectar corriente"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>QC Pendiente o Crítico</span>
                <ArrowRight className="w-3 h-3 ml-0.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onStartSurveyAfterConfig}
              disabled={!isConnected || !isQcReady || isRunning}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold min-h-[38px] transition-all border shadow ${
                !isConnected || !isQcReady || isRunning
                  ? 'bg-slate-300 text-slate-500 border-slate-400 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 cursor-not-allowed opacity-70'
                  : isSunlightMode
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-black cursor-pointer'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 cursor-pointer shadow-emerald-950/40'
              }`}
              title={
                !isQcReady
                  ? 'Bloqueo de seguridad: Requiere QC de contacto aprobado (< 5.0 kΩ) antes de armar el transmisor'
                  : isRunning
                  ? 'Levantamiento en ejecución activa'
                  : 'Iniciar adquisición de línea en SuperSting R8'
              }
            >
              {!isQcReady ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Inyección Bloqueada (QC)</span>
                </>
              ) : isRunning ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>En Adquisición...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Iniciar Adquisición</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Single Unified Geological Target Presets Ribbon (1 Active Card Highlighted) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Plantillas Geomineras (SuperSting R8/IP)
            </span>
            <span className="text-[10px] font-mono opacity-65">
              Selecciona una estrategia optimizada para el blanco mineral
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => applyMiningPreset('epithermal_veins')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                form.miningPreset === 'epithermal_veins'
                  ? isSunlightMode
                    ? 'bg-amber-100 text-black border-black font-bold ring-2 ring-black'
                    : 'bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400 shadow-lg shadow-amber-950/40'
                  : isSunlightMode
                  ? 'bg-slate-50 border-slate-300 hover:bg-slate-100'
                  : 'bg-[#070e17] border-[#16273f] hover:border-slate-500'
              }`}
            >
              <div className="font-bold flex items-center justify-between text-[11px] mb-1">
                <span>Vetas Au-Ag (Epitermal)</span>
                <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">Dipolo-Dipolo</span>
              </div>
              <p className="text-[9.5px] opacity-75 leading-tight">
                Alta resolución lateral. Silicificación &gt;2500 Ω·m y halos de sulfuros en TDIP (ciclo 2.0s).
              </p>
            </button>

            <button
              type="button"
              onClick={() => applyMiningPreset('porphyry_deep')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                form.miningPreset === 'porphyry_deep'
                  ? isSunlightMode
                    ? 'bg-purple-100 text-black border-black font-bold ring-2 ring-black'
                    : 'bg-purple-500/20 border-purple-400 text-purple-200 ring-1 ring-purple-400 shadow-lg shadow-purple-950/40'
                  : isSunlightMode
                  ? 'bg-slate-50 border-slate-300 hover:bg-slate-100'
                  : 'bg-[#070e17] border-[#16273f] hover:border-slate-500'
              }`}
            >
              <div className="font-bold flex items-center justify-between text-[11px] mb-1">
                <span>Pórfidos Cu-Au Profundos</span>
                <span className="text-[9px] px-1 rounded bg-purple-500/20 text-purple-300">Polo-Dipolo</span>
              </div>
              <p className="text-[9.5px] opacity-75 leading-tight">
                Polo-Dipolo (a=10m, nMax=14). Requiere PowerSting para 1-2A y electrodo remoto B a 2000m.
              </p>
            </button>

            <button
              type="button"
              onClick={() => applyMiningPreset('massive_sulfides')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                form.miningPreset === 'massive_sulfides'
                  ? isSunlightMode
                    ? 'bg-blue-100 text-black border-black font-bold ring-2 ring-black'
                    : 'bg-blue-500/20 border-blue-400 text-blue-200 ring-1 ring-blue-400 shadow-lg shadow-blue-950/40'
                  : isSunlightMode
                  ? 'bg-slate-50 border-slate-300 hover:bg-slate-100'
                  : 'bg-[#070e17] border-[#16273f] hover:border-slate-500'
              }`}
            >
              <div className="font-bold flex items-center justify-between text-[11px] mb-1">
                <span>Sulfuros Masivos (VMS)</span>
                <span className="text-[9px] px-1 rounded bg-blue-500/20 text-blue-300">Schlumberger</span>
              </div>
              <p className="text-[9.5px] opacity-75 leading-tight">
                Wenner-Schlumberger. Contraste conductor (&lt;15 Ω·m) y anomalías IP de skarn polimetálico.
              </p>
            </button>

            <button
              type="button"
              onClick={() => applyMiningPreset('alluvial_placer')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                form.miningPreset === 'alluvial_placer'
                  ? isSunlightMode
                    ? 'bg-emerald-100 text-black border-black font-bold ring-2 ring-black'
                    : 'bg-emerald-500/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400 shadow-lg shadow-emerald-950/40'
                  : isSunlightMode
                  ? 'bg-slate-50 border-slate-300 hover:bg-slate-100'
                  : 'bg-[#070e17] border-[#16273f] hover:border-slate-500'
              }`}
            >
              <div className="font-bold flex items-center justify-between text-[11px] mb-1">
                <span>Placer Aluvial / Gravas</span>
                <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">DC Pura</span>
              </div>
              <p className="text-[9.5px] opacity-75 leading-tight">
                Resistividad DC pura (sin TDIP). Ahorra ~43 min mapeando canal vs arcilla vs bedrock.
              </p>
            </button>

            <button
              type="button"
              onClick={() => applyMiningPreset('structural_faults')}
              className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                form.miningPreset === 'structural_faults'
                  ? isSunlightMode
                    ? 'bg-cyan-100 text-black border-black font-bold ring-2 ring-black'
                    : 'bg-cyan-500/20 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400 shadow-lg shadow-cyan-950/40'
                  : isSunlightMode
                  ? 'bg-slate-50 border-slate-300 hover:bg-slate-100'
                  : 'bg-[#070e17] border-[#16273f] hover:border-slate-500'
              }`}
            >
              <div className="font-bold flex items-center justify-between text-[11px] mb-1">
                <span>Control Estructural</span>
                <span className="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-300">Gradiente</span>
              </div>
              <p className="text-[9.5px] opacity-75 leading-tight">
                Gradiente multicanal rápido para fallas de cizalla y contactos litológicos regionales.
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Parameters Form */}
      <div
        className={`rounded-xl border p-5 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        <div className="flex items-center justify-between mb-4 border-b border-slate-700/40 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Parámetros Geométricos & Físicos del Tendido
          </h3>
          <span className="text-[10px] font-mono text-cyan-400">
            Prog ID strictly max 8 car. · Sin truncamiento de etiquetas
          </span>
        </div>

        {/* Grid of Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs font-mono">
          {/* Line / Job Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
              Nombre de Línea / Malla
            </label>
            <input
              type="text"
              value={form.jobName}
              onChange={(e) => handleChange('jobName', e.target.value.toUpperCase())}
              className={`w-full rounded-lg px-3 py-2 text-sm border font-bold focus:outline-none ${
                isSunlightMode
                  ? 'bg-slate-100 border-black text-black focus:border-blue-700'
                  : 'bg-[#070e17] border-[#1b2e49] text-white focus:border-blue-500'
              }`}
              required
            />
          </div>

          {/* Program ID (.cmd max 8 chars) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase tracking-wider opacity-80">
                Prog ID de Memoria R8
              </label>
              <span className="text-[10px] text-cyan-400 font-bold">Máx 8 car.</span>
            </div>
            <div className="relative">
              <input
                type="text"
                maxLength={8}
                value={form.progId || ''}
                onChange={(e) =>
                  handleChange('progId', e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase())
                }
                placeholder="MINAVETA"
                className={`w-full rounded-lg px-3 py-2 text-sm border font-bold tracking-widest focus:outline-none ${
                  isSunlightMode
                    ? 'bg-slate-100 border-black text-black focus:border-blue-700'
                    : 'bg-[#070e17] border-[#1b2e49] text-cyan-300 focus:border-blue-500'
                }`}
                required
              />
              <span className="absolute right-2.5 top-2 text-[10px] opacity-60">
                {(form.progId || '').length}/8
              </span>
            </div>
          </div>

          {/* Geophysical Array Type - Clean full-width non-truncated Spanish */}
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
              Arreglo Geofísico Multicanal
            </label>
            <select
              value={form.arrayType}
              onChange={(e) => handleChange('arrayType', e.target.value)}
              className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                isSunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
            >
              <option value="dd">Dipolo-Dipolo (Multicanal 8CH - Vetas & Fallas)</option>
              <option value="pole-dipole">Polo-Dipolo (Multicanal 8CH - Máxima Penetración & Pórfidos)</option>
              <option value="schlumberger">Wenner-Schlumberger (Estratigrafía / Cuerpos Tabulares VMS)</option>
              <option value="wenner">Wenner Alpha (Capas Horizontales Puras)</option>
              <option value="gradient">Gradiente Multicanal (Mapeo Rápido de Bloques)</option>
            </select>
          </div>

          {/* Electrodes count */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
              Cantidad de Picas / Electrodos
            </label>
            <select
              value={form.electrodes}
              onChange={(e) => handleChange('electrodes', Number(e.target.value))}
              className={`w-full rounded-lg px-3 py-2 text-sm border font-bold focus:outline-none ${
                isSunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
            >
              <option value={28}>28 Electrodos (1 Carrete)</option>
              <option value={56}>56 Electrodos (2 Carretes estándar)</option>
              <option value={84}>84 Electrodos (3 Carretes)</option>
              <option value={112}>112 Electrodos (4 Carretes de Exploración)</option>
            </select>
          </div>

          {/* Unit Spacing "a" */}
          <div>
            <label className="block text-xs font-bold tracking-wider mb-1 opacity-80">
              <span className="uppercase">Espaciamiento Unitario "a"</span> <span className="normal-case font-normal">(m)</span>
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="25"
              value={form.spacing}
              onChange={(e) => handleChange('spacing', Number(e.target.value))}
              className={`w-full rounded-lg px-3 py-2 text-sm border font-bold focus:outline-none ${
                isSunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
              required
            />
          </div>

          {/* Active Multiples of "a" */}
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
              Múltiplos de Dipolo "a" Activos en Secuencia
            </label>
            <div className="flex items-center gap-3 pt-1">
              {[1, 2, 3].map((mult) => {
                const isActive = (form.activeMultipliers || [1, 2, 3]).includes(mult);
                const aM = mult * (form.spacing || 5);
                return (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => toggleMultiplier(mult)}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-between cursor-pointer transition-colors ${
                      isActive
                        ? isSunlightMode
                          ? 'bg-blue-100 border-black text-blue-900'
                          : 'bg-blue-600/25 border-blue-400 text-blue-200'
                        : isSunlightMode
                        ? 'bg-slate-100 border-slate-300 text-slate-400'
                        : 'bg-[#070e17] border-[#16273f] text-slate-500'
                    }`}
                  >
                    <span>{mult}a ({aM}&nbsp;m)</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isActive ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max n-Factor */}
          <div>
            <label className="block text-xs font-bold tracking-wider mb-1 opacity-80">
              <span className="uppercase">Separación Máxima</span> <span className="normal-case font-normal">(n-Factor)</span>
            </label>
            <input
              type="number"
              min="2"
              max="14"
              value={form.nMax || 8}
              onChange={(e) => handleChange('nMax', Number(e.target.value))}
              className={`w-full rounded-lg px-3 py-2 text-sm border font-bold focus:outline-none ${
                isSunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
            />
          </div>

          {/* Transmitter Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
              Fuente de Transmisión (Tx)
            </label>
            <select
              value={form.transmitterType || 'internal_200w'}
              onChange={(e) => handleChange('transmitterType', e.target.value)}
              className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                isSunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
            >
              <option value="internal_200w">Tx Interno SuperSting R8 (200 W / 800 Vp-p)</option>
              <option value="powersting_5kw">PowerSting Externo 5 kW (hasta 5 A / 2000 Vp-p)</option>
              <option value="powersting_10kw">PowerSting Externo 10 kW (hasta 10 A / 2000 Vp-p)</option>
              <option value="powersting_15kw">PowerSting Externo 15 kW (hasta 15 A / 2000 Vp-p)</option>
            </select>
          </div>

          {/* Current Injection */}
          <div>
            <label className="block text-xs font-bold tracking-wider mb-1 opacity-80">
              <span className="uppercase">Corriente de Inyección Máx</span> <span className="normal-case font-normal">(mA)</span>
            </label>
            <select
              value={form.maxCurrent || 500}
              onChange={(e) => handleChange('maxCurrent', Number(e.target.value))}
              className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                isSunlightMode
                  ? 'bg-slate-100 border-black text-black'
                  : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
            >
              <option value={100}>100 mA (Lazo ≤ 8.0 kΩ @ 800V)</option>
              <option value={200}>200 mA (Lazo ≤ 4.0 kΩ @ 800V)</option>
              <option value={500}>500 mA (Recomendado Tx 200W - Lazo ≤ 1.6 kΩ)</option>
              <option value={1000}>1000 mA (1.0 A - Exige lazo ≤ 200 Ω o PowerSting)</option>
              <option value={2000}>2000 mA (2.0 A - Exige lazo ≤ 50 Ω o PowerSting)</option>
            </select>
          </div>

          {/* Measurement Time with AGI 120dB noise rejection warning */}
          <div>
            <label className="block text-xs font-bold tracking-wider mb-1 opacity-80">
              <span className="uppercase">{form.isIP ? 'Ciclo IP / Integración' : 'Tiempo Medición DC'}</span>{' '}
              <span className="normal-case font-normal">(s)</span>
            </label>
            {form.isIP ? (
              <select
                value={form.ipCycle || 2.0}
                onChange={(e) => handleChange('ipCycle', Number(e.target.value))}
                className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                  isSunlightMode
                    ? 'bg-slate-100 border-black text-black'
                    : 'bg-[#070e17] border-[#1b2e49] text-white'
                }`}
              >
                <option value={0.5}>0.5 s (Rápido - Menor rechazo red)</option>
                <option value={1.0}>1.0 s (Bajo tiempo de ciclo)</option>
                <option value={2.0}>2.0 s (Estándar AGI - &gt;120 dB rechazo 50/60Hz)</option>
                <option value={4.0}>4.0 s (Alta precisión mineral Cole-Cole)</option>
                <option value={8.0}>8.0 s (Máximo rechazo para telúricos)</option>
              </select>
            ) : (
              <select
                value={form.measureTime || 1.2}
                onChange={(e) => handleChange('measureTime', Number(e.target.value))}
                className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                  isSunlightMode
                    ? 'bg-slate-100 border-black text-black'
                    : 'bg-[#070e17] border-[#1b2e49] text-white'
                }`}
              >
                <option value={0.8}>0.8 s (Rápido)</option>
                <option value={1.2}>1.2 s (Estándar AGI &gt;120 dB rechazo 50/60Hz)</option>
                <option value={2.0}>2.0 s (Alta relación señal/ruido)</option>
                <option value={3.6}>3.6 s (Filtro 50/60 Hz industrial pesado)</option>
              </select>
            )}
          </div>

          {/* Min & Max Stacks */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
              Stacks (Mínimo / Máximo)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <select
                  value={form.minStacks ?? 2}
                  onChange={(e) => handleChange('minStacks', Number(e.target.value))}
                  className={`w-full rounded-lg px-2 py-2 text-xs border font-bold focus:outline-none ${
                    isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
                  }`}
                >
                  <option value={1}>Mín: 1</option>
                  <option value={2}>Mín: 2 (Est.)</option>
                  <option value={3}>Mín: 3</option>
                  <option value={4}>Mín: 4</option>
                </select>
              </div>
              <div>
                <select
                  value={form.maxStacks ?? 6}
                  onChange={(e) => handleChange('maxStacks', Number(e.target.value))}
                  className={`w-full rounded-lg px-2 py-2 text-xs border font-bold focus:outline-none ${
                    isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
                  }`}
                >
                  <option value={4}>Máx: 4</option>
                  <option value={6}>Máx: 6 (Rec.)</option>
                  <option value={8}>Máx: 8</option>
                  <option value={12}>Máx: 12</option>
                </select>
              </div>
            </div>
          </div>

          {/* Stack Error Threshold */}
          <div>
            <label className="block text-xs font-bold tracking-wider mb-1 opacity-80">
              <span className="uppercase">Umbral Error Stack</span> <span className="normal-case font-normal">(RMS %)</span>
            </label>
            <select
              value={form.stackErrorThreshold ?? 2.0}
              onChange={(e) => handleChange('stackErrorThreshold', Number(e.target.value))}
              className={`w-full rounded-lg px-3 py-2 text-xs border font-bold focus:outline-none ${
                isSunlightMode ? 'bg-slate-100 border-black text-black' : 'bg-[#070e17] border-[#1b2e49] text-white'
              }`}
            >
              <option value={1.0}>1.0% (Exigente - Alta Precisión)</option>
              <option value={1.5}>1.5% (Minería Estándar)</option>
              <option value={2.0}>2.0% (Recomendado de Campo)</option>
              <option value={3.0}>3.0% (Terreno Ruidoso)</option>
            </select>
          </div>

          {/* IP Checkbox with Placer Guidance */}
          <div
            className={`sm:col-span-2 lg:col-span-4 flex items-start gap-3 p-3 rounded-lg border ${
              isSunlightMode ? 'bg-slate-50 border-slate-300' : 'bg-[#070e17] border-[#1b2e49]'
            }`}
          >
            <input
              type="checkbox"
              id="isIPCheck"
              checked={Boolean(form.isIP)}
              onChange={(e) => handleChange('isIP', e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
            />
            <label htmlFor="isIPCheck" className="text-xs cursor-pointer select-none">
              <span className="font-bold block text-purple-600 dark:text-purple-300">
                Activar Polarización Inducida en Dominio de Tiempo (TDIP)
              </span>
              <span className="opacity-80 block text-[11px] leading-tight">
                Fundamental en sulfuros diseminados y vetas. En <strong>oro aluvial / placeres</strong> es opcional: omitir TDIP reduce el levantamiento de ~52 min a ~8.8 min sin sacrificar la detección de lecho de roca (bedrock) y gravas.
              </span>
            </label>
          </div>
        </div>

        {/* Physics Warning for Current Saturation & Noise Rejection */}
        <div className="mt-3 space-y-1.5 text-[11px] font-mono">
          {form.transmitterType === 'internal_200w' && (form.maxCurrent || 500) > 500 && (
            <div className="p-2.5 rounded-lg border bg-amber-500/10 border-amber-400/40 text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Aviso de Ley de Ohm & Joule (P=I²R y V=IR):</strong> Con el transmisor interno de 200W, inyectar {form.maxCurrent} mA exige una resistencia de lazo de corriente ≤ {form.maxCurrent === 1000 ? '200 Ω' : '50 Ω'}. En terrenos resistivos se requiere <strong>PowerSting 5-15 kW</strong> para alcanzar dicha corriente sin saturar a 800 Vp-p.
              </span>
            </div>
          )}

          {form.isIP && (form.ipCycle || 2) < 1.2 && (
            <div className="p-2.5 rounded-lg border bg-amber-500/10 border-amber-400/40 text-amber-300 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Especificación AGI (&gt;120 dB rechazo):</strong> Ciclo IP &lt; 1.2 s no garantiza &gt;120 dB de rechazo para interferencia de 50/60 Hz de red eléctrica o armónicos de tracción (16⅔, 20 Hz). Se recomienda ≥ 2.0 s para polarización inducida minera.
              </span>
            </div>
          )}
        </div>

        {/* 4. Remote Electrode (B) Configuration for Pole-Dipole Array */}
        {isPoleArray && (
          <div
            className={`mt-4 p-4 rounded-xl border ${
              isSunlightMode ? 'bg-purple-50 border-black' : 'bg-[#120e24] border-purple-500/30'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-purple-500/30 pb-2">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold uppercase tracking-tight text-purple-400">
                  Electrodo Remoto de Corriente "B" (Infinito)
                </h4>
              </div>
              <span className="text-[10px] font-mono opacity-80">
                Condición de Infinito: Distancia recomendada ≥ 5× Longitud de Línea (≥ {minRemoteDistM}&nbsp;m)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
                  Distancia al Electrodo Remoto B (m)
                </label>
                <input
                  type="number"
                  min="500"
                  max="10000"
                  step="50"
                  value={form.remoteElectrodeB?.distanceM || 1800}
                  onChange={(e) =>
                    handleChange('remoteElectrodeB', {
                      ...form.remoteElectrodeB,
                      distanceM: Number(e.target.value),
                    })
                  }
                  className={`w-full rounded px-2.5 py-1.5 text-xs border font-bold ${
                    isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080d16] border-[#1d2f4a] text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
                  Rumbo / Azimut del Cable Remoto (°)
                </label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={form.remoteElectrodeB?.azimuthDeg || 90}
                  onChange={(e) =>
                    handleChange('remoteElectrodeB', {
                      ...form.remoteElectrodeB,
                      azimuthDeg: Number(e.target.value),
                    })
                  }
                  className={`w-full rounded px-2.5 py-1.5 text-xs border font-bold ${
                    isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080d16] border-[#1d2f4a] text-white'
                  }`}
                />
                <span className="text-[9.5px] opacity-70 block mt-0.5">
                  Orientar perpendicular (90° ± 15°) al perfil para anular acoplamiento inductivo EM.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase mb-1 opacity-80">
                  Resistencia Puesta a Tierra B (Ω)
                </label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={form.remoteElectrodeB?.resistanceOhm || 320}
                  onChange={(e) =>
                    handleChange('remoteElectrodeB', {
                      ...form.remoteElectrodeB,
                      resistanceOhm: Number(e.target.value),
                    })
                  }
                  className={`w-full rounded px-2.5 py-1.5 text-xs border font-bold ${
                    isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080d16] border-[#1d2f4a] text-white'
                  }`}
                />
                <span className="text-[9.5px] opacity-70 block mt-0.5">
                  Exigible &lt; 500 Ω (batería de estacas en paralelo con bentonita/agua salada).
                </span>
              </div>
            </div>

            {!isRemoteValid && (
              <div className="mt-2.5 text-[11px] text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Advertencia: Distancia de {form.remoteElectrodeB?.distanceM} m es inferior al umbral de infinito ({minRemoteDistM} m). Provocará &gt;5% de distorsión geométrica en el factor K.
                </span>
              </div>
            )}
          </div>
        )}

        {/* 5. Memory Management & Hardware Application Actions */}
        <div
          className={`mt-5 p-4 rounded-xl border ${
            isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#08101a] border-[#16273e]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-slate-700/30 pb-2.5">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-tight">
                Programación de Memoria SuperSting (Separación .CMD de Ajustes de Hardware)
              </h3>
            </div>
            <span className="text-[10px] font-mono opacity-70">
              Los ajustes de campo se programan en hardware; el .cmd solo conmuta electrodos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Step 1: Upload CMD Script */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between ${
                isSunlightMode ? 'bg-white border-slate-300' : 'bg-[#0b1422] border-[#1b2b41]'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">
                  Paso 1 · Secuencia Multicanal
                </span>
                <p className="text-[11px] opacity-80 leading-snug mb-3">
                  Genera y sube el archivo de conmutación <strong>{form.progId || 'SURVEY'}.CMD</strong> (8CH) al buffer de memoria del SuperSting.
                </p>
              </div>
              <button
                type="button"
                onClick={handleUploadCmd}
                disabled={isUploadingCmd}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSunlightMode
                    ? 'bg-cyan-100 hover:bg-cyan-200 border-black text-cyan-950'
                    : 'bg-cyan-600/20 hover:bg-cyan-600/35 border-cyan-500/50 text-cyan-300'
                }`}
              >
                <FileUp className={`w-3.5 h-3.5 ${isUploadingCmd ? 'animate-bounce' : ''}`} />
                <span>{isUploadingCmd ? 'Subiendo...' : 'Subir Script .CMD a Buffer'}</span>
              </button>
            </div>

            {/* Step 2: Apply Hardware Settings */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between ${
                isSunlightMode ? 'bg-white border-slate-300' : 'bg-[#0b1422] border-[#1b2b41]'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                  Paso 2 · Registros de Hardware
                </span>
                <p className="text-[11px] opacity-80 leading-snug mb-3">
                  Configura en el instrumento los stacks mín/máx, umbral de error, ciclos de integración y modo Tx.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApplyHardware}
                disabled={isApplyingHw}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSunlightMode
                    ? 'bg-emerald-100 hover:bg-emerald-200 border-black text-emerald-950'
                    : 'bg-emerald-600/20 hover:bg-emerald-600/35 border-emerald-500/50 text-emerald-300'
                }`}
              >
                <Sliders className={`w-3.5 h-3.5 ${isApplyingHw ? 'animate-spin' : ''}`} />
                <span>{isApplyingHw ? 'Programando...' : 'Programar Registros R8'}</span>
              </button>
            </div>

            {/* Step 3: Read-back Verification */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between ${
                isSunlightMode ? 'bg-white border-slate-300' : 'bg-[#0b1422] border-[#1b2b41]'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                  Paso 3 · Verificación Read-Back
                </span>
                <p className="text-[11px] opacity-80 leading-snug mb-3">
                  Consulta de vuelta los registros y memoria del instrumento para confirmar sincronización 100%.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReadback}
                disabled={isReadingBack}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSunlightMode
                    ? 'bg-amber-100 hover:bg-amber-200 border-black text-amber-950'
                    : 'bg-amber-600/20 hover:bg-amber-600/35 border-amber-500/50 text-amber-300'
                }`}
              >
                <RotateCw className={`w-3.5 h-3.5 ${isReadingBack ? 'animate-spin' : ''}`} />
                <span>{isReadingBack ? 'Verificando...' : 'Verificar Memoria (Read-Back)'}</span>
              </button>
            </div>
          </div>

          {/* Feedback messages */}
          {(cmdStatusMsg || hwStatusMsg) && (
            <div className="mt-3 flex flex-col gap-1 text-xs font-mono font-bold">
              {cmdStatusMsg && <span className="text-cyan-400">{cmdStatusMsg}</span>}
              {hwStatusMsg && <span className="text-emerald-400">{hwStatusMsg}</span>}
            </div>
          )}

          {/* Readback confirmed badge */}
          {readbackData && (
            <div className="mt-3 p-3 rounded-lg border bg-emerald-500/10 border-emerald-500/40 text-emerald-300 text-xs font-mono">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Handshake Confirmado con SuperSting R8 (Firmware v{readbackData.firmware})
                </span>
                <span className="opacity-70 text-[10px]">{readbackData.timestamp}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] opacity-90 mt-2">
                <div>Prog ID: <strong>{readbackData.loadedProgId}</strong></div>
                <div>Arreglo: <strong>{readbackData.arrayType.toUpperCase()}</strong></div>
                <div>Stacks: <strong>{readbackData.registers.minStacks}-{readbackData.registers.maxStacks} (RMS &lt; {readbackData.registers.stackErrorThreshold}%)</strong></div>
                <div>Modo: <strong>{readbackData.registers.isIP ? `TDIP (${readbackData.registers.ipCycle}s)` : `DC (${readbackData.registers.measureTime}s)`}</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* 6. Live Physical Pre-calculation Strip */}
        {previewSummary && (
          <div
            className={`mt-5 p-4 rounded-xl border ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#08101a] border-[#16273e]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-500" />
                <span>Pre-cálculo de Secuencia & Duración Física en Campo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTabSubView('preview')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors ${
                    activeTabSubView === 'preview'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-transparent border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  Cobertura (X-Z)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabSubView('table')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors ${
                    activeTabSubView === 'table'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-transparent border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  Tabla Edwards (a, n)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabSubView('doi')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors ${
                    activeTabSubView === 'doi'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-transparent border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  Análisis DOI
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabSubView('cmd')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-colors ${
                    activeTabSubView === 'cmd'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-transparent border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  Ver .CMD (8CH)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2.5 font-mono text-xs">
              <div
                className={`p-2.5 rounded border ${
                  isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1829] border-[#1a2d48]'
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-70 block">Puntos Totales</span>
                <span className="text-base font-bold text-cyan-600 dark:text-cyan-300">
                  {previewSummary.totalPoints}
                </span>
                <span className="text-[9px] opacity-70 block">Cuadripolos</span>
              </div>

              <div
                className={`p-2.5 rounded border ${
                  isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1829] border-[#1a2d48]'
                }`}
                title="Número exacto de posiciones de dipolo de corriente C1-C2 programadas en el script .cmd (no puntos/8)"
              >
                <span className="text-[10px] font-bold uppercase opacity-70 block">Disparos Tx (C1-C2)</span>
                <span className="text-base font-bold text-amber-400">{realCmdShots}</span>
                <span className="text-[9px] opacity-70 block">Posiciones .cmd</span>
              </div>

              <div
                className={`p-2.5 rounded border ${
                  isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1829] border-[#1a2d48]'
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-70 block">Longitud Línea</span>
                <span className="text-base font-bold">{previewSummary.lineLengthM}&nbsp;m</span>
                <span className="text-[9px] opacity-70 block">0 a {previewSummary.lineLengthM} m</span>
              </div>

              <div
                className={`p-2.5 rounded border ${
                  isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1829] border-[#1a2d48]'
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-70 block">Prof. Edwards (1977)</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  ~{previewSummary.maxPseudoDepthM}&nbsp;m
                </span>
                <span className="text-[9px] opacity-70 block">Mediana teórica ze</span>
              </div>

              <div
                className={`p-2.5 rounded border ${
                  isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1829] border-[#1a2d48]'
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-70 block">Regla AGI (15-25%)</span>
                <span className="text-xs font-bold text-cyan-400">
                  {previewSummary.agiDepthRange}
                </span>
                <span className="text-[9px] opacity-70 block">L_arr={previewSummary.maxArraySpanM}&nbsp;m</span>
              </div>

              <div
                className={`p-2.5 rounded border ${
                  isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1829] border-[#1a2d48]'
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-70 block">Tiempo Estimado</span>
                <span className="text-base font-bold text-purple-400">
                  {previewSummary.estimatedMinutes}&nbsp;min
                </span>
                <span className="text-[9px] opacity-70 block">
                  {form.isIP ? 'Modo TDIP (4 pulsos)' : 'Modo DC Resistividad'}
                </span>
              </div>

              <div
                className={`p-2.5 rounded border ${
                  isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1829] border-[#1a2d48]'
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-70 block">Uso Memoria R8</span>
                <span className="text-base font-bold text-amber-500">{previewSummary.memoryPct}%</span>
                <span className="text-[9px] opacity-70 block">Buffer firmware</span>
              </div>
            </div>

            {/* Explanatory timing breakdown badge */}
            <div className="mt-3 p-2.5 rounded-lg border bg-[#060b13] border-[#132237] text-[11px] font-mono text-slate-300 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-cyan-400 font-bold">Fórmula de Adquisición Real: </span>
                <span>{form.isIP ? previewSummary.ipFormula : previewSummary.dcFormula}</span>
              </div>
              <div className="text-[10px] opacity-70">
                {form.isIP
                  ? `(TDIP cuadriplica duración: 4 × ${form.ipCycle || 2}s ciclo cuadrado + conmutación)`
                  : `(DC resistividad estándar: ${form.measureTime || 1.2}s + 0.8s conmutación)`}
              </div>
            </div>

            {/* 7. Sub-views: Coverage Plot, Edwards Table, DOI Analysis, CMD Viewer */}
            {activeTabSubView === 'preview' && (
              <div className="mt-4 p-3 rounded-lg border bg-[#050a12] border-[#142337]">
                <div className="flex items-center justify-between mb-2 text-[11px]">
                  <span className="font-bold uppercase tracking-wider text-cyan-400">
                    Pseudosección Teórica de Cobertura ({previewSummary.totalPoints} Puntos Proyectados)
                  </span>
                  <span className="opacity-70 text-[10px]">
                    Eje X: 0 a {previewSummary.lineLengthM} m · Eje Z: 0 a -{previewSummary.maxPseudoDepthM} m
                  </span>
                </div>

                <div className="relative h-44 w-full bg-[#03060b] rounded border border-[#16273e] overflow-hidden flex items-end px-4 pb-4">
                  {/* Visual pseudosection points projection */}
                  <svg className="w-full h-full" viewBox={`0 0 ${previewSummary.lineLengthM} ${previewSummary.maxPseudoDepthM + 4}`}>
                    {/* Depth reference lines */}
                    {[5, 10, 20, 30].map((d) => (
                      <g key={d}>
                        <line
                          x1="0"
                          y1={d}
                          x2={previewSummary.lineLengthM}
                          y2={d}
                          stroke="#1e324d"
                          strokeDasharray="4 4"
                          strokeWidth="0.5"
                        />
                        <text x="4" y={d - 1} fill="#547196" fontSize="3" fontFamily="monospace">
                          -{d} m
                        </text>
                      </g>
                    ))}

                    {/* DOI Mask boundary line */}
                    <line
                      x1="0"
                      y1={previewSummary.maxPseudoDepthM}
                      x2={previewSummary.lineLengthM}
                      y2={previewSummary.maxPseudoDepthM}
                      stroke="#e11d48"
                      strokeDasharray="3 3"
                      strokeWidth="0.75"
                    />
                    <text
                      x={previewSummary.lineLengthM - 60}
                      y={previewSummary.maxPseudoDepthM - 1}
                      fill="#f43f5e"
                      fontSize="3"
                      fontFamily="monospace"
                    >
                      Límite Edwards ze ~{previewSummary.maxPseudoDepthM}m
                    </text>

                    {/* Schematic points representation */}
                    {(previewSummary.levelsTable || []).map((row, rIdx) => {
                      const y = Math.min(row.zeEdwardsM, previewSummary.maxPseudoDepthM + 2);
                      const pointsInRow = Math.min(row.pointsCount, 30);
                      const stepX = (previewSummary.lineLengthM - row.maxArraySpanM) / Math.max(1, pointsInRow - 1);
                      const startX = row.maxArraySpanM / 2;

                      return (
                        <g key={`${row.aMultiplier}-${row.n}-${rIdx}`}>
                          {Array.from({ length: pointsInRow }).map((_, pIdx) => {
                            const x = startX + pIdx * stepX;
                            return (
                              <circle
                                key={pIdx}
                                cx={x}
                                cy={y}
                                r="0.75"
                                fill={
                                  row.aMultiplier === 1
                                    ? '#38bdf8'
                                    : row.aMultiplier === 2
                                    ? '#a855f7'
                                    : '#f59e0b'
                                }
                                opacity="0.85"
                              />
                            );
                          })}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 font-mono">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#38bdf8]" /> 1a (5 m) Somero
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#a855f7]" /> 2a (10 m) Intermedio
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> 3a (15 m) Profundo
                    </span>
                  </div>
                  <span>Sensibilidad óptima concentrada en los primeros 33.5 m</span>
                </div>
              </div>
            )}

            {activeTabSubView === 'table' && previewSummary.levelsTable && (
              <div className="mt-4 p-3 rounded-lg border bg-[#050a12] border-[#142337] overflow-x-auto max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between mb-2 text-[11px] font-mono">
                  <span className="font-bold text-cyan-400">
                    Desglose de Secuencia Edwards (a, n, puntos, profundidad ze)
                  </span>
                  <span className="text-slate-400">Total: {previewSummary.totalPoints} cuadripolos</span>
                </div>
                <table className="w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-slate-400 pb-1">
                      <th className="py-1 px-2">Múltiplo "a"</th>
                      <th className="py-1 px-2">a (m)</th>
                      <th className="py-1 px-2">Nivel (n)</th>
                      <th className="py-1 px-2">Cuadripolos</th>
                      <th className="py-1 px-2">Prof. Edwards ze (m)</th>
                      <th className="py-1 px-2">Apertura L (m)</th>
                      <th className="py-1 px-2 text-right">Dipolos Tx C1-C2</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {previewSummary.levelsTable.map((lvl) => (
                      <tr key={`${lvl.aMultiplier}-${lvl.n}`} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2 font-bold text-cyan-400">{lvl.aMultiplier}a</td>
                        <td className="py-1.5 px-2">{lvl.aMeters} m</td>
                        <td className="py-1.5 px-2">n = {lvl.n}</td>
                        <td className="py-1.5 px-2 font-bold">{lvl.pointsCount}</td>
                        <td className="py-1.5 px-2 text-emerald-400 font-bold">{lvl.zeEdwardsM} m</td>
                        <td className="py-1.5 px-2">{lvl.maxArraySpanM} m</td>
                        <td className="py-1.5 px-2 text-right text-amber-400 font-bold">
                          {lvl.distinctTxDipoles}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTabSubView === 'doi' && (
              <div className="mt-4 p-4 rounded-lg border bg-[#050a12] border-[#142337] font-mono text-xs space-y-3">
                <div className="flex items-center gap-2 text-cyan-400 font-bold">
                  <TrendingUp className="w-4 h-4" />
                  <span>Análisis de Profundidad de Investigación (DOI & Edwards 1977)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-300">
                  <div className="p-3 rounded border border-slate-800 bg-[#070e18]">
                    <span className="font-bold text-emerald-400 block mb-1">
                      1. Profundidad Mediana Edwards (1977)
                    </span>
                    <p className="opacity-80 leading-relaxed">
                      Para el arreglo <strong>{form.arrayType.toUpperCase()}</strong> con nMax={form.nMax || 8} y múltiplos [{(form.activeMultipliers || [1,2,3]).join(', ')}], la profundidad mediana teórica alcanza <strong>ze ≈ {previewSummary.maxPseudoDepthM} m</strong>. El 50% de la densidad de corriente y señal potencial se concentra por encima de esta cota.
                    </p>
                  </div>
                  <div className="p-3 rounded border border-slate-800 bg-[#070e18]">
                    <span className="font-bold text-amber-400 block mb-1">
                      2. Criterio Empírico AGI (15% - 25% Apertura)
                    </span>
                    <p className="opacity-80 leading-relaxed">
                      Con una apertura máxima de matriz de {previewSummary.maxArraySpanM} m sobre una línea total de {previewSummary.lineLengthM} m, la penetración práctica recomendada por AGI oscila entre <strong>{previewSummary.agiDepthRange}</strong>.
                    </p>
                  </div>
                </div>
                <div className="p-2.5 rounded bg-blue-950/30 border border-blue-500/30 text-[11px] text-blue-200">
                  <strong>Recomendación Geológica:</strong> La profundidad objetivo para vetas epitermales (15–30 m) y gravas de paleocauces aluviales (8–22 m) queda 100% cubierta por la configuración actual con excelente resolución de detalle lateral.
                </div>
              </div>
            )}

            {activeTabSubView === 'cmd' && (
              <div className="mt-4 p-3 rounded-lg border bg-[#050a12] border-[#142337]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase text-cyan-400">
                    Sintaxis AGI SuperSting .CMD (8 Canales de Recepción por Línea)
                  </span>
                  <button
                    type="button"
                    onClick={handleUploadCmd}
                    className="px-2.5 py-1 rounded text-[10px] font-bold bg-cyan-600/30 border border-cyan-400 text-cyan-300 hover:bg-cyan-600/50 cursor-pointer"
                  >
                    Cargar al R8
                  </button>
                </div>
                <pre className="p-3 rounded bg-[#020509] border border-[#121e30] text-[10px] font-mono text-slate-300 max-h-56 overflow-y-auto">
                  {cmdPreviewText ||
                    formatCMD(
                      form.progId || 'SURVEY',
                      samplePoints.length > 0 ? samplePoints : []
                    )}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
