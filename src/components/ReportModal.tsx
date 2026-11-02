import React from 'react';
import { SequenceConfig, QuadripolePoint } from '../utils/ert-math';
import { Printer, X, ShieldCheck, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SequenceConfig & { jobName: string };
  points: QuadripolePoint[];
  contactSummary: any;
  instrument: any;
  isSunlightMode: boolean;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  config,
  points,
  contactSummary,
  instrument,
  isSunlightMode,
}) => {
  if (!isOpen) return null;

  const totalLength = (config.electrodes - 1) * config.spacing;
  const rhos = points.map((p) => p.rho).filter((r) => r > 0);
  const minRho = rhos.length ? Math.min(...rhos).toFixed(1) : '0';
  const maxRho = rhos.length ? Math.max(...rhos).toFixed(1) : '0';
  const avgRho = rhos.length ? (rhos.reduce((a, b) => a + b, 0) / rhos.length).toFixed(1) : '0';

  const errors = points.map((p) => p.err || 0);
  const avgErr = errors.length ? (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(2) : '0.00';
  const pointsUnder2Pct = errors.filter((e) => e <= 2.0).length;
  const qcCompliancePct = points.length ? Math.round((pointsUnder2Pct / points.length) * 100) : 100;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-3xl rounded-2xl border p-5 sm:p-7 shadow-2xl transition-colors font-sans max-h-[92vh] flex flex-col ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0d1422] border-[#223654] text-white'
        }`}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between pb-3 border-b mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-tight">
                Certificado de Campaña y Control de Calidad (QC)
              </h2>
              <p className="text-xs opacity-75">
                Informe Técnico Oficial para Proyectos de Exploración Minera e Hidrogeológica
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                isSunlightMode ? 'bg-black text-white border-black hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Report Body */}
        <div className="flex-1 overflow-y-auto pr-1 text-xs space-y-4 font-mono">
          {/* Institutional Header Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#080e19] border-[#182a44]'
            }`}
          >
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 block">
                INFORME TÉCNICO DE ADQUISICIÓN DE TERRENO
              </span>
              <span className="text-base font-bold">LÍNEA: {config.jobName}</span>
              <div className="text-[11px] opacity-80 mt-0.5">
                Instrumento: AGI SuperSting R8/IP 8-Channel · FW {instrument.firmware}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] opacity-70 block">CUMPLIMIENTO QC GLOBAL</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {qcCompliancePct}% APROBADO
              </span>
            </div>
          </div>

          {/* Technical Specifications Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className={`p-2.5 rounded-lg border ${isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1a2d48]'}`}>
              <span className="text-[10px] opacity-70 uppercase block">Arreglo</span>
              <span className="font-bold text-sm text-cyan-600 dark:text-cyan-400">{config.arrayType.toUpperCase()}</span>
            </div>
            <div className={`p-2.5 rounded-lg border ${isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1a2d48]'}`}>
              <span className="text-[10px] opacity-70 uppercase block">Electrodos</span>
              <span className="font-bold text-sm">{config.electrodes} Picas</span>
            </div>
            <div className={`p-2.5 rounded-lg border ${isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1a2d48]'}`}>
              <span className="text-[10px] opacity-70 uppercase block">Espaciado "a"</span>
              <span className="font-bold text-sm">{config.spacing} metros</span>
            </div>
            <div className={`p-2.5 rounded-lg border ${isSunlightMode ? 'bg-slate-100 border-black' : 'bg-[#0f1b2d] border-[#1a2d48]'}`}>
              <span className="text-[10px] opacity-70 uppercase block">Longitud Perfil</span>
              <span className="font-bold text-sm text-amber-600 dark:text-amber-400">{totalLength} metros</span>
            </div>
          </div>

          {/* Statistics Strip */}
          <div
            className={`p-4 rounded-xl border ${
              isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#080e19] border-[#182a44]'
            }`}
          >
            <span className="font-bold uppercase tracking-wider block text-xs mb-3">
              Métricas Estadísticas del Levantamiento (QC & Física)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="opacity-70 block text-[10px]">PUNTOS ADQUIRIDOS</span>
                <span className="text-base font-bold">{points.length} / {points.length}</span>
              </div>
              <div>
                <span className="opacity-70 block text-[10px]">ERROR PROMEDIO (REPEAT)</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{avgErr}%</span>
              </div>
              <div>
                <span className="opacity-70 block text-[10px]">RANGO RESISTIVIDAD</span>
                <span className="text-base font-bold">{minRho} - {maxRho} Ω·m</span>
              </div>
              <div>
                <span className="opacity-70 block text-[10px]">RESISTIVIDAD MEDIA</span>
                <span className="text-base font-bold text-amber-500">{avgRho} Ω·m</span>
              </div>
            </div>
          </div>

          {/* Contact Resistance Summary */}
          {contactSummary && (
            <div
              className={`p-4 rounded-xl border ${
                isSunlightMode ? 'bg-slate-50 border-black' : 'bg-[#080e19] border-[#182a44]'
              }`}
            >
              <span className="font-bold uppercase tracking-wider block text-xs mb-2">
                Auditoría de Acoplamiento Suelo-Pica (Contact Test)
              </span>
              <p className="text-xs opacity-85 leading-relaxed mb-3">
                Mediana de red registrada: <strong>{contactSummary.medianKohm} kΩ</strong>. El {Math.round(((contactSummary.under1_8k ?? contactSummary.under2k) / contactSummary.totalElectrodes) * 100)}% de los electrodos presentaron contacto óptimo (&lt; 1.8 kΩ, plena potencia Tx 200W), con {contactSummary.between1_8and5k ?? contactSummary.between2and5k} electrodos en rango aceptable AGI (1.8 - 5.0 kΩ) y {contactSummary.over5k ?? (contactSummary.between5and10k + contactSummary.over10k)} en nivel crítico (&gt; 5.0 kΩ).
              </p>
              {contactSummary.badElectrodes?.length > 0 && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                  Electrodos con acondicionamiento de salmuera requerido: {contactSummary.badElectrodes.map((e: any) => `#${e.electrode}`).join(', ')}.
                </div>
              )}
            </div>
          )}

          {/* Formal Geophysical Sign-Off Block */}
          <div className="pt-4 border-t grid grid-cols-2 gap-6 mt-4">
            <div className="border-t border-dashed border-slate-500 pt-2 text-center text-[10px] opacity-75">
              Firma: Geofísico de Adquisición de Terreno<br />
              SuperSting R8 Certified Field Operator
            </div>
            <div className="border-t border-dashed border-slate-500 pt-2 text-center text-[10px] opacity-75">
              Aprobación QA/QC Gabinete<br />
              Supervisor de Proyecto de Exploración
            </div>
          </div>
        </div>

        <div className="pt-3 border-t mt-3 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${
              isSunlightMode ? 'border-black hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'
            }`}
          >
            Cerrar Certificado
          </button>
        </div>
      </div>
    </div>
  );
};
