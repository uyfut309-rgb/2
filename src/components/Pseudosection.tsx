import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  QuadripolePoint,
  estimate2DInversion,
  getCalibratedColor,
  getContourTickValues,
  ColorScaleConfig,
  MiningTargetAnomaly,
} from '../utils/ert-math';
import { SuggestedDrillhole } from '../utils/petrophysics';
import { FieldNote } from './FieldNotesModal';
import { IPDecayCurveView } from './IPDecayCurveView';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  Zap,
  Mountain,
  Palette,
  Target,
  Sparkles,
  Gauge,
  Sliders,
  Crosshair,
  Compass,
} from 'lucide-react';
import { beeper } from '../utils/audio-beeper';

interface PseudosectionProps {
  points: QuadripolePoint[];
  totalElectrodes: number;
  spacing: number;
  activeElectrodes: { tx: number[]; rx: number[] };
  selectedPoint: QuadripolePoint | null;
  onSelectPoint: (p: QuadripolePoint | null) => void;
  viewMode: 'rho' | 'ip';
  onToggleViewMode: (mode: 'rho' | 'ip') => void;
  errorThreshold: number;
  isSunlightMode: boolean;
  fieldNotes?: FieldNote[];
  lastBatch?: QuadripolePoint[];
  acceptedDrillholes?: SuggestedDrillhole[];
}

