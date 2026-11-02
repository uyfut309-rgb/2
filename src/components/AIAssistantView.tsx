import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Bot,
  RefreshCw,
  Pickaxe,
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Sliders,
  AlertTriangle,
  Compass,
  FileText,
  ShieldAlert,
  WifiOff,
  Cloud,
  Plus,
  Trash2,
  Edit2,
  Check,
  Eye,
} from 'lucide-react';
import { estimate2DInversion, QuadripolePoint } from '../utils/ert-math';
import {
  PetrophysicalUnit,
  PriorDrillhole,
  SuggestedDrillhole,
  AnomalyZone,
  InterpretationHistoryItem,
  IP_MEASUREMENT_STANDARD,
  loadProjectPetrophysics,
  saveProjectPetrophysics,
  loadPriorDrillholes,
  savePriorDrillholes,
  loadInterpretationHistory,
  saveInterpretationHistoryItem,
  loadAcceptedDrillholes,
  saveAcceptedDrillholes,
  DEFAULT_HARDROCK_UNITS,
  DEFAULT_ALLUVIAL_UNITS,
} from '../utils/petrophysics';
import { runDeterministicMiningInterpretation } from '../utils/mining-ai-engine';

interface AIAssistantViewProps {
  surveyConfig: any;
  pointsCount: number;
  contactSummary: any;
  points: QuadripolePoint[];
  isSunlightMode: boolean;
  onAcceptedDrillholesChange?: (drillholes: SuggestedDrillhole[]) => void;
  acceptedDrillholes?: SuggestedDrillhole[];
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  surveyConfig,
  pointsCount,
  contactSummary,
  points,
  isSunlightMode,
  onAcceptedDrillholesChange,
  acceptedDrillholes: initialAcceptedDrillholes,
}) => {
  // State
  const [petroUnits, setPetroUnits] = useState<PetrophysicalUnit[]>(() => loadProjectPetrophysics());
  const [priorDrillholes, setPriorDrillholes] = useState<PriorDrillhole[]>(() => loadPriorDrillholes());
  const [suggestedDrillholes, setSuggestedDrillholes] = useState<SuggestedDrillhole[]>([]);
  const [anomalyZones, setAnomalyZones] = useState<AnomalyZone[]>([]);
  const [acceptedDrillholes, setAcceptedDrillholes] = useState<SuggestedDrillhole[]>(
    () => initialAcceptedDrillholes || loadAcceptedDrillholes()
  );
  const [history, setHistory] = useState<InterpretationHistoryItem[]>(() => loadInterpretationHistory());

  const [reportText, setReportText] = useState<string | null>(null);
  const [source, setSource] = useState<'gemini' | 'offline_heuristic' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [forceOffline, setForceOffline] = useState(false);

  // Modals & Panels
  const [showPetroEditor, setShowPetroEditor] = useState(false);
  const [showPriorDrillModal, setShowPriorDrillModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState<AnomalyZone | null>(null);

  // New Prior Drillhole Form State
  const [newDrillName, setNewDrillName] = useState('');
  const [newDrillX, setNewDrillX] = useState(120);
  const [newDrillElev, setNewDrillElev] = useState(3860);
  const [newDrillDepth, setNewDrillDepth] = useState(40);
  const [newDrillDip, setNewDrillDip] = useState(-60);
  const [newDrillAzimuth, setNewDrillAzimuth] = useState(90);
  const [newDrillNotes, setNewDrillNotes] = useState('');

  // 2D Inversion calculation
  const inversion = useMemo(() => {
    return estimate2DInversion(points, { iterations: 3 });
  }, [points]);

  // Sync accepted drillholes with parent and localStorage
  const updateAcceptedDrillholes = (updated: SuggestedDrillhole[]) => {
    setAcceptedDrillholes(updated);
    saveAcceptedDrillholes(updated);
    if (onAcceptedDrillholesChange) {
      onAcceptedDrillholesChange(updated);
    }
  };

  const handleAcceptDrillhole = (drill: SuggestedDrillhole) => {
    const isAlreadyAccepted = acceptedDrillholes.some((d) => d.id === drill.id);
    let updated: SuggestedDrillhole[];
    if (isAlreadyAccepted) {
      updated = acceptedDrillholes.filter((d) => d.id !== drill.id);
    } else {
      const acceptedItem: SuggestedDrillhole = {
        ...drill,
        status: 'accepted',
        acceptedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      updated = [acceptedItem, ...acceptedDrillholes.filter((d) => d.id !== drill.id)];
    }
    updateAcceptedDrillholes(updated);

    // Update in suggested list
    setSuggestedDrillholes((prev) =>
      prev.map((d) => (d.id === drill.id ? { ...d, status: isAlreadyAccepted ? 'pending' : 'accepted' } : d))
    );
  };

  const handleRejectDrillhole = (drillId: string) => {
    setSuggestedDrillholes((prev) =>
      prev.map((d) => (d.id === drillId ? { ...d, status: 'rejected' } : d))
    );
    const updated = acceptedDrillholes.filter((d) => d.id !== drillId);
    updateAcceptedDrillholes(updated);
  };

  // Run Interpretation (Offline-First with Online Gemini Fallback)
  const handleInterpret = async () => {
    setIsLoading(true);
    try {
      const offlineOutput = runDeterministicMiningInterpretation({
        jobName: surveyConfig.jobName,
        surveyConfig,
        points,
        inversionResult: inversion,
        petrophysicalUnits: petroUnits,
        priorDrillholes,
      });

      // Synchronize status with currently accepted drillholes
      const reconciledDrillholes = offlineOutput.suggestedDrillholes.map((d) => {
        const isAccepted = acceptedDrillholes.some((a) => a.id === d.id);
        return {
          ...d,
          status: isAccepted ? ('accepted' as const) : d.status,
        };
      });

      if (forceOffline) {
        setReportText(offlineOutput.executiveSummary);
        setSource('offline_heuristic');
        setAnomalyZones(offlineOutput.anomalyZones);
        setSuggestedDrillholes(reconciledDrillholes);

        const historyItem: InterpretationHistoryItem = {
          id: `eval-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          jobName: surveyConfig.jobName,
          source: 'offline_heuristic',
          rmsError: offlineOutput.rmsError,
          pointsAnalyzed: points.length,
          zonesCount: offlineOutput.anomalyZones.length,
          anomalyZones: offlineOutput.anomalyZones,
          suggestedDrillholes: reconciledDrillholes,
          executiveSummary: offlineOutput.executiveSummary,
          status: 'completed',
        };
        saveInterpretationHistoryItem(historyItem);
        setHistory(loadInterpretationHistory());
        return;
      }

      // Online Gemini Attempt
      try {
        const payload = {
          summary: {
            jobName: surveyConfig.jobName,
            arrayType: surveyConfig.arrayType,
            electrodes: surveyConfig.electrodes,
            spacing: surveyConfig.spacing,
            measuredPoints: pointsCount,
            totalLineMeters: (surveyConfig.electrodes - 1) * surveyConfig.spacing,
            targetMineralization: surveyConfig.targetMineralization,
            maxCurrentMA: surveyConfig.maxCurrent,
          },
          anomalies: {
            apparent: {
              minResistivity: Math.min(...points.map((p) => p.rho).filter((r) => r > 0)),
              maxResistivity: Math.max(...points.map((p) => p.rho).filter((r) => r > 0)),
              maxChargeability: Math.max(...points.map((p) => p.ip || 0)),
            },
            invertedTrue: {
              rmsErrorPct: inversion.rmsError,
              zonesCount: offlineOutput.anomalyZones.length,
            },
          },
          badElectrodes: contactSummary?.badElectrodes || [],
          miningTargets: offlineOutput.anomalyZones,
          priorDrillholes,
          petrophysicalUnits: petroUnits,
          invertedModel: inversion.targets,
        };

        const res = await fetch('/api/assistant/interpret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.status === 'ok') {
          setReportText(data.interpretation);
          setSource(data.source === 'gemini' ? 'gemini' : 'offline_heuristic');
          setAnomalyZones(offlineOutput.anomalyZones);
          setSuggestedDrillholes(reconciledDrillholes);

          const historyItem: InterpretationHistoryItem = {
            id: `eval-${Date.now()}`,
            timestamp: new Date().toLocaleString(),
            jobName: surveyConfig.jobName,
            source: data.source === 'gemini' ? 'gemini' : 'offline_heuristic',
            rmsError: offlineOutput.rmsError,
            pointsAnalyzed: points.length,
            zonesCount: offlineOutput.anomalyZones.length,
            anomalyZones: offlineOutput.anomalyZones,
            suggestedDrillholes: reconciledDrillholes,
            executiveSummary: data.interpretation,
            status: 'completed',
          };
          saveInterpretationHistoryItem(historyItem);
          setHistory(loadInterpretationHistory());
          return;
        }
      } catch (cloudErr) {
        console.warn('Cloud API failed or unreachable, using offline engine:', cloudErr);
      }

      // Offline Fallback
      setReportText(offlineOutput.executiveSummary);
      setSource('offline_heuristic');
      setAnomalyZones(offlineOutput.anomalyZones);
      setSuggestedDrillholes(reconciledDrillholes);

      const historyItem: InterpretationHistoryItem = {
        id: `eval-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        jobName: surveyConfig.jobName,
        source: 'offline_heuristic',
        rmsError: offlineOutput.rmsError,
        pointsAnalyzed: points.length,
        zonesCount: offlineOutput.anomalyZones.length,
        anomalyZones: offlineOutput.anomalyZones,
        suggestedDrillholes: reconciledDrillholes,
        executiveSummary: offlineOutput.executiveSummary,
        status: 'completed',
      };
      saveInterpretationHistoryItem(historyItem);
      setHistory(loadInterpretationHistory());
    } catch (err) {
      console.error('Fatal interpretation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Add a Prior Drillhole
  const handleAddPriorDrillhole = () => {
    if (!newDrillName.trim()) return;
    const newDrill: PriorDrillhole = {
      id: `ddh-user-${Date.now()}`,
      name: newDrillName.trim(),
      collarX: Number(newDrillX),
      collarElevationM: Number(newDrillElev),
      depthM: Number(newDrillDepth),
      dipDeg: Number(newDrillDip),
      azimuthDeg: Number(newDrillAzimuth),
      lithologyIntercepts: [
        {
          fromM: 0,
          toM: Number(newDrillDepth),
          lithology: newDrillNotes || 'Manto mineralizado y roca huésped',
        },
      ],
      notes: newDrillNotes || 'Sondaje de validación de terreno',
    };
    const updated = [newDrill, ...priorDrillholes];
    setPriorDrillholes(updated);
    savePriorDrillholes(updated);
    setNewDrillName('');
    setNewDrillNotes('');
    setShowPriorDrillModal(false);
  };

  // Delete a Prior Drillhole
  const handleDeletePriorDrillhole = (id: string) => {
    const updated = priorDrillholes.filter((d) => d.id !== id);
    setPriorDrillholes(updated);
    savePriorDrillholes(updated);
  };

  // Update a Petrophysical Unit
  const handleUpdateUnit = (
    id: string,
    field: 'minResistivity' | 'maxResistivity' | 'minChargeability' | 'maxChargeability',
    value: number
  ) => {
    const updated = petroUnits.map((u) => (u.id === id ? { ...u, [field]: value } : u));
    setPetroUnits(updated);
    saveProjectPetrophysics(updated);
  };

  // Reset Petrophysical Units to standard
  const handleResetPetrophysics = () => {
    const standard = [...DEFAULT_HARDROCK_UNITS, ...DEFAULT_ALLUVIAL_UNITS];
    setPetroUnits(standard);
    saveProjectPetrophysics(standard);
  };

  return (
    <div className="space-y-4 pb-12">
      {/* 1. Header Card with Geophysical Context & Actions */}
      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        <div
          className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 mb-4 ${
            isSunlightMode ? 'border-black' : 'border-[#1b2b41]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-xl border flex items-center justify-center shrink-0 ${
                isSunlightMode
                  ? 'bg-amber-300 border-black text-black'
                  : 'bg-amber-600/20 text-amber-400 border-amber-500/30'
              }`}
            >
              <Pickaxe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-tight flex items-center gap-1.5">
                  Interpretación ERT/IP & Blancos de Sondaje
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-black border ${
                    isSunlightMode
                      ? 'bg-amber-300 text-black border-black'
                      : 'bg-amber-950/80 text-amber-300 border-amber-700'
                  }`}
                >
                  SuperSting R8/IP
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border flex items-center gap-1 ${
                    forceOffline || source === 'offline_heuristic'
                      ? isSunlightMode
                        ? 'bg-slate-200 text-black border-black'
                        : 'bg-slate-800 text-cyan-300 border-cyan-500/40'
                      : isSunlightMode
                      ? 'bg-emerald-100 text-emerald-950 border-black'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50'
                  }`}
                >
                  {forceOffline ? <WifiOff className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
                  {forceOffline ? 'Modo Offline (Campo)' : 'Enlace Minero Activo'}
                </span>
              </div>
              <p className={`text-xs mt-1 ${isSunlightMode ? 'text-black font-semibold' : 'text-slate-300'}`}>
                Modelo 2D invertido (ρ true, IP true), correlación con sondajes previos y cálculo de trayectorias.
              </p>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Offline Toggle */}
            <button
              onClick={() => setForceOffline(!forceOffline)}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold border flex items-center gap-1.5 cursor-pointer min-h-[44px] transition-colors ${
                forceOffline
                  ? isSunlightMode
                    ? 'bg-black text-white border-black'
                    : 'bg-cyan-900/60 text-cyan-200 border-cyan-400'
                  : isSunlightMode
                  ? 'bg-white text-black border-black hover:bg-slate-100'
                  : 'bg-[#101b2c] text-slate-300 border-[#223552] hover:bg-[#182942]'
              }`}
              title="Alternar entre motor heurístico local de terreno y modelo en la nube"
            >
              {forceOffline ? <WifiOff className="w-4 h-4 text-cyan-400" /> : <Cloud className="w-4 h-4 text-slate-400" />}
              <span>{forceOffline ? 'Modo Offline Forzado' : 'Modo Nube Habilitado'}</span>
            </button>

            {/* Petrophysical Table Editor Toggle */}
            <button
              onClick={() => setShowPetroEditor(!showPetroEditor)}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold border flex items-center gap-1.5 cursor-pointer min-h-[44px] transition-colors ${
                showPetroEditor
                  ? isSunlightMode
                    ? 'bg-amber-300 text-black border-black'
                    : 'bg-amber-600 text-white border-amber-400'
                  : isSunlightMode
                  ? 'bg-white text-black border-black hover:bg-slate-100'
                  : 'bg-[#101b2c] text-slate-300 border-[#223552] hover:bg-[#182942]'
              }`}
            >
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Tabla Petrofísica</span>
            </button>

            {/* Prior Drillholes Toggle */}
            <button
              onClick={() => setShowPriorDrillModal(true)}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-bold border flex items-center gap-1.5 cursor-pointer min-h-[44px] transition-colors ${
                isSunlightMode
                  ? 'bg-white text-black border-black hover:bg-slate-100'
                  : 'bg-[#101b2c] text-slate-300 border-[#223552] hover:bg-[#182942]'
              }`}
            >
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Sondajes Previos ({priorDrillholes.length})</span>
            </button>

            {/* Interpretation History Button */}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistoryModal(true)}
                className={`px-3 py-2 rounded-lg text-xs font-mono font-bold border flex items-center gap-1.5 cursor-pointer min-h-[44px] transition-colors ${
                  isSunlightMode
                    ? 'bg-white text-black border-black hover:bg-slate-100'
                    : 'bg-[#101b2c] text-slate-300 border-[#223552] hover:bg-[#182942]'
                }`}
              >
                <Clock className="w-4 h-4 text-sky-400" />
                <span>Historial ({history.length})</span>
              </button>
            )}

            {/* Main Trigger Button */}
            <button
              onClick={handleInterpret}
              disabled={isLoading || pointsCount === 0}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all shadow-xl min-h-[48px] border cursor-pointer ${
                pointsCount === 0
                  ? isSunlightMode
                    ? 'bg-slate-200 text-slate-500 border-slate-400 cursor-not-allowed'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700'
                  : isLoading
                  ? 'bg-amber-800 text-white animate-pulse'
                  : isSunlightMode
                  ? 'bg-amber-400 hover:bg-amber-500 text-black border-black shadow-lg font-black'
                  : 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 shadow-amber-950/40'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Invertiendo & Delineando Blancos...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  Interpretar Perfil ({pointsCount} Puntos)
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Standardized IP & QC Banner */}
        <div
          className={`grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3 rounded-lg border text-xs font-mono ${
            isSunlightMode ? 'bg-amber-50 border-black text-black' : 'bg-[#08121f] border-[#182b47] text-slate-200'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider block opacity-70">
              Estándar de Polarización Inducida (IP):
            </span>
            <strong className="text-amber-500 block">{IP_MEASUREMENT_STANDARD.windowDefinition}</strong>
            <span className="text-[10px] opacity-80">Ciclo {IP_MEASUREMENT_STANDARD.totalCycleSec}s (Bipolar) · Rechazo {IP_MEASUREMENT_STANDARD.noiseRejection}</span>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider block opacity-70">
              Rango Numérico Calibrado Halo IP:
            </span>
            <strong className="text-cyan-400 block">{IP_MEASUREMENT_STANDARD.haloIpRange}</strong>
            <span className="text-[10px] opacity-80">Sulfuros masivos: &gt; 45 mV/V · Fondo estéril: &lt; 5 mV/V</span>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider block opacity-70">
              Convergencia Inversión 2D:
            </span>
            <strong className="text-emerald-400 block">
              RMS = {inversion.rmsError}% ({inversion.iteration || 3} Iteraciones)
            </strong>
            <span className="text-[10px] opacity-80">
              {acceptedDrillholes.length} Sondaje(s) trazado(s) en sección
            </span>
          </div>
        </div>

        {/* Prominent Legal Disclaimer */}
        <div
          className={`mt-3 p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
            isSunlightMode ? 'bg-yellow-100 border-black text-black' : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <p className="leading-snug">
            <strong>Aviso Geológico-Legal de Terreno:</strong> Este módulo calcula y sugiere blancos lito-estructurales y
            trayectorias orientativas a partir del modelo invertido 2D. <em>Sugiere, no decide sondajes.</em> La decisión
            y firma final de los puntos de perforación es competencia exclusiva del geólogo o geofísico colegiado a cargo.
          </p>
        </div>
      </div>

      {/* 3. Project Petrophysical Editor Drawer (When Open) */}
      {showPetroEditor && (
        <div
          className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-all ${
            isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0d1726] border-[#22395b] text-white'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Tabla Petrofísica Unificada del Proyecto (Editable)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetPetrophysics}
                className="px-2.5 py-1 rounded text-xs font-mono font-bold border border-slate-500 hover:bg-slate-700/40 cursor-pointer min-h-[44px]"
              >
                Restablecer Valores Estándar
              </button>
              <button
                onClick={() => setShowPetroEditor(false)}
                className="px-3 py-1 rounded text-xs font-mono font-bold bg-amber-600 text-white cursor-pointer min-h-[44px]"
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>

          <p className="text-xs mb-3 opacity-80">
            Define los rangos físicos que comparten Adquisición, Oro Aluvial, Tendido e IA Minera para evitar contradicciones:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className={`border-b ${isSunlightMode ? 'border-black bg-slate-100' : 'border-[#1b2b41] bg-[#08101a]'}`}>
                  <th className="p-2">Litología / Unidad</th>
                  <th className="p-2">Ambiente</th>
                  <th className="p-2">ρ Mín (Ω·m)</th>
                  <th className="p-2">ρ Máx (Ω·m)</th>
                  <th className="p-2">IP Mín (mV/V)</th>
                  <th className="p-2">IP Máx (mV/V)</th>
                  <th className="p-2">Rol Geológico</th>
                </tr>
              </thead>
              <tbody>
                {petroUnits.map((u) => (
                  <tr
                    key={u.id}
                    className={`border-b ${
                      isSunlightMode ? 'border-slate-300 hover:bg-slate-50' : 'border-[#16253b] hover:bg-[#101c2e]'
                    }`}
                  >
                    <td className="p-2 font-bold flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: u.color }} />
                      <span>{u.name}</span>
                    </td>
                    <td className="p-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-black/20 border border-slate-600">
                        {u.environment === 'hardrock' ? 'Roca Dura' : 'Aluvial'}
                      </span>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={u.minResistivity}
                        onChange={(e) => handleUpdateUnit(u.id, 'minResistivity', Number(e.target.value))}
                        className={`w-20 px-1.5 py-1 rounded border text-xs font-bold ${
                          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080e18] border-[#22395b] text-white'
                        }`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={u.maxResistivity}
                        onChange={(e) => handleUpdateUnit(u.id, 'maxResistivity', Number(e.target.value))}
                        className={`w-20 px-1.5 py-1 rounded border text-xs font-bold ${
                          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080e18] border-[#22395b] text-white'
                        }`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={u.minChargeability}
                        onChange={(e) => handleUpdateUnit(u.id, 'minChargeability', Number(e.target.value))}
                        className={`w-16 px-1.5 py-1 rounded border text-xs font-bold ${
                          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080e18] border-[#22395b] text-white'
                        }`}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={u.maxChargeability}
                        onChange={(e) => handleUpdateUnit(u.id, 'maxChargeability', Number(e.target.value))}
                        className={`w-16 px-1.5 py-1 rounded border text-xs font-bold ${
                          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080e18] border-[#22395b] text-white'
                        }`}
                      />
                    </td>
                    <td className="p-2 text-[11px] opacity-85 truncate max-w-[200px]" title={u.geologicalRole}>
                      {u.geologicalRole}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Structured Output: Delineated Anomaly Zones & Suggested Drillholes */}
      {anomalyZones.length > 0 && (
        <div className="space-y-4">
          {/* A. Delineated Anomaly Zones Table */}
          <div
            className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
            }`}
          >
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Zonas de Anomalía Delineadas en Inversión 2D ({anomalyZones.length})
                </h3>
              </div>
              <span className="text-xs font-mono opacity-70">
                Coordenadas referidas al inicio de línea (X=0m)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {anomalyZones.map((zone) => {
                const isSelected = selectedZone?.id === zone.id;
                return (
                  <div
                    key={zone.id}
                    onClick={() => setSelectedZone(isSelected ? null : zone)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? isSunlightMode
                          ? 'bg-amber-100 border-black ring-2 ring-black'
                          : 'bg-[#122238] border-amber-400 ring-1 ring-amber-400'
                        : isSunlightMode
                        ? 'bg-slate-50 border-black hover:bg-slate-100'
                        : 'bg-[#09111c] border-[#1a2c47] hover:bg-[#0e1b2e]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-black border ${
                            zone.priority === 'ALTA'
                              ? isSunlightMode
                                ? 'bg-rose-200 text-rose-950 border-black'
                                : 'bg-rose-950 text-rose-300 border-rose-600'
                              : isSunlightMode
                              ? 'bg-amber-200 text-amber-950 border-black'
                              : 'bg-amber-950 text-amber-300 border-amber-600'
                          }`}
                        >
                          PRIORIDAD {zone.priority}
                        </span>
                        <span className="text-xs font-bold truncate max-w-[210px]">{zone.title}</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {zone.confidencePct}% Confiabilidad
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono mt-2 mb-2">
                      <div className="p-1.5 rounded bg-black/20 border border-slate-700">
                        <span className="text-[10px] opacity-60 block">Extensión X:</span>
                        <strong>{zone.xRange[0]}m - {zone.xRange[1]}m</strong>
                      </div>
                      <div className="p-1.5 rounded bg-black/20 border border-slate-700">
                        <span className="text-[10px] opacity-60 block">Profundidad Z:</span>
                        <strong>{zone.zRange[0]}m - {zone.zRange[1]}m</strong>
                      </div>
                      <div className="p-1.5 rounded bg-black/20 border border-slate-700">
                        <span className="text-[10px] opacity-60 block">ρ True:</span>
                        <strong className="text-amber-400">{zone.meanTrueRho} Ω·m</strong>
                      </div>
                      <div className="p-1.5 rounded bg-black/20 border border-slate-700">
                        <span className="text-[10px] opacity-60 block">IP True:</span>
                        <strong className="text-cyan-400">{zone.meanTrueIP} mV/V</strong>
                      </div>
                    </div>

                    <p className="text-xs opacity-85 leading-relaxed">{zone.geologicalInterpretation}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* B. Suggested Drillholes with Interactive Accept / Reject */}
          <div
            className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    Sondajes Diamantinos Sugeridos (Recomendaciones de Perforación)
                  </h3>
                  <p className="text-xs opacity-75">
                    Acepta o descarta las trayectorias para trazarlas automáticamente sobre la sección 2D.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/50">
                  {acceptedDrillholes.length} Aceptados en Perfil
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {suggestedDrillholes.map((drill) => {
                const isAccepted = acceptedDrillholes.some((d) => d.id === drill.id);
                return (
                  <div
                    key={drill.id}
                    className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                      isAccepted
                        ? isSunlightMode
                          ? 'bg-emerald-50 border-black ring-2 ring-emerald-600'
                          : 'bg-[#0a1e16] border-emerald-400 ring-1 ring-emerald-400'
                        : drill.status === 'rejected'
                        ? 'opacity-60 bg-slate-900 border-slate-800'
                        : isSunlightMode
                        ? 'bg-slate-50 border-black'
                        : 'bg-[#09111c] border-[#18283f]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                              isAccepted
                                ? 'bg-emerald-500 text-black border-black font-black'
                                : 'bg-slate-800 text-slate-300 border-slate-600'
                            }`}
                          >
                            {drill.name}
                          </span>
                          <span className="text-xs font-mono opacity-80">
                            {drill.targetAnomalyTitle}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            isAccepted
                              ? 'bg-emerald-400 text-black'
                              : drill.status === 'rejected'
                              ? 'bg-rose-900 text-rose-300'
                              : 'bg-amber-900 text-amber-300'
                          }`}
                        >
                          {isAccepted ? 'ACEPTADO' : drill.status === 'rejected' ? 'DESCARTADO' : 'PENDIENTE'}
                        </span>
                      </div>

                      {/* Technical Drillhole Specifications */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono my-3">
                        <div className="p-2 rounded bg-black/25 border border-slate-700">
                          <span className="text-[10px] opacity-60 block">Collar X:</span>
                          <strong className="text-amber-400">{drill.collarX} m</strong>
                        </div>
                        <div className="p-2 rounded bg-black/25 border border-slate-700">
                          <span className="text-[10px] opacity-60 block">Cota Collar:</span>
                          <strong>{drill.collarElevationM} msnm</strong>
                        </div>
                        <div className="p-2 rounded bg-black/25 border border-slate-700">
                          <span className="text-[10px] opacity-60 block">Inclinación (Dip):</span>
                          <strong className="text-cyan-400">{drill.dipDeg}°</strong>
                        </div>
                        <div className="p-2 rounded bg-black/25 border border-slate-700">
                          <span className="text-[10px] opacity-60 block">Azimut:</span>
                          <strong>{drill.azimuthDeg}°</strong>
                        </div>
                        <div className="p-2 rounded bg-black/25 border border-slate-700">
                          <span className="text-[10px] opacity-60 block">Longitud Obj.:</span>
                          <strong className="text-emerald-400">{drill.targetDepthM} m</strong>
                        </div>
                      </div>

                      <p className="text-xs opacity-90 leading-relaxed mb-4">
                        <strong>Objetivo Geológico:</strong> {drill.objectiveText}
                      </p>
                    </div>

                    {/* Accept / Reject Action Buttons (Min height 48px for tactile gloves) */}
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-700/50">
                      <button
                        onClick={() => handleAcceptDrillhole(drill)}
                        className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer min-h-[48px] transition-all shadow-md ${
                          isAccepted
                            ? isSunlightMode
                              ? 'bg-emerald-600 text-white border-2 border-black'
                              : 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : isSunlightMode
                            ? 'bg-emerald-400 hover:bg-emerald-500 text-black border-2 border-black font-black'
                            : 'bg-emerald-600/80 hover:bg-emerald-600 text-white border border-emerald-400'
                        }`}
                      >
                        {isAccepted ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-white" />
                            <span>Trazado en Sección (Clic para Desmarcar)</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Aceptar / Trazar Sondaje en Sección</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleRejectDrillhole(drill.id)}
                        className={`py-3 px-4 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px] border transition-colors ${
                          isSunlightMode
                            ? 'bg-slate-200 hover:bg-slate-300 text-black border-black'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                        title="Rechazar este sondaje para no considerarlo en la campaña"
                      >
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span>Rechazar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. Executive Written Report View */}
      {reportText && (
        <div
          className={`rounded-xl border p-5 shadow-xl transition-colors ${
            isSunlightMode ? 'bg-slate-50 border-black text-black' : 'bg-[#070e17] border-amber-500/40 text-slate-200'
          }`}
        >
          <div
            className={`flex items-center justify-between mb-3 border-b pb-2 text-xs font-bold ${
              isSunlightMode ? 'border-black' : 'border-[#17273e]'
            }`}
          >
            <span className="flex items-center gap-1.5 text-amber-500">
              <FileText className="w-4 h-4 text-amber-400" />
              Informe Geofísico-Minero Consolidado & Blancos de Sondaje
            </span>
            <span className="text-[11px] font-mono opacity-80">
              {source === 'gemini' ? 'Motor Gemini 2.5 Flash (Nube)' : 'Motor Heurístico Geofísico de Terreno (Offline)'}
            </span>
          </div>

          <div className="text-xs sm:text-sm leading-relaxed space-y-3 whitespace-pre-wrap font-sans font-medium">
            {reportText}
          </div>
        </div>
      )}

      {/* 6. Prior Drillholes Modal */}
      {showPriorDrillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0c1626] border-[#22395b] text-white'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-extrabold uppercase">Sondajes Previos de Validación Geológica</h3>
              </div>
              <button
                onClick={() => setShowPriorDrillModal(false)}
                className="p-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <p className="text-xs mb-4 opacity-80">
              Registra los sondajes diamantinos existentes en la zona para que el modelo IA y el motor geofísico correlacionen
              la resistividad y cargabilidad con litologías reales perforadas.
            </p>

            {/* List of Prior Drillholes */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
              {priorDrillholes.map((d) => (
                <div
                  key={d.id}
                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                    isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#08101a] border-[#1a2d48]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-xs font-bold text-amber-400">{d.name}</strong>
                      <span className="text-[11px] font-mono opacity-70">
                        X={d.collarX}m · Cota={d.collarElevationM}m · Prof={d.depthM}m (Dip {d.dipDeg}°)
                      </span>
                    </div>
                    <p className="text-xs opacity-90">{d.notes}</p>
                    {d.lithologyIntercepts.length > 0 && (
                      <div className="text-[11px] font-mono opacity-80 pt-1">
                        {d.lithologyIntercepts.map((int, i) => (
                          <div key={i}>
                            • {int.fromM}m - {int.toM}m: {int.lithology}{' '}
                            {int.assayAuGpt ? `(${int.assayAuGpt} g/t Au)` : ''}
                            {int.assayCuPct ? `(${int.assayCuPct}% Cu)` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeletePriorDrillhole(d.id)}
                    className="p-2 text-rose-400 hover:text-rose-300 cursor-pointer min-h-[44px]"
                    title="Eliminar sondaje"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Prior Drillhole Form */}
            <div
              className={`p-3 rounded-xl border space-y-2.5 text-xs font-mono ${
                isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#09121f] border-[#1b2b41]'
              }`}
            >
              <span className="font-bold uppercase tracking-wider block text-cyan-400">
                + Añadir Nuevo Sondaje de Validación:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] opacity-60 block">Nombre / ID:</label>
                  <input
                    type="text"
                    placeholder="DDH-24-03"
                    value={newDrillName}
                    onChange={(e) => setNewDrillName(e.target.value)}
                    className={`w-full p-1.5 rounded border text-xs font-bold ${
                      isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#070b12] border-slate-700'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[10px] opacity-60 block">Estación Collar X (m):</label>
                  <input
                    type="number"
                    value={newDrillX}
                    onChange={(e) => setNewDrillX(Number(e.target.value))}
                    className={`w-full p-1.5 rounded border text-xs font-bold ${
                      isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#070b12] border-slate-700'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[10px] opacity-60 block">Cota Collar (msnm):</label>
                  <input
                    type="number"
                    value={newDrillElev}
                    onChange={(e) => setNewDrillElev(Number(e.target.value))}
                    className={`w-full p-1.5 rounded border text-xs font-bold ${
                      isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#070b12] border-slate-700'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[10px] opacity-60 block">Profundidad (m):</label>
                  <input
                    type="number"
                    value={newDrillDepth}
                    onChange={(e) => setNewDrillDepth(Number(e.target.value))}
                    className={`w-full p-1.5 rounded border text-xs font-bold ${
                      isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#070b12] border-slate-700'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] opacity-60 block">Resumen Litológico & Leyes Interceptadas:</label>
                <input
                  type="text"
                  placeholder="Ej: Interceptó veta cuarzo a 28m con 3.1 g/t Au y halo de sulfuros"
                  value={newDrillNotes}
                  onChange={(e) => setNewDrillNotes(e.target.value)}
                  className={`w-full p-1.5 rounded border text-xs ${
                    isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#070b12] border-slate-700'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={handleAddPriorDrillhole}
                  disabled={!newDrillName.trim()}
                  className={`px-4 py-2 rounded-lg text-xs font-bold min-h-[44px] cursor-pointer ${
                    !newDrillName.trim()
                      ? 'opacity-40 cursor-not-allowed bg-slate-700 text-slate-400'
                      : isSunlightMode
                      ? 'bg-black text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  Registrar Sondaje
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-5 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0c1626] border-[#22395b] text-white'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-extrabold uppercase">Historial de Interpretaciones</h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-lg border border-slate-600 hover:bg-slate-800 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {history.map((h) => (
                <div
                  key={h.id}
                  onClick={() => {
                    setReportText(h.executiveSummary);
                    setAnomalyZones(h.anomalyZones);
                    setSuggestedDrillholes(h.suggestedDrillholes);
                    setSource(h.source);
                    setShowHistoryModal(false);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSunlightMode
                      ? 'bg-slate-50 border-black hover:bg-slate-100'
                      : 'bg-[#08101a] border-[#192b45] hover:bg-[#101f35]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <strong className="text-xs text-amber-400">{h.jobName}</strong>
                    <span className="text-[11px] font-mono opacity-60">{h.timestamp}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono opacity-80">
                    <span>{h.pointsAnalyzed} Puntos</span>
                    <span>RMS: {h.rmsError}%</span>
                    <span>{h.zonesCount} Blancos detectados</span>
                    <span className="text-cyan-400 font-bold uppercase">{h.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
