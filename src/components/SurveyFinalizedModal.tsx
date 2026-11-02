import React from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { SequenceConfig, QuadripolePoint } from '../utils/ert-math';

interface SurveyFinalizedModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SequenceConfig & { jobName: string };
  points: QuadripolePoint[];
  currentIndex: number;
  totalPoints: number;
  isSunlightMode: boolean;
  onOpenQCReport: () => void;
  onGoToFiles: () => void;
}

export const SurveyFinalizedModal: React.FC<SurveyFinalizedModalProps> = ({
  isOpen,
  onClose,
  config,
  points,
  currentIndex,
  totalPoints,
  isSunlightMode,
  onOpenQCReport,
  onGoToFiles,
}) => {
  if (!isOpen) return null;

  const recordedPoints = points.length > 0 ? points.length : currentIndex;
  const errors = points.map((p) => p.err || 0);
  const avgErr = errors.length ? (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(2) : '0.00';
  const totalLength = (config.electrodes - 1) * config.spacing;

  const handleDownload = (format: 'stg' | 'z2d' | 'csv') => {
    const filename = `${config.jobName}.${format}`;
    const url = `/api/files/${config.jobName}.stg/export?format=${format}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm">
      <div
        className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl transition-colors font-sans flex flex-col gap-4 max-h-[92vh] overflow-y-auto ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1322] border-[#223654] text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-tight">Levantamiento Finalizado</h2>
              <p className="text-xs opacity-75">Archivo registrado y verificado en memoria interna</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition-colors ${
              isSunlightMode ? 'border-black hover:bg-slate-100' : 'border-[#1b2b41] hover:bg-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Saved File Banner */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between font-mono text-xs ${
            isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1f314d]'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="font-bold text-emerald-400">{config.jobName}.stg</div>
              <div className="text-[10px] opacity-70">Formato Nativo AGI SuperSting R8</div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            GUARDADO
          </span>
        </div>

        {/* Survey Summary Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div
            className={`p-2.5 rounded-xl border ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#0f1a2a] border-[#1e2f47]'
            }`}
          >
            <span className="text-[10px] opacity-70 block uppercase">Puntos Medidos</span>
            <span className="text-sm font-bold text-cyan-400">{recordedPoints} quadripolos</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#0f1a2a] border-[#1e2f47]'
            }`}
          >
            <span className="text-[10px] opacity-70 block uppercase">Error Repeat Promedio</span>
            <span className="text-sm font-bold text-emerald-400">{avgErr}%</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#0f1a2a] border-[#1e2f47]'
            }`}
          >
            <span className="text-[10px] opacity-70 block uppercase">Geometría Arreglo</span>
            <span className="text-xs font-bold">{config.arrayType.toUpperCase()} ({config.electrodes} picas, {config.spacing}m)</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#0f1a2a] border-[#1e2f47]'
            }`}
          >
            <span className="text-[10px] opacity-70 block uppercase">Longitud de Línea</span>
            <span className="text-xs font-bold text-amber-400">{totalLength} metros</span>
          </div>
        </div>

        {/* Direct Download Options */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold font-mono opacity-80 uppercase">Descarga Inmediata de Datos</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleDownload('stg')}
              className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-mono font-bold transition-all ${
                isSunlightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-black text-black'
                  : 'bg-[#152338] hover:bg-[#1d314f] border-[#223654] text-cyan-300'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>.STG</span>
              <span className="text-[9px] opacity-60 font-sans">SuperSting</span>
            </button>

            <button
              onClick={() => handleDownload('z2d')}
              className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-mono font-bold transition-all ${
                isSunlightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-black text-black'
                  : 'bg-[#152338] hover:bg-[#1d314f] border-[#223654] text-purple-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>.Z2D</span>
              <span className="text-[9px] opacity-60 font-sans">EarthImager</span>
            </button>

            <button
              onClick={() => handleDownload('csv')}
              className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-mono font-bold transition-all ${
                isSunlightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-black text-black'
                  : 'bg-[#152338] hover:bg-[#1d314f] border-[#223654] text-emerald-300'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>.CSV</span>
              <span className="text-[9px] opacity-60 font-sans">Excel</span>
            </button>
          </div>
        </div>

        {/* Navigation & QC Cert actions */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t mt-1">
          <button
            onClick={() => {
              onClose();
              onOpenQCReport();
            }}
            className={`w-full sm:flex-1 py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors ${
              isSunlightMode
                ? 'bg-emerald-50 border-black text-emerald-950 hover:bg-emerald-100'
                : 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Ver Certificado QC</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onGoToFiles();
            }}
            className={`w-full sm:flex-1 py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors ${
              isSunlightMode
                ? 'bg-slate-100 border-black text-black hover:bg-slate-200'
                : 'bg-[#16253c] border-[#263c5e] text-slate-200 hover:bg-[#1d314f]'
            }`}
          >
            <span>Gestor Archivos</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