export const Pseudosection: React.FC<PseudosectionProps> = ({
  points,
  totalElectrodes,
  spacing,
  activeElectrodes,
  selectedPoint,
  onSelectPoint,
  viewMode,
  onToggleViewMode,
  errorThreshold,
  isSunlightMode,
  fieldNotes = [],
  lastBatch = [],
  acceptedDrillholes = [],
}) => {
  const [zoom, setZoom] = useState(1);
  const [filterHighError, setFilterHighError] = useState(false);
  const [filterA, setFilterA] = useState<'all' | number>('all');
  const [isScaleLocked, setIsScaleLocked] = useState(false);
  const [lockedBounds, setLockedBounds] = useState<{ minBound: number; maxBound: number } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<QuadripolePoint | null>(null);

  // Visualization modes: 'points' | 'mesh' | 'inversion'
  const [displayMode, setDisplayMode] = useState<'points' | 'mesh' | 'inversion'>('inversion');
  // Variable: 'rho' (Resistivity) | 'ip' (Chargeability) | 'sp' (Self Potential)
  const [activeVariable, setActiveVariable] = useState<'rho' | 'ip' | 'sp'>(viewMode === 'ip' ? 'ip' : 'rho');

  // Exact Color Calibration State
  const [paletteType, setPaletteType] = useState<'geophysical_mining' | 'sulfide_metallic' | 'turbo' | 'viridis'>('geophysical_mining');
  const [contourMode, setContourMode] = useState<'discrete' | 'smooth'>('discrete');
  const [rangePreset, setRangePreset] = useState<'auto' | 'sulfides' | 'veins' | 'porphyry' | 'custom'>('auto');
  const [customMin, setCustomMin] = useState<number>(1);
  const [customMax, setCustomMax] = useState<number>(5000);
  const [showColorControls, setShowColorControls] = useState(false);

  // Inversion parameters
  const [inversionIters, setInversionIters] = useState<1 | 3 | 5>(3);
  const [showMiningTargets, setShowMiningTargets] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState<MiningTargetAnomaly | null>(null);
  const [showDrillholes, setShowDrillholes] = useState(true);
  const [selectedDrillhole, setSelectedDrillhole] = useState<SuggestedDrillhole | null>(null);

  const [withTopography, setWithTopography] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isIPDecayOpen, setIsIPDecayOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 750, height: 280 });

  useEffect(() => {
    beeper.enabled = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    setActiveVariable(viewMode === 'ip' ? 'ip' : 'rho');
  }, [viewMode]);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          setDimensions({ width: w, height: h });
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const lineLength = (totalElectrodes - 1) * spacing;

  // Available dipole spacings (a = 5m, 10m, 15m in dipole-dipole)
  const availableASpacings = useMemo(() => {
    const set = new Set<number>();
    points.forEach((p) => {
      if (p.p && p.p.length >= 2) {
        const aVal = Math.abs(p.p[1] - p.p[0]) * spacing;
        if (aVal > 0) set.add(aVal);
      }
    });
    const list = Array.from(set).sort((a, b) => a - b);
    return list.length > 0 ? list : [spacing, spacing * 2, spacing * 3];
  }, [points, spacing]);

  // Points for 2D inversion (all clean points regardless of filterA for full depth solution)
  const inversionBasePoints = useMemo(() => {
    if (!filterHighError) return points;
    return points.filter((p) => p.err <= errorThreshold);
  }, [points, filterHighError, errorThreshold]);

  // Points displayed on pseudosection (supports filtering by dipole spacing 'a')
  const filteredPoints = useMemo(() => {
    let pts = points;
    if (filterHighError) {
      pts = pts.filter((p) => p.err <= errorThreshold);
    }
    if (filterA !== 'all') {
      pts = pts.filter((p) => {
        if (!p.p || p.p.length < 2) return true;
        const aVal = Math.abs(p.p[1] - p.p[0]) * spacing;
        return aVal === filterA;
      });
    }
    return pts;
  }, [points, filterHighError, errorThreshold, filterA, spacing]);

  // Full 2D Inversion computation with iterative Gauss-Newton L2 solver
  const inversionResult = useMemo(() => {
    return estimate2DInversion(inversionBasePoints, { iterations: inversionIters });
  }, [inversionBasePoints, inversionIters]);

  const inversionPoints = inversionResult.points;
  const miningTargets = inversionResult.targets;

  const maxZ = useMemo(() => {
    if (points.length === 0) return 35;
    const baseZ = Math.max(...points.map((p) => p.z), 25);
    return displayMode === 'inversion' ? baseZ * 1.15 : baseZ;
  }, [points, displayMode]);

  // Dynamic Z axis ticks covering full pseudodepth range up to maxZ
  const dynamicZTicks = useMemo(() => {
    const limit = Math.max(35, Math.ceil(maxZ / 5) * 5);
    const ticks: number[] = [];
    for (let z = 5; z <= limit; z += 5) {
      ticks.push(z);
    }
    return ticks;
  }, [maxZ]);

  // Standard Edwards (1977) median depth levels for dipole-dipole reference
  const edwardsLevels = useMemo(() => [
    { a: 5, n: 1, z: 2.1, label: 'a=5 n=1' },
    { a: 5, n: 4, z: 6.1, label: 'a=5 n=4' },
    { a: 5, n: 8, z: 11.2, label: 'a=5 n=8' },
    { a: 10, n: 8, z: 22.4, label: 'a=10 n=8' },
    { a: 15, n: 8, z: 33.5, label: 'a=15 n=8' },
  ], []);

  // Dynamic vs Preset Min/Max Calculation with Scale Lock capability
  const { minBound, maxBound, isLogScale } = useMemo(() => {
    if (isScaleLocked && lockedBounds && activeVariable === 'rho') {
      return { minBound: lockedBounds.minBound, maxBound: lockedBounds.maxBound, isLogScale: true };
    }

    if (activeVariable === 'sp') {
      return { minBound: -100, maxBound: 20, isLogScale: false };
    }

    if (activeVariable === 'ip') {
      if (rangePreset === 'custom') return { minBound: customMin, maxBound: customMax, isLogScale: false };
      return { minBound: 0, maxBound: 65, isLogScale: false };
    }

    // Resistivity (Rho) - Logarithmic scale
    if (rangePreset === 'sulfides') {
      return { minBound: 0.5, maxBound: 2500, isLogScale: true };
    }
    if (rangePreset === 'veins') {
      return { minBound: 10, maxBound: 15000, isLogScale: true };
    }
    if (rangePreset === 'porphyry') {
      return { minBound: 5, maxBound: 4500, isLogScale: true };
    }
    if (rangePreset === 'custom') {
      return { minBound: Math.max(0.1, customMin), maxBound: Math.max(customMin * 1.5, customMax), isLogScale: true };
    }

    // AUTO RANGE: Use 2nd and 98th percentile to prevent extreme single outliers from crushing the color palette
    const values = displayMode === 'inversion'
      ? inversionPoints.map((p) => p.trueRho).filter((v) => v > 0)
      : filteredPoints.map((p) => p.rho).filter((v) => v > 0);

    if (values.length === 0) {
      return { minBound: 1, maxBound: 5000, isLogScale: true };
    }

    values.sort((a, b) => a - b);
    const p2Idx = Math.floor(values.length * 0.02);
    const p98Idx = Math.floor(values.length * 0.98);
    const p2 = Math.max(0.2, values[p2Idx] ?? values[0]);
    const p98 = Math.max(p2 * 2, values[p98Idx] ?? values[values.length - 1]);

    return { minBound: p2, maxBound: p98, isLogScale: true };
  }, [activeVariable, rangePreset, customMin, customMax, displayMode, inversionPoints, filteredPoints, isScaleLocked, lockedBounds]);

  const toggleScaleLock = () => {
    if (isScaleLocked) {
      setIsScaleLocked(false);
      setLockedBounds(null);
    } else {
      setIsScaleLocked(true);
      setLockedBounds({ minBound, maxBound });
    }
  };

  const colorConfig: ColorScaleConfig = useMemo(() => ({
    palette: paletteType,
    isLog: isLogScale,
    minVal: minBound,
    maxVal: maxBound,
    discreteSteps: contourMode === 'discrete' ? 10 : 0,
  }), [paletteType, isLogScale, minBound, maxBound, contourMode]);

  const colorTicks = useMemo(() => {
    return getContourTickValues(minBound, maxBound, 8, isLogScale);
  }, [minBound, maxBound, isLogScale]);

  const getColor = (val: number) => {
    return getCalibratedColor(val, colorConfig, isSunlightMode);
  };

  const padLeft = dimensions.width < 500 ? 30 : 54;
  const padRight = dimensions.width < 500 ? 14 : 44;
  const padTop = dimensions.height < 240 ? 14 : 28;
  const padBottom = dimensions.height < 240 ? 16 : 30;

  const plotW = Math.max(100, dimensions.width - padLeft - padRight);
  const plotH = Math.max(60, dimensions.height - padTop - padBottom);

  const scaleX = (x: number) => padLeft + (x / Math.max(10, lineLength)) * plotW;
  const scaleY = (z: number, topoOffset = 0) => {
    const base = padTop + (z / Math.max(5, maxZ)) * plotH;
    return withTopography ? base + topoOffset : base;
  };

  const verticalExaggeration = useMemo(() => {
    if (lineLength <= 0 || maxZ <= 0 || plotW <= 0) return '2.7';
    const scaleXRatio = plotW / lineLength;
    const scaleYRatio = plotH / maxZ;
    return (scaleYRatio / Math.max(0.001, scaleXRatio)).toFixed(1);
  }, [plotW, plotH, lineLength, maxZ]);

  // 2D Continuous Geological Contour Mesh Generator
  const contourCells = useMemo(() => {
    if (displayMode === 'points' || filteredPoints.length < 8) return [];
    const cols = dimensions.width < 500 ? 24 : 44;
    const rows = dimensions.height < 240 ? 8 : 14;
    const cellW = plotW / cols;
    const cellH = plotH / rows;
    const cells: { x: number; y: number; w: number; h: number; color: string; val: number }[] = [];

    const activeDataset = displayMode === 'inversion' ? inversionPoints : filteredPoints;

    for (let c = 0; c < cols; c++) {
      const realX = ((c + 0.5) / cols) * lineLength;
      for (let r = 0; r < rows; r++) {
        const realZ = ((r + 0.5) / rows) * maxZ;

        let weightSum = 0;
        let valSum = 0;
        for (let i = 0; i < activeDataset.length; i++) {
          const pt = activeDataset[i];
          const ptZ = displayMode === 'inversion' ? (pt as any).depthZ : pt.z;
          const distSq = Math.pow(pt.x - realX, 2) + Math.pow((ptZ - realZ) * 2.2, 2);
          if (distSq < 1e-4) {
            valSum = displayMode === 'inversion'
              ? activeVariable === 'rho' ? (pt as any).trueRho : activeVariable === 'ip' ? (pt as any).trueIP : (pt.sp || 0)
              : activeVariable === 'rho' ? pt.rho : activeVariable === 'ip' ? (pt.ip ?? 0) : (pt.sp || 0);
            weightSum = 1;
            break;
          }
          const w = 1 / Math.pow(distSq, 1.25);
          weightSum += w;
          const v = displayMode === 'inversion'
            ? activeVariable === 'rho' ? (pt as any).trueRho : activeVariable === 'ip' ? (pt as any).trueIP : (pt.sp || 0)
            : activeVariable === 'rho' ? pt.rho : activeVariable === 'ip' ? (pt.ip ?? 0) : (pt.sp || 0);
          valSum += w * v;
        }

        const interpolatedVal = weightSum > 0 ? valSum / weightSum : 100;

        cells.push({
          x: padLeft + c * cellW,
          y: padTop + r * cellH,
          w: cellW + 0.5,
          h: cellH + 0.5,
          color: getColor(interpolatedVal),
          val: interpolatedVal,
        });
      }
    }
    return cells;
  }, [displayMode, filteredPoints, inversionPoints, dimensions, plotW, plotH, lineLength, maxZ, activeVariable, colorConfig, isSunlightMode]);

  const activeInspection = hoveredPoint || selectedPoint;

  // Quadripole electrode positions on cable for the inspected point
  const inspectedElectrodes = useMemo(() => {
    if (!activeInspection || !activeInspection.p || activeInspection.p.length < 4) return null;
    const [a, b, m, n] = activeInspection.p;
    return {
      aX: a > 0 ? scaleX((a - 1) * spacing) : null,
      bX: b > 0 ? scaleX((b - 1) * spacing) : null,
      mX: scaleX((m - 1) * spacing),
      nX: scaleX((n - 1) * spacing),
      a, b, m, n,
    };
  }, [activeInspection, spacing, padLeft, plotW, lineLength]);

  return (
    <div
      className={`flex-1 min-h-0 flex flex-col rounded-xl border transition-colors shadow-2xl overflow-hidden select-none ${
        isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#070b13] border-[#18273d] text-[#e2ecf8]'
      }`}
    >
      {/* 1. Precision Top Control Strip */}
      <div
        className={`px-2 sm:px-3 py-1 flex items-center justify-between gap-1 sm:gap-2 border-b shrink-0 overflow-x-auto no-scrollbar ${
          isSunlightMode ? 'border-black bg-slate-100' : 'border-[#152338] bg-[#09111c]'
        }`}
      >
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Active Variable Switcher */}
          <div
            className={`flex rounded-md p-0.5 border ${
              isSunlightMode ? 'bg-slate-200 border-black' : 'bg-[#0d1624] border-[#1b2b41]'
            }`}
          >
            <button
              onClick={() => {
                setActiveVariable('rho');
                onToggleViewMode('rho');
              }}
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold transition-all cursor-pointer ${
                activeVariable === 'rho'
                  ? isSunlightMode
                    ? 'bg-black text-white'
                    : 'bg-cyan-600 text-white shadow-sm'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Resistividad Eléctrica (Ohm-m)"
            >
              ρ <span className="hidden xs:inline">Resist</span>
            </button>
            <button
              onClick={() => {
                setActiveVariable('ip');
                onToggleViewMode('ip');
              }}
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold transition-all cursor-pointer ${
                activeVariable === 'ip'
                  ? isSunlightMode
                    ? 'bg-black text-white'
                    : 'bg-purple-600 text-white shadow-sm'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Polarización Inducida / Cargabilidad (mV/V)"
            >
              Ma <span className="hidden xs:inline">IP</span>
            </button>
            <button
              onClick={() => setActiveVariable('sp')}
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold transition-all cursor-pointer ${
                activeVariable === 'sp'
                  ? isSunlightMode
                    ? 'bg-black text-white'
                    : 'bg-emerald-600 text-white shadow-sm'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Auto-Potencial Natural (mV)"
            >
              SP
            </button>
          </div>

          {/* Model Status Pill */}
          <span
            className={`hidden md:flex text-[9px] font-mono px-2 py-0.5 rounded border font-bold items-center gap-1 ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#101b2c] border-[#1d2f4a] text-cyan-300'
            }`}
          >
            <Compass className="w-2.5 h-2.5 text-cyan-400" />
            <span>
              {displayMode === 'inversion'
                ? `RMS: ${inversionResult.rmsError}%`
                : displayMode === 'mesh'
                ? 'Malla'
                : 'Puntos'}
            </span>
          </span>
        </div>

        {/* Toolbar Segmented Controls */}
        <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono">
          {/* Dipole Spacing 'a' Filter */}
          <div
            className={`flex items-center rounded-md p-0.5 border ${
              isSunlightMode ? 'bg-slate-200 border-black' : 'bg-[#0d1624] border-[#1b2b41]'
            }`}
          >
            <span className="text-[8px] font-bold px-1 opacity-70">a:</span>
            <button
              onClick={() => setFilterA('all')}
              className={`px-1 py-0.5 rounded text-[8.5px] font-bold cursor-pointer transition-all ${
                filterA === 'all'
                  ? isSunlightMode ? 'bg-black text-white' : 'bg-cyan-600 text-white'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Mostrar todos los espaciamientos dipolares a"
            >
              Todos
            </button>
            {availableASpacings.map((aVal) => (
              <button
                key={aVal}
                onClick={() => setFilterA(aVal)}
                className={`px-1 py-0.5 rounded text-[8.5px] font-bold cursor-pointer transition-all ${
                  filterA === aVal
                    ? isSunlightMode ? 'bg-black text-white' : 'bg-cyan-600 text-white'
                    : 'opacity-70 hover:opacity-100'
                }`}
                title={`Filtrar sólo dipolos con separación a = ${aVal}m`}
              >
                {aVal}m
              </button>
            ))}
          </div>

          {/* Scale Lock Toggle */}
          <button
            onClick={toggleScaleLock}
            className={`px-1.5 py-0.5 rounded border text-[8.5px] sm:text-[9px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors ${
              isScaleLocked
                ? isSunlightMode ? 'bg-amber-400 text-black border-black font-extrabold' : 'bg-amber-500/20 text-amber-300 border-amber-400'
                : 'opacity-70 hover:opacity-100'
            }`}
            title={isScaleLocked ? 'Escala fijada (comparativa). Clic para desbloquear auto-rango.' : 'Fijar escala actual para comparar líneas'}
          >
            <span>{isScaleLocked ? '🔒 Fijada' : '🔓 Fijar Escala'}</span>
          </button>

          {/* Display Mode: Ptos / Malla / Inversión 2D */}
          <div
            className={`flex rounded-md p-0.5 border ${
              isSunlightMode ? 'bg-slate-200 border-black' : 'bg-[#0d1624] border-[#1b2b41]'
            }`}
          >
            <button
              onClick={() => setDisplayMode('points')}
              className={`px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-bold transition-all cursor-pointer ${
                displayMode === 'points'
                  ? isSunlightMode ? 'bg-black text-white' : 'bg-sky-600 text-white'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Puntos de medición cuadripolar discretos"
            >
              Ptos
            </button>
            <button
              onClick={() => setDisplayMode('mesh')}
              className={`px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-bold transition-all cursor-pointer ${
                displayMode === 'mesh'
                  ? isSunlightMode ? 'bg-black text-white' : 'bg-emerald-600 text-white'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Malla continua 2D interpolada"
            >
              Malla
            </button>
            <button
              onClick={() => setDisplayMode('inversion')}
              className={`px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-bold transition-all cursor-pointer flex items-center gap-0.5 ${
                displayMode === 'inversion'
                  ? isSunlightMode ? 'bg-black text-white' : 'bg-purple-600 text-white'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Inversión Gauss-Newton L2"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-300" />
              <span>Inv</span>
            </button>
          </div>

          {/* Iteration Selector when in Inversion Mode */}
          {displayMode === 'inversion' && (
            <div
              className={`flex items-center rounded-md border p-0.5 ${
                isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1624] border-[#1b2b41]'
              }`}
            >
              {[1, 3, 5].map((it) => (
                <button
                  key={it}
                  onClick={() => setInversionIters(it as 1 | 3 | 5)}
                  className={`px-1 py-0.5 rounded text-[8.5px] font-bold ${
                    inversionIters === it
                      ? isSunlightMode ? 'bg-black text-white' : 'bg-amber-600 text-white'
                      : 'opacity-60'
                  }`}
                  title={`${it} iteraciones`}
                >
                  {it}
                </button>
              ))}
            </div>
          )}

          {/* Mining Target Anomaly Toggle */}
          <button
            onClick={() => setShowMiningTargets(!showMiningTargets)}
            className={`px-1.5 py-0.5 rounded border text-[8.5px] sm:text-[9px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors ${
              showMiningTargets
                ? isSunlightMode
                  ? 'bg-amber-400 text-black border-black font-extrabold'
                  : 'bg-amber-500/30 text-amber-300 border-amber-500'
                : 'opacity-70 hover:opacity-100'
            }`}
            title="Blancos Mineros"
          >
            <Target className="w-2.5 h-2.5 text-amber-400" />
            <span>({miningTargets.length})</span>
          </button>

          {/* Accepted Drillholes Overlay Toggle */}
          {acceptedDrillholes.length > 0 && (
            <button
              onClick={() => setShowDrillholes(!showDrillholes)}
              className={`px-1.5 py-0.5 rounded border text-[8.5px] sm:text-[9px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors ${
                showDrillholes
                  ? isSunlightMode
                    ? 'bg-emerald-400 text-black border-black font-extrabold'
                    : 'bg-emerald-600/40 text-emerald-300 border-emerald-500'
                  : 'opacity-70 hover:opacity-100'
              }`}
              title="Trazado de Sondajes Diamantinos Aceptados"
            >
              <Compass className="w-2.5 h-2.5 text-emerald-400" />
              <span>Sondajes ({acceptedDrillholes.length})</span>
            </button>
          )}

          {/* Color & Calibration Settings Drawer Toggle */}
          <button
            onClick={() => setShowColorControls(!showColorControls)}
            className={`px-1.5 py-0.5 rounded border text-[8.5px] sm:text-[9px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors ${
              showColorControls
                ? isSunlightMode ? 'bg-black text-white border-black' : 'bg-cyan-600 text-white border-cyan-400'
                : 'opacity-70 hover:opacity-100'
            }`}
            title="Ajuste de Paleta y Escala"
          >
            <Palette className="w-2.5 h-2.5 text-cyan-400" />
            <span className="hidden sm:inline">Colores</span>
          </button>

          {/* Stepper Zoom */}
          <div
            className={`flex items-center gap-0.5 border rounded-md px-1 py-0.5 ${
              isSunlightMode ? 'bg-white border-black' : 'bg-[#0d1624] border-[#1b2b41]'
            }`}
          >
            <button
              onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))))}
              className="px-0.5 font-bold hover:text-cyan-400 cursor-pointer"
            >
              -
            </button>
            <span className="text-[8px] sm:text-[8.5px] font-bold min-w-[22px] text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.2).toFixed(1))))}
              className="px-0.5 font-bold hover:text-cyan-400 cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 2. Color Calibration Panel (When Opened) */}
      {showColorControls && (
        <div
          className={`px-3 py-2 border-b text-[10px] font-mono flex flex-wrap items-center justify-between gap-3 shrink-0 transition-all ${
            isSunlightMode ? 'bg-slate-200 border-black text-black' : 'bg-[#0c1424] border-[#1b2e49] text-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-cyan-400 uppercase">Paleta Geocientífica:</span>
            <select
              value={paletteType}
              onChange={(e) => setPaletteType(e.target.value as any)}
              className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080e18] border-[#22395b] text-white'
              }`}
            >
              <option value="geophysical_mining">Geofísica Minera Estándar (EarthImager/Res2DInv)</option>
              <option value="sulfide_metallic">Sulfuros & Metálicos (Alto Contraste)</option>
              <option value="turbo">Turbo Geocientífico (Uniforme)</option>
              <option value="viridis">Viridis Calibrado (Daltónicos/Técnico)</option>
            </select>

            <span className="opacity-40">│</span>

            <span className="font-bold text-cyan-400 uppercase">Intervalos:</span>
            <div
              className={`flex rounded border p-0.5 ${
                isSunlightMode ? 'bg-white border-black' : 'bg-[#080e18] border-[#22395b]'
              }`}
            >
              <button
                onClick={() => setContourMode('discrete')}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  contourMode === 'discrete'
                    ? isSunlightMode ? 'bg-black text-white' : 'bg-cyan-600 text-white'
                    : 'opacity-70 hover:opacity-100'
                }`}
                title="10 escalones de contorno discretos calibrados con etiquetas exactas"
              >
                10 Contornos
              </button>
              <button
                onClick={() => setContourMode('smooth')}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  contourMode === 'smooth'
                    ? isSunlightMode ? 'bg-black text-white' : 'bg-cyan-600 text-white'
                    : 'opacity-70 hover:opacity-100'
                }`}
                title="Gradiente continuo continuo"
              >
                Continuo
              </button>
            </div>

            <span className="opacity-40">│</span>

            <span className="font-bold text-cyan-400 uppercase">Rango Escala:</span>
            <select
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value as any)}
              className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080e18] border-[#22395b] text-white'
              }`}
            >
              <option value="auto">Auto (Percentil P2 - P98 de datos)</option>
              <option value="sulfides">Sulfuros & Masivos (0.5 - 2,500 Ω·m)</option>
              <option value="veins">Vetas & Silicificación (10 - 15,000 Ω·m)</option>
              <option value="porphyry">Pórfidos Cu-Au (5 - 4,500 Ω·m)</option>
              <option value="custom">Rango Manual Libre</option>
            </select>

            {rangePreset === 'custom' && (
              <div className="flex items-center gap-1">
                <span>Min:</span>
                <input
                  type="number"
                  value={customMin}
                  onChange={(e) => setCustomMin(Number(e.target.value))}
                  className="w-16 px-1 rounded border bg-black text-white text-[9px]"
                />
                <span>Max:</span>
                <input
                  type="number"
                  value={customMax}
                  onChange={(e) => setCustomMax(Number(e.target.value))}
                  className="w-16 px-1 rounded border bg-black text-white text-[9px]"
                />
              </div>
            )}
          </div>

          <button
            onClick={() => setShowColorControls(false)}
            className="text-[9px] underline opacity-75 hover:opacity-100 cursor-pointer"
          >
            Ocultar Ajustes
          </button>
        </div>
      )}

      {/* 3. Surface Multi-Conductor Cable & Electrode Status Line */}
      <div
        className={`px-2 sm:px-3 py-0.5 sm:py-1 border-b flex items-center justify-between text-[8.5px] sm:text-[9px] font-mono shrink-0 overflow-hidden whitespace-nowrap ${
          isSunlightMode ? 'bg-slate-200 border-black text-black' : 'bg-[#070b13] border-[#131f31] text-[#93a7c2]'
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-3 truncate">
          <div className="flex items-center gap-1 font-bold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse inline-block" />
            <span className="hidden sm:inline">CABLE {totalElectrodes}P (Δa={spacing}m):</span>
            <span className="sm:hidden">{totalElectrodes}P:</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-[8px] sm:text-[8.5px]">
            <span className="flex items-center gap-0.5 text-red-500 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              Tx
            </span>
            <span className="flex items-center gap-0.5 text-cyan-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
              Rx
            </span>
            {displayMode === 'inversion' && (
              <span className="text-purple-400 font-bold truncate">
                ● L2 (RMS {inversionResult.rmsError}%)
              </span>
            )}
            {filterA !== 'all' && (
              <span className="text-cyan-300 font-bold">
                [Nivel a={filterA}m]
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 font-bold shrink-0 text-[8px] sm:text-[9px]">
          <span className="text-slate-400 hidden xs:inline">Longitud:</span>
          <span className="text-amber-400">{lineLength}m</span>
        </div>
      </div>

      {/* 4. Main Tomogram Graph Stage & Docked Inspection Panel */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden relative">
        {/* Left: SVG Canvas Stage */}
        <div ref={containerRef} className="flex-1 min-h-0 relative h-full overflow-hidden bg-carbon-texture">
          {/* Vertical Exaggeration (VE) Badge */}
          <div className="absolute bottom-1.5 left-2 z-10 pointer-events-none px-1.5 py-0.5 rounded text-[8px] font-mono bg-black/75 backdrop-blur-sm border border-slate-700/60 text-slate-300 shadow-md">
            VE: ~{verticalExaggeration}× (Exag. Vert.)
          </div>

          {/* Selected Mining Target Details Overlay Card */}
          {selectedTarget && (
            <div
              className={`absolute bottom-2 left-2 z-20 p-3 rounded-xl border text-[10px] font-mono shadow-2xl max-w-sm ${
                isSunlightMode ? 'bg-amber-50 border-black text-black' : 'bg-[#0f1728]/95 border-amber-500/50 text-white shadow-amber-950/40'
              }`}
            >
              <div className="flex items-center justify-between pb-1 border-b border-amber-500/30 mb-1.5 font-bold">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Target className="w-3.5 h-3.5" />
                  {selectedTarget.title}
                </span>
                <button onClick={() => setSelectedTarget(null)} className="p-0.5 hover:bg-slate-700/50 rounded cursor-pointer">
                  ✕
                </button>
              </div>
              <div className="space-y-1 text-[9px]">
                <div className="flex justify-between">
                  <span className="opacity-70">Ubicación X:</span>
                  <strong>{selectedTarget.xRange[0]}m a {selectedTarget.xRange[1]}m</strong>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Profundidad Z:</span>
                  <strong>-{selectedTarget.zRange[0]}m a -{selectedTarget.zRange[1]}m</strong>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Pico de Respuesta:</span>
                  <strong>{selectedTarget.peakRho} Ω·m {selectedTarget.peakIP ? `· ${selectedTarget.peakIP} mV/V` : ''}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Certeza Geológica:</span>
                  <strong className="text-emerald-400">{selectedTarget.confidence}%</strong>
                </div>
                <p className="text-[9px] opacity-90 mt-1 italic leading-tight text-amber-200">
                  {selectedTarget.drillRecommendation}
                </p>
                <p className="text-[8px] opacity-60 mt-1 border-t border-amber-500/20 pt-1 text-slate-400">
                  *Interpretación geofísica preliminar; corroborar con sondajes diamantinos.
                </p>
              </div>
            </div>
          )}

          {/* SVG Container with zoom transform */}
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: '100%', height: '100%' }}
            className="transition-transform duration-100"
          >
            <svg
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              className="w-full h-full cursor-crosshair"
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                {/* Inverted trapezoid theoretical depth coverage mask */}
                <clipPath id="coverageClip">
                  <polygon
                    points={`
                      ${padLeft},${padTop}
                      ${dimensions.width - padRight},${padTop}
                      ${dimensions.width - padRight - plotW * 0.18},${dimensions.height - padBottom}
                      ${padLeft + plotW * 0.18},${dimensions.height - padBottom}
                    `}
                  />
                </clipPath>
              </defs>

              {/* Base Background */}
              <rect
                x="0"
                y="0"
                width={dimensions.width}
                height={dimensions.height}
                fill={isSunlightMode ? '#ffffff' : '#070b13'}
              />

              {/* Continuous Contour Mesh with theoretical depth clipping */}
              {displayMode !== 'points' && (
                <g clipPath="url(#coverageClip)" opacity="0.94">
                  {contourCells.map((cell, idx) => (
                    <rect key={idx} x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill={cell.color} />
                  ))}
                </g>
              )}

              {/* Inverted Trapezoid Boundary Outline */}
              <polygon
                points={`
                  ${padLeft},${padTop}
                  ${dimensions.width - padRight},${padTop}
                  ${dimensions.width - padRight - plotW * 0.18},${dimensions.height - padBottom}
                  ${padLeft + plotW * 0.18},${dimensions.height - padBottom}
                `}
                fill="none"
                stroke={isSunlightMode ? '#94a3b8' : '#1a283e'}
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />

              {/* Dynamic Depth Lines (Z) spanning full pseudodepth */}
              {dynamicZTicks.map((zVal) => {
                if (zVal > maxZ + 2) return null;
                const y = scaleY(zVal);
                return (
                  <g key={`z-${zVal}`}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={dimensions.width - padRight}
                      y2={y}
                      stroke={isSunlightMode ? '#cbd5e1' : '#142033'}
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 6}
                      y={y + 3}
                      textAnchor="end"
                      fill={isSunlightMode ? '#000000' : '#718ba8'}
                      fontSize="8.5"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      -{zVal}m
                    </text>
                  </g>
                );
              })}

              {/* Edwards (1977) Median Depth Reference Markers on Right Margin */}
              {edwardsLevels.map((lvl, idx) => {
                if (lvl.z > maxZ) return null;
                const y = scaleY(lvl.z);
                return (
                  <g key={`edw-${idx}`}>
                    <line
                      x1={dimensions.width - padRight}
                      y1={y}
                      x2={dimensions.width - padRight + 4}
                      y2={y}
                      stroke="#38bdf8"
                      strokeWidth="1"
                    />
                    <text
                      x={dimensions.width - padRight + 6}
                      y={y + 2.5}
                      fill="#718ba8"
                      fontSize="7"
                      fontFamily="monospace"
                      fontWeight="500"
                    >
                      {lvl.label}
                    </text>
                  </g>
                );
              })}

              {/* Distance Gridlines (X) */}
              {Array.from({ length: Math.floor(lineLength / (dimensions.width < 500 ? 50 : 25)) + 1 }).map((_, i) => {
                const xVal = i * (dimensions.width < 500 ? 50 : 25);
                const x = scaleX(xVal);
                return (
                  <g key={`x-${xVal}`}>
                    <line
                      x1={x}
                      y1={padTop}
                      x2={x}
                      y2={dimensions.height - padBottom}
                      stroke={isSunlightMode ? '#cbd5e1' : '#142033'}
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={dimensions.height - padBottom + 12}
                      textAnchor="middle"
                      fill={isSunlightMode ? '#000000' : '#718ba8'}
                      fontSize="8.5"
                      fontFamily="monospace"
                      fontWeight="600"
                    >
                      {xVal}m
                    </text>
                  </g>
                );
              })}

              {/* Mining Target Anomaly Bounding Overlays */}
              {showMiningTargets &&
                miningTargets.map((target) => {
                  const x1 = scaleX(target.xRange[0]);
                  const x2 = scaleX(target.xRange[1]);
                  const y1 = scaleY(target.zRange[0]);
                  const y2 = scaleY(target.zRange[1]);
                  const w = Math.max(14, x2 - x1);
                  const h = Math.max(12, y2 - y1);
                  const isTargetSelected = selectedTarget?.id === target.id;

                  const targetLabel = target.type === 'massive_sulfide'
                    ? '🎯 SULFURO (Indicativo, 94%)'
                    : target.type === 'quartz_vein'
                    ? '🎯 VETA (Indicativo, 91%)'
                    : '🎯 PÓRFIDO (Indicativo IP+ρ, 88%)';

                  return (
                    <g
                      key={target.id}
                      onClick={() => setSelectedTarget(isTargetSelected ? null : target)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x1}
                        y={y1}
                        width={w}
                        height={h}
                        fill="none"
                        stroke={isTargetSelected ? '#fbbf24' : '#f59e0b'}
                        strokeWidth={isTargetSelected ? 2.5 : 1.5}
                        strokeDasharray="3 3"
                        rx="4"
                      />
                      {/* Drill Target Crosshair */}
                      <circle cx={x1 + w / 2} cy={y1 + h / 2} r="5" fill="#f59e0b" fillOpacity="0.25" stroke="#f59e0b" strokeWidth="1.2" />
                      <line x1={x1 + w / 2 - 8} y1={y1 + h / 2} x2={x1 + w / 2 + 8} y2={y1 + h / 2} stroke="#f59e0b" strokeWidth="1.2" />
                      <line x1={x1 + w / 2} y1={y1 + h / 2 - 8} x2={x1 + w / 2} y2={y1 + h / 2 + 8} stroke="#f59e0b" strokeWidth="1.2" />

                      <text
                        x={x1 + w / 2}
                        y={y1 - 3}
                        textAnchor="middle"
                        fill="#f59e0b"
                        fontSize="7.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {targetLabel}
                      </text>
                    </g>
                  );
                })}

              {/* Accepted Drillholes Overlay on 2D Cross Section */}
              {showDrillholes &&
                acceptedDrillholes.map((drill) => {
                  const collarXPos = scaleX(drill.collarX);
                  const collarYPos = padTop;
                  const rad = Math.abs(drill.dipDeg) * (Math.PI / 180);
                  const horizDist = Math.cos(rad) * drill.targetDepthM;
                  const vertDist = Math.sin(rad) * drill.targetDepthM;
                  // If azimuth >= 180, drill to west (-X), else drill to east (+X)
                  const endStationX = drill.collarX + (drill.azimuthDeg >= 180 ? -horizDist : horizDist);
                  const endXPos = scaleX(endStationX);
                  const endYPos = scaleY(vertDist);
                  const isDrillSelected = selectedDrillhole?.id === drill.id;

                  // Tick marks every 10 meters along drill trajectory
                  const ticks: { m: number; tx: number; ty: number }[] = [];
                  for (let m = 10; m < drill.targetDepthM; m += 10) {
                    const frac = m / drill.targetDepthM;
                    ticks.push({
                      m,
                      tx: collarXPos + frac * (endXPos - collarXPos),
                      ty: collarYPos + frac * (endYPos - collarYPos),
                    });
                  }

                  return (
                    <g
                      key={drill.id}
                      onClick={() => setSelectedDrillhole(isDrillSelected ? null : drill)}
                      className="cursor-pointer"
                    >
                      {/* Drillhole Trajectory Line */}
                      <line
                        x1={collarXPos}
                        y1={collarYPos}
                        x2={endXPos}
                        y2={endYPos}
                        stroke={isSunlightMode ? '#000000' : '#10b981'}
                        strokeWidth={isDrillSelected ? 3.5 : 2.2}
                        strokeLinecap="round"
                      />

                      {/* 10m Depth Tick Marks */}
                      {ticks.map((t) => (
                        <g key={t.m}>
                          <line
                            x1={t.tx - 3}
                            y1={t.ty}
                            x2={t.tx + 3}
                            y2={t.ty}
                            stroke={isSunlightMode ? '#000000' : '#10b981'}
                            strokeWidth="1.5"
                          />
                          <text
                            x={t.tx + 5}
                            y={t.ty + 2.5}
                            fill={isSunlightMode ? '#000000' : '#10b981'}
                            fontSize="6.5"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {t.m}m
                          </text>
                        </g>
                      ))}

                      {/* Collar Marker Pin (Inverted Triangle) */}
                      <polygon
                        points={`${collarXPos - 5},${collarYPos - 8} ${collarXPos + 5},${collarYPos - 8} ${collarXPos},${collarYPos}`}
                        fill={isSunlightMode ? '#000000' : '#10b981'}
                        stroke="#ffffff"
                        strokeWidth="0.8"
                      />

                      {/* Collar Station and Drillhole Label */}
                      <text
                        x={collarXPos}
                        y={collarYPos - 10}
                        textAnchor="middle"
                        fill={isSunlightMode ? '#000000' : '#34d399'}
                        fontSize="7.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {drill.name} ({drill.dipDeg}° · {drill.targetDepthM}m)
                      </text>

                      {/* Target Intersection Diamond */}
                      <polygon
                        points={`${endXPos},${endYPos - 5} ${endXPos + 5},${endYPos} ${endXPos},${endYPos + 5} ${endXPos - 5},${endYPos}`}
                        fill="#fbbf24"
                        stroke={isSunlightMode ? '#000000' : '#ffffff'}
                        strokeWidth="1.2"
                      />
                    </g>
                  );
                })}

              {/* Surface Line with physical Cable rendering */}
              <line
                x1={padLeft}
                y1={padTop}
                x2={dimensions.width - padRight}
                y2={padTop}
                stroke={isSunlightMode ? '#000000' : '#38bdf8'}
                strokeWidth="2.5"
              />
              <text
                x={padLeft - 6}
                y={padTop + 3}
                textAnchor="end"
                fill={isSunlightMode ? '#000000' : '#38bdf8'}
                fontSize="8.5"
                fontWeight="bold"
                fontFamily="monospace"
              >
                0.0m
              </text>

              {/* Electrodes on Cable */}
              {Array.from({ length: totalElectrodes }).map((_, idx) => {
                const elNum = idx + 1;
                const elX = scaleX(idx * spacing);
                const isTx = activeElectrodes.tx.includes(elNum);
                const isRx = activeElectrodes.rx.includes(elNum);
                const isInspected =
                  inspectedElectrodes &&
                  (inspectedElectrodes.a === elNum ||
                    inspectedElectrodes.b === elNum ||
                    inspectedElectrodes.m === elNum ||
                    inspectedElectrodes.n === elNum);

                let fillColor = isSunlightMode ? '#475569' : '#334155';
                let r = 2;
                if (isTx) {
                  fillColor = '#ef4444';
                  r = 4;
                } else if (isRx) {
                  fillColor = '#38bdf8';
                  r = 3.5;
                } else if (isInspected) {
                  fillColor = '#f59e0b';
                  r = 3.5;
                }

                return (
                  <g key={`el-${elNum}`}>
                    <circle
                      cx={elX}
                      cy={padTop}
                      r={r}
                      fill={fillColor}
                      stroke={isSunlightMode ? '#000000' : '#080d16'}
                      strokeWidth="1"
                    />
                    {(elNum === 1 || elNum === totalElectrodes || elNum % 10 === 0) && (
                      <text
                        x={elX}
                        y={padTop - 6}
                        textAnchor="middle"
                        fill={isSunlightMode ? '#000000' : '#718ba8'}
                        fontSize="7.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {elNum}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Quadripole Geometric Ray Paths to Inspected Point */}
              {inspectedElectrodes && activeInspection && (
                <g opacity="0.85">
                  {inspectedElectrodes.aX !== null && (
                    <line
                      x1={inspectedElectrodes.aX}
                      y1={padTop}
                      x2={scaleX(activeInspection.x)}
                      y2={scaleY(displayMode === 'inversion' ? (activeInspection as any).depthZ ?? activeInspection.z : activeInspection.z)}
                      stroke="#ef4444"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                  )}
                  {inspectedElectrodes.bX !== null && (
                    <line
                      x1={inspectedElectrodes.bX}
                      y1={padTop}
                      x2={scaleX(activeInspection.x)}
                      y2={scaleY(displayMode === 'inversion' ? (activeInspection as any).depthZ ?? activeInspection.z : activeInspection.z)}
                      stroke="#ef4444"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                  )}
                  <line
                    x1={inspectedElectrodes.mX}
                    y1={padTop}
                    x2={scaleX(activeInspection.x)}
                    y2={scaleY(displayMode === 'inversion' ? (activeInspection as any).depthZ ?? activeInspection.z : activeInspection.z)}
                    stroke="#38bdf8"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={inspectedElectrodes.nX}
                    y1={padTop}
                    x2={scaleX(activeInspection.x)}
                    y2={scaleY(displayMode === 'inversion' ? (activeInspection as any).depthZ ?? activeInspection.z : activeInspection.z)}
                    stroke="#38bdf8"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                </g>
              )}

              {/* Measured Quadripole Data Points with QC Error Halos */}
              {displayMode !== 'mesh' &&
                (displayMode === 'inversion' ? inversionPoints : filteredPoints).map((pt) => {
                  const cx = scaleX(pt.x);
                  const cy = scaleY(displayMode === 'inversion' ? (pt as any).depthZ ?? pt.z : pt.z);
                  const isSelected = selectedPoint?.id === pt.id;
                  const isHighErr = pt.err > errorThreshold;
                  const isRepeated = pt.remeasured || pt.status === 'repeated';

                  const valToColor =
                    activeVariable === 'rho'
                      ? displayMode === 'inversion' ? (pt as any).trueRho ?? pt.rho : pt.rho
                      : activeVariable === 'ip'
                      ? displayMode === 'inversion' ? (pt as any).trueIP ?? pt.ip : (pt.ip ?? 0)
                      : (pt.sp || 0);

                  const color = getColor(valToColor);

                  return (
                    <g
                      key={pt.id}
                      onClick={() => onSelectPoint(isSelected ? null : pt)}
                      onMouseEnter={() => setHoveredPoint(pt)}
                      className="cursor-pointer"
                    >
                      {/* Selection Reticle Ring */}
                      {isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={dimensions.width < 500 ? 7.5 : 9.5}
                          fill="none"
                          stroke={isSunlightMode ? '#000000' : '#38bdf8'}
                          strokeWidth="2.5"
                        />
                      )}

                      {/* QC Error Halo Ring (Red dashed if error > threshold; amber if repeated) */}
                      {isHighErr && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={dimensions.width < 500 ? 6.5 : 8}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="1.4"
                          strokeDasharray="2.5 2.5"
                          className="animate-pulse"
                        />
                      )}
                      {isRepeated && !isHighErr && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={dimensions.width < 500 ? 5.5 : 7}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="1.2"
                        />
                      )}

                      {/* Main Point Marker */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSelected ? (dimensions.width < 500 ? 4.5 : 6) : dimensions.width < 500 ? 3.2 : 4.4}
                        fill={color}
                        stroke={isHighErr ? '#ef4444' : isSunlightMode ? '#000000' : '#070b13'}
                        strokeWidth={isHighErr || isSunlightMode ? 1.5 : 0.8}
                      />

                      {!isSunlightMode && (
                        <circle
                          cx={cx - 1}
                          cy={cy - 1}
                          r={dimensions.width < 500 ? 1 : 1.5}
                          fill="#ffffff"
                          opacity="0.6"
                        />
                      )}
                    </g>
                  );
                })}
            </svg>
          </div>
        </div>

        {/* Right: Dedicated Docked Lateral Inspector Panel (Never occludes electrodes 41-56!) */}
        {activeInspection && (
          <aside
            className={`w-[240px] sm:w-[280px] shrink-0 border-l p-2.5 sm:p-3 flex flex-col justify-between text-[9px] sm:text-[9.5px] font-mono overflow-y-auto no-scrollbar shadow-2xl z-20 transition-all ${
              isSunlightMode
                ? 'bg-slate-50 border-black text-black'
                : 'bg-[#080e18] border-[#18273d] text-slate-200'
            }`}
          >
            <div className="space-y-2.5">
              {/* Header */}
              <div className="flex items-center justify-between pb-1.5 border-b border-cyan-500/30">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-cyan-400 uppercase text-[10px]">Punto #{activeInspection.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                      activeInspection.err > errorThreshold
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                        : activeInspection.status === 'repeated' || activeInspection.remeasured
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                    }`}
                  >
                    {activeInspection.err > errorThreshold
                      ? 'RECHAZADO'
                      : activeInspection.status === 'repeated' || activeInspection.remeasured
                      ? 'REPETIDO'
                      : 'MEDIDO'}
                  </span>
                  <button
                    onClick={() => {
                      onSelectPoint(null);
                      setHoveredPoint(null);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                    title="Cerrar panel de inspección"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Primary Value Display */}
              <div
                className={`p-2 rounded-lg border flex items-center justify-between ${
                  isSunlightMode ? 'bg-white border-slate-300' : 'bg-[#0c1524] border-[#1f3554]'
                }`}
              >
                <span className="text-[9px] font-bold text-slate-400">
                  {activeVariable === 'rho'
                    ? displayMode === 'inversion' ? 'ρ true (Inv 2D):' : 'ρa (Aparente):'
                    : activeVariable === 'ip'
                    ? displayMode === 'inversion' ? 'IP true (Inv 2D):' : 'IP app (Aparente):'
                    : 'SP Natural:'}
                </span>
                <span className="text-xs font-black text-amber-400">
                  {activeVariable === 'rho'
                    ? displayMode === 'inversion'
                      ? `${(activeInspection as any).trueRho ?? activeInspection.rho} Ω·m`
                      : `${activeInspection.rho} Ω·m`
                    : activeVariable === 'ip'
                    ? `${displayMode === 'inversion' ? (activeInspection as any).trueIP ?? activeInspection.ip : activeInspection.ip || 0} mV/V`
                    : `${activeInspection.sp || 0} mV`}
                </span>
              </div>

              {/* Quadripole Electrodes: Geophysical C1-C2 / P1-P2 Standard */}
              <div className="space-y-1 p-2 rounded-lg bg-black/30 border border-slate-800">
                <span className="text-[8px] font-bold uppercase tracking-wider text-cyan-400 block">
                  Electrodos C1-C2 / P1-P2:
                </span>
                {activeInspection.p && activeInspection.p.length >= 4 && (
                  <div className="space-y-0.5 text-[8.5px]">
                    <div className="flex justify-between">
                      <span className="text-red-400 font-bold">C1 - C2 (Tx):</span>
                      <strong className="text-slate-100">
                        #{activeInspection.p[0]} ({(activeInspection.p[0] - 1) * spacing}m) - #{activeInspection.p[1]} ({(activeInspection.p[1] - 1) * spacing}m)
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-400 font-bold">P1 - P2 (Rx):</span>
                      <strong className="text-slate-100">
                        #{activeInspection.p[2]} ({(activeInspection.p[2] - 1) * spacing}m) - #{activeInspection.p[3]} ({(activeInspection.p[3] - 1) * spacing}m)
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Geometry & Depth Factors */}
              <div className="space-y-1 p-2 rounded-lg bg-black/30 border border-slate-800">
                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 block">
                  Geometría Dipolo-Dipolo:
                </span>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[8.5px]">
                  <div>
                    <span className="opacity-60">Separación a:</span>{' '}
                    <strong>{activeInspection.p ? Math.abs(activeInspection.p[1] - activeInspection.p[0]) * spacing : spacing}m</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Factor n:</span>{' '}
                    <strong>{activeInspection.p ? Math.round(Math.abs(activeInspection.p[2] - activeInspection.p[1]) / Math.max(1, Math.abs(activeInspection.p[1] - activeInspection.p[0]))) : 1}</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Factor K:</span> <strong>{activeInspection.k.toFixed(1)}m</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Canal Rx:</span> <strong>CH #{activeInspection.channel ?? 1}</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Centro X:</span> <strong>{activeInspection.x}m</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Edwards Ze:</span>{' '}
                    <strong className="text-cyan-300">-{displayMode === 'inversion' ? (activeInspection as any).depthZ ?? activeInspection.z : activeInspection.z}m</strong>
                  </div>
                </div>
              </div>

              {/* Signal Measurements */}
              <div className="space-y-1 p-2 rounded-lg bg-black/30 border border-slate-800">
                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 block">
                  Señales Eléctricas:
                </span>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[8.5px]">
                  <div>
                    <span className="opacity-60">Tensión Vp:</span> <strong>{activeInspection.v} mV</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Corriente In:</span> <strong>{activeInspection.i} mA</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Resistencia R:</span>{' '}
                    <strong>{(activeInspection.v / Math.max(0.001, activeInspection.i)).toFixed(3)} Ω</strong>
                  </div>
                  <div>
                    <span className="opacity-60">Repetibilidad:</span>{' '}
                    <strong className={activeInspection.err > errorThreshold ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                      {activeInspection.err}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* Anomaly Diagnosis Badge */}
              {activeInspection.anomalyTag && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[8.5px] space-y-1">
                  <div className="flex items-center gap-1 text-amber-300 font-bold">
                    <Target className="w-3 h-3 text-amber-400" />
                    <span>{activeInspection.anomalyTag} (Indicativo)</span>
                  </div>
                  <p className="text-[8px] opacity-80 italic leading-tight text-amber-200">
                    *Clasificación preliminar sobre pseudosección aparente. La identificación concluyente de pórfidos y vetas requiere el modelo invertido 2D acoplado con cargabilidad IP (M &gt; 30 mV/V) y resistividad.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setIsIPDecayOpen(true)}
                className="px-2 py-1 rounded text-[8.5px] font-bold bg-purple-600/30 text-purple-300 border border-purple-500/50 hover:bg-purple-600/50 cursor-pointer"
                title="Ver ventanas de decaimiento IP Cole-Cole"
              >
                Curva Decaimiento IP
              </button>
              <button
                onClick={() => {
                  onSelectPoint(null);
                  setHoveredPoint(null);
                }}
                className="text-[8.5px] opacity-70 hover:opacity-100 cursor-pointer underline"
              >
                Cerrar HUD
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* 5. Precision Geophysical Colorbar & Calibration Strip (Single-line mobile-fitted) */}
      <div
        className={`px-2 py-1 sm:px-3 sm:py-1.5 border-t flex items-center justify-between text-[8px] sm:text-[9px] font-mono shrink-0 gap-1.5 overflow-x-auto no-scrollbar ${
          isSunlightMode ? 'bg-slate-200 border-black text-black' : 'bg-[#070b13] border-[#131f31] text-[#93a7c2]'
        }`}
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-bold tracking-tight text-slate-300 whitespace-nowrap normal-case">
            {activeVariable === 'rho'
              ? displayMode === 'inversion' ? 'ρtrue (Ω·m):' : 'ρa (Ω·m):'
              : activeVariable === 'ip'
              ? displayMode === 'inversion' ? 'IP true (mV/V):' : 'IP app (mV/V):'
              : 'SP (mV):'}
          </span>

          {/* Stepped Exact Contours Bar with Log10 indication */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <span className="text-sky-400 font-bold">{colorTicks[0]}</span>
            <div className="flex h-2.5 sm:h-3 rounded border border-slate-700 overflow-hidden shadow-inner">
              {colorTicks.slice(0, -1).map((tick, i) => {
                const nextTick = colorTicks[i + 1];
                const midVal = (tick + nextTick) / 2;
                return (
                  <div
                    key={i}
                    style={{ backgroundColor: getColor(midVal) }}
                    className="w-3 xs:w-4 sm:w-6 h-full flex items-center justify-center border-r border-black/30 last:border-r-0"
                    title={`Intervalo: ${tick} a ${nextTick}`}
                  />
                );
              })}
            </div>
            <span className="text-purple-400 font-bold">{colorTicks[colorTicks.length - 1]}</span>
          </div>

          {activeVariable === 'rho' && (
            <span className="px-1 py-0.2 rounded text-[7.5px] font-bold bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 hidden xs:inline" title="Escala logarítmica para resistividades naturales">
              Log₁₀
            </span>
          )}

          {isScaleLocked && (
            <span className="px-1 py-0.2 rounded text-[7.5px] font-bold bg-amber-950/60 border border-amber-800/50 text-amber-300">
              Escala Bloqueada
            </span>
          )}
        </div>

        {/* Lithological Mining Indicators (Explicitly defined on 2D inverted true model) */}
        <div className="hidden sm:flex items-center gap-1.5 font-semibold text-[8px] sm:text-[8.5px] shrink-0 normal-case">
          <span className="opacity-60 text-[7.5px] italic">Litología en Modelo 2D Invertido (ρtrue):</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0a228c] inline-block shadow-sm" />
            Sulfuros (&lt;20 Ω·m)
          </span>
          <span className="opacity-30">│</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] inline-block" />
            Alteración (20-100 Ω·m)
          </span>
          <span className="opacity-30">│</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] inline-block shadow-sm" />
            Intrusivo (800-2500 Ω·m)
          </span>
          <span className="opacity-30">│</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9333ea] inline-block shadow-sm" />
            Vetas Cuarzo (&gt;2500 Ω·m)
          </span>
        </div>
      </div>

      {/* IP Decay Curve Modal */}
      {isIPDecayOpen && (
        <IPDecayCurveView
          batch={lastBatch.length > 0 ? lastBatch : points.slice(-8)}
          isSunlightMode={isSunlightMode}
          onClose={() => setIsIPDecayOpen(false)}
        />
      )}
    </div>
  );
};

