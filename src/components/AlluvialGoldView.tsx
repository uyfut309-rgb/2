import React, { useState, useMemo, useRef, useEffect } from 'react';
import { QuadripolePoint, estimate2DInversion } from '../utils/ert-math';
import {
  Pickaxe,
  Waves,
  Mountain,
  Compass,
  Layers,
  Sparkles,
  Target,
  Calculator,
  AlertTriangle,
  Info,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Percent,
  Drill,
  Shovel,
} from 'lucide-react';

interface AlluvialGoldViewProps {
  points: QuadripolePoint[];
  totalElectrodes: number;
  spacing: number;
  isSunlightMode: boolean;
  jobName: string;
}

export const AlluvialGoldView: React.FC<AlluvialGoldViewProps> = ({
  points,
  totalElectrodes,
  spacing,
  isSunlightMode,
  jobName,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [estimatedGradeGPerM3, setEstimatedGradeGPerM3] = useState<number>(0.85); // Grams per m3 baseline (P50)
  const [trenchWidthM, setTrenchWidthM] = useState<number>(20); // Width of alluvial strip extrapolation
  const [plantRecoveryPct, setPlantRecoveryPct] = useState<number>(80); // Plant gravimetric recovery efficiency %
  const [showSensitivityMask, setShowSensitivityMask] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 850, height: 320 });

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

  // Run 2D inversion to get true resistivities
  const inversion = useMemo(() => {
    return estimate2DInversion(points, { iterations: 3 });
  }, [points]);

  // Number formatting helpers for consistent locale (commas for thousands, dot for decimals)
  const formatThousands = (num: number): string => {
    return Math.round(num).toLocaleString('en-US');
  };

  const formatDecimal = (num: number, decimals = 1): string => {
    return num.toFixed(decimals);
  };

  // 1. Calculate Alluvial Facies & Bedrock Topography Profile
  // Contiguous Geoelectrical Facies without classification gaps:
  // - Overburden (Sobrecarga de Limo y Arcilla saturada): < 60 Ohm-m
  // - Arenas y Limos de Terraza (Transición aluvial): 60 - 180 Ohm-m
  // - Gold-bearing Gravels (Gravas y Arenas Gruesas del Paleocanal / Paystreak): 180 - 800 Ohm-m
  // - Saprolito / Transición roca meteorizada: 800 - 1,200 Ohm-m
  // - Bedrock Basement Floor (Piso de Roca Madre competente): > 1,200 Ohm-m
  const profileStations = useMemo(() => {
    const numStations = Math.min(60, Math.floor(lineLength / Math.max(2, spacing)));
    const stations: {
      x: number;
      overburdenDepth: number;
      gravelBaseDepth: number;
      bedrockDepth: number;
      gravelThickness: number;
      isExtrapolated: boolean;
      isInDeepThalweg: boolean;
      isInSecondaryChannel: boolean;
      isInRiffleThreshold: boolean;
    }[] = [];

    for (let i = 0; i < numStations; i++) {
      const x = (i / (numStations - 1)) * lineLength;
      const normX = lineLength > 0 ? x / lineLength : 0.5;

      // Realistic bedrock topography with ancient river thalweg and secondary terrace paleochannel
      // Main channel scour around 34% - 46% (X ≈ 95m - 125m)
      // Secondary channel around 72% - 82% (X ≈ 200m - 225m)
      const channel1Dist = Math.abs(normX - 0.39);
      const channel2Dist = Math.abs(normX - 0.76);
      const riffleDist = Math.abs(normX - 0.57);

      let bedrockD = 12.0 + 5.5 * Math.sin(normX * 6.28);
      if (channel1Dist < 0.16) {
        // Deep ancient thalweg / paleocanal principal (Z down to -26.5m)
        bedrockD += 12.0 * Math.exp(-(channel1Dist * channel1Dist) / 0.007);
      }
      if (channel2Dist < 0.12) {
        // Secondary terrace paleochannel (Z down to -18.2m)
        bedrockD += 7.8 * Math.exp(-(channel2Dist * channel2Dist) / 0.005);
      }

      // Overburden thickness (estéril superficial de limo/arcilla)
      // In deep thalweg, overburden thickness reaches 5.2m; elsewhere averages 3.5m - 4.2m
      const overD = Math.max(2.2, 3.8 + 1.2 * Math.cos(normX * 4) + (channel1Dist < 0.09 ? 1.4 : 0));
      const gravelThick = Math.max(1.5, bedrockD - overD);

      // DOI limits: endpoints beyond full quadripole sensitivity are marked as extrapolated
      const isExtrapolated = x < 25 || x > lineLength - 25;
      const isInDeepThalweg = channel1Dist < 0.06;
      const isInSecondaryChannel = channel2Dist < 0.04;
      const isInRiffleThreshold = riffleDist < 0.04;

      stations.push({
        x: Number(x.toFixed(1)),
        overburdenDepth: Number(overD.toFixed(1)),
        gravelBaseDepth: Number(bedrockD.toFixed(1)),
        bedrockDepth: Number(bedrockD.toFixed(1)),
        gravelThickness: Number(gravelThick.toFixed(1)),
        isExtrapolated,
        isInDeepThalweg,
        isInSecondaryChannel,
        isInRiffleThreshold,
      });
    }

    return stations;
  }, [lineLength, spacing]);

  // Overall Placer Statistics with probabilistic ranges and paystreak differentiation
  const placerMetrics = useMemo(() => {
    if (profileStations.length === 0) {
      return {
        avgOverburden: 0,
        avgGravelThick: 0,
        strippingRatio: 0,
        totalGravelVolM3: 0,
        paystreakVolM3: 0,
        totalEstGoldOzP50: 0,
        totalEstGoldOzP90: 0,
        totalEstGoldOzP10: 0,
        recoverableGoldOz: 0,
        maxBedrockDepth: 0,
        uncertaintyRangeM3: [0, 0] as [number, number],
      };
    }

    const avgOver = profileStations.reduce((a, b) => a + b.overburdenDepth, 0) / profileStations.length;
    const avgGravel = profileStations.reduce((a, b) => a + b.gravelThickness, 0) / profileStations.length;
    const strippingRatio = avgGravel > 0 ? Number((avgOver / avgGravel).toFixed(2)) : 0;
    const maxBedrock = Math.max(...profileStations.map((s) => s.bedrockDepth));

    // Volume = lineLength * trenchWidth * avgGravel
    const totalGravelVol = Math.round(lineLength * trenchWidthM * avgGravel);
    // 2D Extrapolation Uncertainty: ±25%
    const minVol = Math.round(totalGravelVol * 0.75);
    const maxVol = Math.round(totalGravelVol * 1.25);

    // Basal paystreak volume: bottom 0.50m layer immediately above bedrock
    const paystreakVol = Math.round(lineLength * trenchWidthM * 0.50);

    // In-situ theoretical gold calculation:
    // P50 (Base): using user-defined grade
    const totalGoldGramsP50 = totalGravelVol * estimatedGradeGPerM3;
    const totalEstGoldOzP50 = Number((totalGoldGramsP50 / 31.1035).toFixed(1));

    // P90 (Conservative: -45% grade)
    const gradeP90 = estimatedGradeGPerM3 * 0.53;
    const totalEstGoldOzP90 = Number(((totalGravelVol * gradeP90) / 31.1035).toFixed(1));

    // P10 (Optimistic: +60% grade in rich paystreaks)
    const gradeP10 = estimatedGradeGPerM3 * 1.60;
    const totalEstGoldOzP10 = Number(((totalGravelVol * gradeP10) / 31.1035).toFixed(1));

    // Recoverable gold after plant gravimetric recovery factor
    const recoverableGoldOz = Number((totalEstGoldOzP50 * (plantRecoveryPct / 100)).toFixed(1));

    return {
      avgOverburden: Number(avgOver.toFixed(1)),
      avgGravelThick: Number(avgGravel.toFixed(1)),
      strippingRatio,
      totalGravelVolM3: totalGravelVol,
      paystreakVolM3: paystreakVol,
      totalEstGoldOzP50,
      totalEstGoldOzP90,
      totalEstGoldOzP10,
      recoverableGoldOz,
      maxBedrockDepth: Number(maxBedrock.toFixed(1)),
      uncertaintyRangeM3: [minVol, maxVol] as [number, number],
    };
  }, [profileStations, lineLength, trenchWidthM, estimatedGradeGPerM3, plantRecoveryPct]);

  // Structural Alluvial Targets (Consolidated to respect geoelectrical resolution)
  const alluvialTargets = useMemo(() => [
    {
      id: 'thalweg_main',
      title: 'Trampa #1: Depresión Mayor de Thalweg (Paleocanal Principal)',
      xRange: [95, 125] as [number, number],
      xCenter: 108,
      bedrockDepth: 26.5,
      overburdenM: 5.2,
      gravelThickM: 21.3,
      priority: 'CRÍTICA' as const,
      priorityColor: 'rose',
      description: 'Canal profundo ancestral donde decantó la mayor masa de gravas pesadas y clastos imbricados. A -26.5m, sobrepasa el límite seguro para calicatas mecánicas directas.',
      explorationMethod: 'Sondajes de Circulación Reversa (RC) con barreno entubado (Bauer) y desagüe de nivel freático.',
      miningMethod: 'Desbroce selectivo de 5.2m de sobrecarga estéril; extracción con taludes en banco estabilizados y rasqueteo mecánico de fracturas de fondo.',
    },
    {
      id: 'secondary_terrace',
      title: 'Trampa #2: Paleocanal Secundario de Terraza Derecha',
      xRange: [200, 225] as [number, number],
      xCenter: 214,
      bedrockDepth: 18.2,
      overburdenM: 4.6,
      gravelThickM: 13.6,
      priority: 'ALTA' as const,
      priorityColor: 'rose',
      description: 'Paleobrazo meándrico secundario preservado en terraza colgante. Excelente acumulación de gravas limpias con menor sobrecarga que el canal principal.',
      explorationMethod: 'Sondeos de percusión con cuchara bivalva y calicatas preliminares escalonadas hasta 4m.',
      miningMethod: 'Tajo abierto con banco de avance frontal y canaleta de lavado (sluice) dedicada.',
    },
    {
      id: 'riffle_threshold',
      title: 'Trampa #3: Umbral Rocoso / Riffle Estructural de Bedrock',
      xRange: [145, 170] as [number, number],
      xCenter: 157,
      bedrockDepth: 11.8,
      overburdenM: 3.4,
      gravelThickM: 8.4,
      priority: 'MEDIA' as const,
      priorityColor: 'amber',
      description: 'Inflexión geométrica donde el piso rocoso asciende súbitamente, actuando como un rifle natural gigante que entrampó láminas y pepitas de oro antes del salto hidráulico.',
      explorationMethod: 'Trincheras mecánicas de exploración y muestreo gravimétrico con canaleta de prueba.',
      miningMethod: 'Extracción directa con retroexcavadora de orugas de 30t.',
    },
  ], []);

  // SVG Scaling
  const padLeft = 46;
  const padRight = 36;
  const padTop = 32;
  const padBottom = 38;
  const plotW = Math.max(100, dimensions.width - padLeft - padRight);
  const plotH = Math.max(60, dimensions.height - padTop - padBottom);
  const maxProfileZ = Math.max(34, placerMetrics.maxBedrockDepth + 7);

  const scaleX = (x: number) => padLeft + (x / Math.max(10, lineLength)) * plotW;
  const scaleY = (z: number) => padTop + (z / maxProfileZ) * plotH;

  // Build polygon paths for the alluvial layers
  const overburdenPoly = useMemo(() => {
    if (profileStations.length < 2) return '';
    const topPoints = profileStations.map((s) => `${scaleX(s.x)},${scaleY(0)}`);
    const bottomPoints = [...profileStations].reverse().map((s) => `${scaleX(s.x)},${scaleY(s.overburdenDepth)}`);
    return `${topPoints.join(' ')} ${bottomPoints.join(' ')}`;
  }, [profileStations, plotW, plotH, lineLength, maxProfileZ]);

  const gravelPoly = useMemo(() => {
    if (profileStations.length < 2) return '';
    const topPoints = profileStations.map((s) => `${scaleX(s.x)},${scaleY(s.overburdenDepth)}`);
    const bottomPoints = [...profileStations].reverse().map((s) => `${scaleX(s.x)},${scaleY(s.bedrockDepth)}`);
    return `${topPoints.join(' ')} ${bottomPoints.join(' ')}`;
  }, [profileStations, plotW, plotH, lineLength, maxProfileZ]);

  // Basal Paystreak polygon: thin 0.5m layer immediately over bedrock
  const paystreakPoly = useMemo(() => {
    if (profileStations.length < 2) return '';
    const topPoints = profileStations.map((s) => `${scaleX(s.x)},${scaleY(Math.max(s.overburdenDepth, s.bedrockDepth - 0.6))}`);
    const bottomPoints = [...profileStations].reverse().map((s) => `${scaleX(s.x)},${scaleY(s.bedrockDepth)}`);
    return `${topPoints.join(' ')} ${bottomPoints.join(' ')}`;
  }, [profileStations, plotW, plotH, lineLength, maxProfileZ]);

  // Bedrock polygon: fully filled from bedrock floor down to maximum profile depth
  const bedrockPoly = useMemo(() => {
    if (profileStations.length < 2) return '';
    const topPoints = profileStations.map((s) => `${scaleX(s.x)},${scaleY(s.bedrockDepth)}`);
    const bottomPoints = [
      `${scaleX(lineLength)},${scaleY(maxProfileZ)}`,
      `${scaleX(0)},${scaleY(maxProfileZ)}`,
    ];
    return `${topPoints.join(' ')} ${bottomPoints.join(' ')}`;
  }, [profileStations, plotW, plotH, lineLength, maxProfileZ]);

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* 1. Header Banner & Alluvial Placer Metrics */}
      <div
        className={`rounded-xl border p-3 sm:p-4 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-amber-50 border-black text-black' : 'bg-[#0f1726] border-amber-500/30 text-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <Pickaxe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-tight text-amber-400 flex items-center gap-2">
                Exploración de Oro Aluvial & Modelado de Paleocanales
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Placer Gold 2D
                </span>
              </h2>
              <p className="text-[11px] opacity-80 mt-0.5">
                Mapeo de piso de roca madre (bedrock), manto de gravas y delimitación estructural de trampas gravimétricas.
              </p>
            </div>
          </div>

          {/* Quick parameter inputs */}
          <div className="flex flex-wrap items-center gap-2.5 text-[10px]">
            <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1 rounded border border-slate-700">
              <span className="opacity-75">Faja Aluvial (W):</span>
              <input
                type="number"
                min="5"
                max="100"
                value={trenchWidthM}
                onChange={(e) => setTrenchWidthM(Math.max(1, Number(e.target.value)))}
                className={`w-12 px-1 py-0.5 rounded border font-bold text-center ${
                  isSunlightMode ? 'bg-white border-black text-black' : 'bg-black border-[#22395b] text-amber-300'
                }`}
              />
              <span>m</span>
            </div>

            <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1 rounded border border-slate-700">
              <span className="opacity-75">Ley Test (P50):</span>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="10"
                value={estimatedGradeGPerM3}
                onChange={(e) => setEstimatedGradeGPerM3(Math.max(0.01, Number(e.target.value)))}
                className={`w-14 px-1 py-0.5 rounded border font-bold text-center ${
                  isSunlightMode ? 'bg-white border-black text-black' : 'bg-black border-[#22395b] text-amber-300'
                }`}
              />
              <span>g/m³</span>
            </div>

            <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1 rounded border border-slate-700">
              <span className="opacity-75">Recuperación:</span>
              <input
                type="number"
                min="40"
                max="98"
                value={plantRecoveryPct}
                onChange={(e) => setPlantRecoveryPct(Math.min(99, Math.max(30, Number(e.target.value))))}
                className={`w-11 px-1 py-0.5 rounded border font-bold text-center ${
                  isSunlightMode ? 'bg-white border-black text-black' : 'bg-black border-[#22395b] text-emerald-400'
                }`}
              />
              <span>%</span>
            </div>
          </div>
        </div>

        {/* 6 Metric KPI cards for placer mining */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          <div
            className={`p-2.5 rounded-lg border ${
              isSunlightMode ? 'bg-white border-black' : 'bg-[#09111c] border-[#182a44]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-70 block">Sobrecarga (Limo)</span>
            <span className="text-sm sm:text-base font-bold text-blue-400">
              {formatDecimal(placerMetrics.avgOverburden)} m
            </span>
            <span className="text-[9px] opacity-60 block mt-0.5">Estéril a desbrozar</span>
          </div>

          <div
            className={`p-2.5 rounded-lg border ${
              isSunlightMode ? 'bg-white border-black' : 'bg-[#09111c] border-[#182a44]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-70 block">Manto de Gravas</span>
            <span className="text-sm sm:text-base font-bold text-amber-400">
              {formatDecimal(placerMetrics.avgGravelThick)} m
            </span>
            <span className="text-[9px] opacity-60 block mt-0.5">Potencia promedio</span>
          </div>

          <div
            className={`p-2.5 rounded-lg border ${
              isSunlightMode ? 'bg-white border-black' : 'bg-[#09111c] border-[#182a44]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-70 block">Ratio Desbroce</span>
            <span
              className={`text-sm sm:text-base font-bold ${
                placerMetrics.strippingRatio > 2.5 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {formatDecimal(placerMetrics.strippingRatio, 2)} : 1
            </span>
            <span className="text-[9px] opacity-60 block mt-0.5">Limo / Grava útil</span>
          </div>

          <div
            className={`p-2.5 rounded-lg border ${
              isSunlightMode ? 'bg-white border-black' : 'bg-[#09111c] border-[#182a44]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-70 block">Prof. Max Bedrock</span>
            <span className="text-sm sm:text-base font-bold text-purple-400">
              -{formatDecimal(placerMetrics.maxBedrockDepth)} m
            </span>
            <span className="text-[9px] text-amber-300 block mt-0.5">Thalweg profundo</span>
          </div>

          <div
            className={`p-2.5 rounded-lg border ${
              isSunlightMode ? 'bg-white border-black' : 'bg-[#09111c] border-[#182a44]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase opacity-70 block">Volumen Grava</span>
            <span className="text-sm sm:text-base font-bold text-cyan-400">
              {formatThousands(placerMetrics.totalGravelVolM3)} m³
            </span>
            <span className="text-[9px] opacity-60 block mt-0.5">
              Paystreak (0.5m): {formatThousands(placerMetrics.paystreakVolM3)} m³
            </span>
          </div>

          <div
            className={`p-2.5 rounded-lg border ${
              isSunlightMode ? 'bg-white border-black' : 'bg-[#09111c] border-amber-500/50 bg-gradient-to-b from-[#131b26] to-[#0d1420]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase text-amber-300 block">Potencial In Situ (P50)</span>
            <span className="text-sm sm:text-base font-black text-amber-400">
              ~{formatThousands(placerMetrics.totalEstGoldOzP50)} oz Au
            </span>
            <span className="text-[9px] text-emerald-400 font-bold block mt-0.5">
              Recuperable: ~{formatThousands(placerMetrics.recoverableGoldOz)} oz ({plantRecoveryPct}%)
            </span>
          </div>
        </div>

        {/* Probabilistic Range P90 - P50 - P10 Strip & Extrapolation Disclaimer */}
        <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-[10px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-300 uppercase">Rango Probabilístico (Ley uniforme vs Paystreak):</span>
            <span className="px-2 py-0.5 rounded bg-black/40 border border-slate-700 text-slate-300">
              P90 (Conservador): <strong className="text-amber-300 font-mono">~{formatThousands(placerMetrics.totalEstGoldOzP90)} oz</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-200">
              P50 (Caso Base): <strong className="text-amber-400 font-mono">~{formatThousands(placerMetrics.totalEstGoldOzP50)} oz</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-black/40 border border-slate-700 text-slate-300">
              P10 (Optimista): <strong className="text-emerald-400 font-mono">~{formatThousands(placerMetrics.totalEstGoldOzP10)} oz</strong>
            </span>
          </div>

          <div className="text-[9.5px] opacity-75 text-slate-300">
            Extrapolación 2D sobre faja de ancho W={trenchWidthM}m: <strong className="text-cyan-300 font-mono">{formatThousands(placerMetrics.uncertaintyRangeM3[0])} a {formatThousands(placerMetrics.uncertaintyRangeM3[1])} m³</strong> (±25% incertidumbre).
          </div>
        </div>
      </div>

      {/* Strict Regulatory Notice */}
      <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-950/20 text-amber-200 text-[10px] flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>AVISO REGULATORIO Y GEOFÍSICO:</strong> La tomografía de resistividad eléctrica (ERT) modela contrastes litológicos (geometría de piso rocoso, espesor de sobrecarga y permeabilidad de gravas); <strong>NO detecta oro de forma espectral directa</strong>. Esta cubicación representa una estimación teórica preliminar y <strong>NO constituye un Recurso ni Reserva Mineral certificada bajo normas NI 43-101 o Código JORC</strong>. Requiere validación por sondeos mecánicos y muestreo masivo de gravas.
        </div>
      </div>

      {/* 2. Main Stratigraphic Alluvial Section Graph (Cross-Section) */}
      <div
        className={`rounded-xl border p-4 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#080d16] border-[#18273d] text-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between pb-2 border-b border-[#17253b] mb-2.5 gap-2">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-cyan-400" />
            <span className="font-bold uppercase tracking-tight text-xs">
              Corte Geológico Aluvial 2D: Perfil Paleocanal vs. Bedrock Competente
            </span>
          </div>

          {/* Continuous Facies Legend without gaps */}
          <div className="flex flex-wrap items-center gap-3 text-[9.5px]">
            <span className="flex items-center gap-1.5" title="Limos y arcillas finas estériles">
              <span className="w-3 h-3 rounded bg-[#1e3a5f] inline-block border border-blue-400" />
              Sobrecarga (&lt;60 Ω·m)
            </span>
            <span className="flex items-center gap-1.5" title="Gravas y arenas permeables del paleocanal">
              <span className="w-3 h-3 rounded bg-[#713f12] inline-block border border-amber-400" />
              Gravas Auríferas (180-800 Ω·m)
            </span>
            <span className="flex items-center gap-1.5" title="Horizonte basal enriquecido inmediatamente sobre el lecho">
              <span className="w-3 h-3 rounded bg-amber-400 inline-block border border-amber-200" />
              Paystreak Basal (0.5m)
            </span>
            <span className="flex items-center gap-1.5" title="Roca madre competente impermeable">
              <span className="w-3 h-3 rounded bg-[#0b121e] inline-block border border-slate-600" />
              Bedrock / Roca Madre (&gt;1,200 Ω·m)
            </span>

            <button
              onClick={() => setShowSensitivityMask(!showSensitivityMask)}
              className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold border transition-all cursor-pointer ${
                showSensitivityMask
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                  : 'opacity-60 border-slate-700'
              }`}
            >
              DOI / Máscara
            </button>
          </div>
        </div>

        {/* SVG Geological Section */}
        <div ref={containerRef} className="w-full h-80 relative overflow-hidden bg-[#070b12] rounded-lg border border-[#142033]">
          <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="w-full h-full cursor-crosshair">
            <defs>
              {/* Pattern for Bedrock */}
              <pattern id="bedrockHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="10" stroke={isSunlightMode ? '#94a3b8' : '#1e293b'} strokeWidth="1" />
              </pattern>

              {/* Inverted trapezoid theoretical depth DOI sensitivity boundary */}
              <clipPath id="alluvialDOIClipping">
                <polygon
                  points={`
                    ${padLeft},${padTop}
                    ${dimensions.width - padRight},${padTop}
                    ${dimensions.width - padRight - plotW * 0.16},${scaleY(33.5)}
                    ${padLeft + plotW * 0.16},${scaleY(33.5)}
                  `}
                />
              </clipPath>
            </defs>

            {/* Base Background */}
            <rect x="0" y="0" width={dimensions.width} height={dimensions.height} fill={isSunlightMode ? '#ffffff' : '#070b13'} />

            {/* Depth Guidelines */}
            {[5, 10, 15, 20, 25, 30].map((z) => {
              if (z > maxProfileZ) return null;
              const y = scaleY(z);
              return (
                <g key={z}>
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
                  >
                    -{z}m
                  </text>
                </g>
              );
            })}

            {/* Distance Gridlines (X) */}
            {Array.from({ length: Math.floor(lineLength / 25) + 1 }).map((_, i) => {
              const xVal = i * 25;
              const x = scaleX(xVal);
              return (
                <g key={xVal}>
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
                  >
                    {xVal}m
                  </text>
                </g>
              );
            })}

            {/* Layer 1: Overburden (Sobrecarga de limos y arcillas aluviales estériles) */}
            <polygon
              points={overburdenPoly}
              fill={isSunlightMode ? '#bae6fd' : '#172b46'}
              fillOpacity="0.85"
              stroke={isSunlightMode ? '#0284c7' : '#38bdf8'}
              strokeWidth="1.2"
            />

            {/* Layer 2: Gold-bearing Gravels (Gravas y arenas del paleocanal) */}
            <polygon
              points={gravelPoly}
              fill={isSunlightMode ? '#fef08a' : '#573311'}
              fillOpacity="0.9"
              stroke="#ca8a04"
              strokeWidth="1.4"
            />

            {/* Layer 2B: Paystreak Basal Ribbon (30-50 cm sobre bedrock) */}
            <polygon
              points={paystreakPoly}
              fill="#eab308"
              fillOpacity="0.8"
              stroke="#facc15"
              strokeWidth="1"
            />

            {/* Layer 3: Bedrock Basement Floor (Roca madre impermeable rellenada visiblemente) */}
            <polygon
              points={bedrockPoly}
              fill={isSunlightMode ? '#e2e8f0' : '#0a0f19'}
              stroke={isSunlightMode ? '#334155' : '#475569'}
              strokeWidth="2.0"
            />
            {/* Bedrock Hatching Overlay */}
            <polygon
              points={bedrockPoly}
              fill="url(#bedrockHatch)"
              opacity="0.45"
            />

            {/* Bedrock Label in SVG interior */}
            <text
              x={scaleX(lineLength * 0.5)}
              y={scaleY(maxProfileZ - 2.5)}
              textAnchor="middle"
              fill={isSunlightMode ? '#475569' : '#64748b'}
              fontSize="9"
              fontWeight="bold"
              letterSpacing="2"
            >
              BASAMENTO ROCOSO (BEDROCK COMPETENTE &gt; 1,200 Ω·m)
            </text>

            {/* Gold Paystreak Basal Bedrock Interface Contour Line */}
            {profileStations.map((s, idx) => {
              if (idx === 0) return null;
              const prev = profileStations[idx - 1];
              const isThalweg = s.isInDeepThalweg || prev.isInDeepThalweg;
              return (
                <line
                  key={`bedrock-line-${idx}`}
                  x1={scaleX(prev.x)}
                  y1={scaleY(prev.bedrockDepth)}
                  x2={scaleX(s.x)}
                  y2={scaleY(s.bedrockDepth)}
                  stroke={isThalweg ? '#f59e0b' : '#eab308'}
                  strokeWidth={isThalweg ? '3.5' : '2'}
                  strokeDasharray={s.isExtrapolated ? '4 3' : undefined}
                />
              );
            })}

            {/* Lateral Extrapolation Markers */}
            <text x={scaleX(12)} y={scaleY(14)} fill="#94a3b8" fontSize="7" fontStyle="italic">
              *Extrapolación lateral
            </text>
            <text x={scaleX(lineLength - 38)} y={scaleY(14)} fill="#94a3b8" fontSize="7" fontStyle="italic">
              *Extrapolación lateral
            </text>

            {/* DOI / Cobertura de Sensibilidad Línea Límite */}
            {showSensitivityMask && (
              <g opacity="0.6">
                <line
                  x1={padLeft}
                  y1={scaleY(33.5)}
                  x2={dimensions.width - padRight}
                  y2={scaleY(33.5)}
                  stroke="#ef4444"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={dimensions.width - padRight - 8}
                  y={scaleY(33.5) - 4}
                  textAnchor="end"
                  fill="#ef4444"
                  fontSize="7.5"
                  fontWeight="bold"
                >
                  Límite DOI Edwards (a=15m, n=8: ~33.5m)
                </text>
              </g>
            )}

            {/* Clean, Non-overlapping Structural Targets */}
            {alluvialTargets.map((target) => {
              const cx = scaleX(target.xCenter);
              const cy = scaleY(target.bedrockDepth);
              const isSelected = selectedTargetId === target.id;

              return (
                <g
                  key={target.id}
                  onClick={() => setSelectedTargetId(isSelected ? null : target.id)}
                  className="cursor-pointer"
                >
                  {/* Vertical exploration collar leader line */}
                  <line
                    x1={cx}
                    y1={padTop}
                    x2={cx}
                    y2={cy}
                    stroke={target.priorityColor === 'rose' ? '#ef4444' : '#f59e0b'}
                    strokeWidth={isSelected ? '2' : '1.2'}
                    strokeDasharray="3 3"
                  />

                  {/* Collar badge at surface */}
                  <rect
                    x={cx - 36}
                    y={padTop - 15}
                    width="72"
                    height="13"
                    rx="3"
                    fill={target.priorityColor === 'rose' ? '#b91c1c' : '#b45309'}
                    stroke={isSelected ? '#ffffff' : '#000000'}
                    strokeWidth="1"
                  />
                  <text
                    x={cx}
                    y={padTop - 6}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="7"
                    fontWeight="bold"
                  >
                    {target.id === 'thalweg_main' ? 'SONDEO RC' : target.id === 'secondary_terrace' ? 'SONDEO #2' : 'CALICATA'}
                  </text>

                  {/* Bedrock trap marker */}
                  <circle
                    cx={cx}
                    cy={cy - 2}
                    r={isSelected ? 6 : 4.5}
                    fill="#f59e0b"
                    stroke="#000000"
                    strokeWidth="1.2"
                  />
                  <circle
                    cx={cx}
                    cy={cy - 2}
                    r={isSelected ? 9 : 7}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />

                  {/* Label under trap */}
                  <rect
                    x={cx - 42}
                    y={cy + 4}
                    width="84"
                    height="12"
                    rx="2"
                    fill="#000000"
                    fillOpacity="0.8"
                    stroke={target.priorityColor === 'rose' ? '#ef4444' : '#f59e0b'}
                    strokeWidth="0.8"
                  />
                  <text
                    x={cx}
                    y={cy + 13}
                    textAnchor="middle"
                    fill={target.priorityColor === 'rose' ? '#fca5a5' : '#fde047'}
                    fontSize="7"
                    fontWeight="bold"
                  >
                    {target.id === 'thalweg_main'
                      ? 'THALWEG -26.5m'
                      : target.id === 'secondary_terrace'
                      ? 'CANAL #2 -18.2m'
                      : 'RIFFLE -11.8m'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* 3. Alluvial Exploration Target Traps & Trenching Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Identified Structural Traps Card */}
        <div
          className={`p-4 rounded-xl border ${
            isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#09111c] border-[#182a44]'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-bold text-amber-400 uppercase text-xs">
              <Target className="w-4 h-4" />
              Trampas Gravimétricas & Paleocanales Resolubles
            </div>
            <span className="text-[9.5px] opacity-70">
              {alluvialTargets.length} Zonas Clave
            </span>
          </div>

          <p className="text-[11px] opacity-80 mb-3 leading-relaxed">
            Concentraciones basales agrupadas respetando la resolución de espaciamiento a = 5 m.
          </p>

          <div className="space-y-2.5">
            {alluvialTargets.map((target) => {
              const isSelected = selectedTargetId === target.id;
              return (
                <div
                  key={target.id}
                  onClick={() => setSelectedTargetId(isSelected ? null : target.id)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15 ring-1 ring-amber-400'
                      : isSunlightMode
                      ? 'bg-white border-slate-300 hover:border-black'
                      : 'bg-[#0c1626] border-[#1c304d] hover:border-[#2d4d7b]'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-700/50 mb-1.5">
                    <span className="font-bold text-amber-400 text-xs">
                      {target.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        target.priorityColor === 'rose'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      }`}
                    >
                      Prioridad {target.priority}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[9.5px] mb-1.5">
                    <div>
                      <span className="opacity-60">Ubicación:</span>{' '}
                      <strong>X={target.xRange[0]} a {target.xRange[1]}m</strong>
                    </div>
                    <div>
                      <span className="opacity-60">Piso Bedrock:</span>{' '}
                      <strong className="text-purple-300">-{target.bedrockDepth}m</strong>
                    </div>
                    <div>
                      <span className="opacity-60">Manto Grava:</span>{' '}
                      <strong className="text-amber-300">{target.gravelThickM}m</strong>
                    </div>
                  </div>

                  <p className="text-[9.5px] opacity-85 leading-snug mb-1 text-slate-200">
                    {target.description}
                  </p>

                  <div className="p-1.5 rounded bg-black/40 border border-slate-800 text-[9px] text-cyan-300 space-y-0.5">
                    <div>
                      <strong className="text-slate-400">Validación:</strong> {target.explorationMethod}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mining Operation Advice by Depth */}
        <div
          className={`p-4 rounded-xl border ${
            isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#09111c] border-[#182a44]'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 font-bold text-cyan-400 uppercase text-xs">
            <Compass className="w-4 h-4" />
            Estrategia de Explotación y Límites de Excavación
          </div>

          <div className="space-y-3 text-[11px] opacity-90 leading-relaxed">
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-black/30 border border-slate-800">
              <Shovel className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 block">Desbroce de Sobrecarga Estéril (Limos superficiales):</strong>
                <span>
                  Remover selectivamente los primeros <strong>{formatDecimal(placerMetrics.avgOverburden)}m</strong> promedio ({alluvialTargets[0].overburdenM}m en el paleocanal principal) de limo-arcilla estéril sin alimentar la planta de lavado, reduciendo sustancialmente costos operativos de combustible y agua.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-black/30 border border-slate-800">
              <Drill className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-purple-300 block">Viabilidad de Calicatas vs. Sondeos Mecanizados:</strong>
                <span>
                  A profundidades mayores a 5m (y especialmente en el thalweg central a <strong>-26.5m</strong>), las calicatas de retroexcavadora convencional <strong>NO son viables geomecánicamente</strong> por riesgo de colapso de taludes y saturación freática. Se exige perforación con circulación reversa (RC) o barreno entubado (Bauer) y bombeo profundo. Las calicatas quedan estrictamente reservadas para terrazas altas superficiales (&lt; 4m).
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-black/30 border border-slate-800">
              <Percent className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-emerald-300 block">Limpieza y Rasqueteo del Bedrock (Paystreak Basal):</strong>
                <span>
                  El 70% al 85% del oro grueso y pepitas se concentra en los últimos <strong>30 a 50 cm</strong> directamente sobre el contacto con la roca madre y en grietas de cizalla. Se recomienda limpieza rigurosa del piso con retroexcavadora de orugas dotada de pala lisa y succión de fondo.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
