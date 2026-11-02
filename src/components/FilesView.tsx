import React, { useState, useEffect } from 'react';
import {
  FolderArchive,
  Download,
  FileText,
  RefreshCw,
  Eye,
  Trash2,
  Edit2,
  HardDrive,
  CheckCircle,
  FileCode,
  Package,
  Layers,
  Info,
  Copy,
  Check,
  ShieldCheck,
  Compass,
  Zap,
  Sliders,
  Cpu,
  FileDown,
} from 'lucide-react';

export interface FileMetadata {
  serialNumber: string;
  firmware: string;
  maxCurrentMa: number;
  maxVoltageVp: number;
  minStacks: number;
  maxStacks: number;
  stackErrorThresholdPct: number;
  isIP: boolean;
  ipCycleSec: number;
  operator: string;
  gpsVertexA: { lat: number; lon: number; elevM: number };
  gpsVertexB: { lat: number; lon: number; elevM: number };
  gpsSatellites: number;
  gpsFix: string;
  hashSha256: string;
  syncStatus: 'synced_with_r8' | 'in_buffer_r8';
}

export interface StoredFile {
  name: string;
  baseName: string;
  type: 'survey' | 'cmd';
  formatsAvailable: string[];
  pointsCount: number;
  createdAt: string; // ISO 8601 with timezone
  sizeBytes: number;
  metadata?: FileMetadata;
}

interface StorageStatus {
  totalCapacity: number;
  usedPoints: number;
  freePoints: number;
  freePct: number;
  filesCount: number;
  flashStatus: string;
  backupBatteryV: number;
}

interface FilesViewProps {
  isSunlightMode: boolean;
}

export const FilesView: React.FC<FilesViewProps> = ({ isSunlightMode }) => {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'survey' | 'cmd'>('all');

  // Preview state
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [previewFormat, setPreviewFormat] = useState<string>('stg');
  const [activePreviewFile, setActivePreviewFile] = useState<StoredFile | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Metadata detail modal state
  const [inspectingFile, setInspectingFile] = useState<StoredFile | null>(null);
  const [isHashCopied, setIsHashCopied] = useState(false);

  // Rename modal state
  const [renamingFile, setRenamingFile] = useState<StoredFile | null>(null);
  const [newNameInput, setNewNameInput] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [filesRes, storageRes] = await Promise.all([
        fetch('/api/files'),
        fetch('/api/instrument/storage'),
      ]);
      const filesData = await filesRes.json();
      const storageData = await storageRes.json();

      if (filesData.status === 'ok') {
        setFiles(filesData.files || []);
      }
      if (storageData.status === 'ok') {
        setStorage(storageData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownload = (filename: string, format: string) => {
    const url = `/api/files/${encodeURIComponent(filename)}/export?format=${format}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename.replace(/\.[^.]+$/, '')}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadZip = (filename: string) => {
    const url = `/api/files/${encodeURIComponent(filename)}/zip`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename.replace(/\.[^.]+$/, '')}_PACKAGE.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = async (file: StoredFile, format: string) => {
    try {
      setActivePreviewFile(file);
      setPreviewFormat(format);
      const targetName = `${file.baseName || file.name.replace(/\.[^.]+$/, '')}.${format}`;
      setPreviewFilename(targetName);
      const res = await fetch(`/api/files/${encodeURIComponent(file.name)}/export?format=${format}`);
      const text = await res.text();
      setPreviewContent(text);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el archivo ${filename} del almacenamiento del equipo?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'ok') {
        await loadData();
        if (inspectingFile?.name === filename) setInspectingFile(null);
        if (activePreviewFile?.name === filename) setPreviewContent(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveRename = async () => {
    if (!renamingFile || !newNameInput.trim()) return;
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(renamingFile.name)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: newNameInput.trim() }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setRenamingFile(null);
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyPreview = () => {
    if (!previewContent) return;
    navigator.clipboard.writeText(previewContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setIsHashCopied(true);
    setTimeout(() => setIsHashCopied(false), 2000);
  };

  const filteredFiles = files.filter((f) => {
    if (activeCategory === 'all') return true;
    return f.type === activeCategory;
  });

  return (
    <div className="space-y-4">
      {/* 1. Hardware Storage Telemetry Ribbon */}
      <div
        className={`rounded-xl border p-4 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/40 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-tight">
                Almacenamiento Interno & Archivos SuperSting R8/IP
              </h2>
              <span className="text-[10px] font-mono opacity-70">
                Memoria Flash No Volátil · Capacidad 80,000 Lecturas · Sincronización Automática
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border cursor-pointer ${
                isSunlightMode
                  ? 'bg-slate-100 border-black hover:bg-slate-200 text-black'
                  : 'bg-[#142338] border-[#203657] hover:bg-[#1f3757] text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* Memory Flash Gauge */}
        {storage && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-slate-50 border-slate-300' : 'bg-[#060b13] border-[#132237]'
              }`}
            >
              <span className="text-[10px] uppercase opacity-70 block">Memoria Libre</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold text-emerald-400">{storage.freePct}%</span>
                <span className="text-[10px] opacity-75">({storage.freePoints.toLocaleString()} lecturas)</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${storage.freePct}%` }}
                />
              </div>
            </div>

            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-slate-50 border-slate-300' : 'bg-[#060b13] border-[#132237]'
              }`}
            >
              <span className="text-[10px] uppercase opacity-70 block">Lecturas Registradas</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold text-cyan-400">{storage.usedPoints.toLocaleString()}</span>
                <span className="text-[10px] opacity-75">de {storage.totalCapacity.toLocaleString()}</span>
              </div>
              <span className="text-[9.5px] opacity-60 block mt-1">En {storage.filesCount} perfiles activos</span>
            </div>

            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-slate-50 border-slate-300' : 'bg-[#060b13] border-[#132237]'
              }`}
            >
              <span className="text-[10px] uppercase opacity-70 block">Batería de Respaldo RAM</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-base font-bold text-emerald-400">{storage.backupBatteryV} V</span>
                <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">ÓPTIMA</span>
              </div>
              <span className="text-[9.5px] opacity-60 block mt-1">Preserva calibración y RTC</span>
            </div>

            <div
              className={`p-2.5 rounded-lg border ${
                isSunlightMode ? 'bg-slate-50 border-slate-300' : 'bg-[#060b13] border-[#132237]'
              }`}
            >
              <span className="text-[10px] uppercase opacity-70 block">Estado del Hardware</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-200 truncate">Memoria Flash 100% OK</span>
              </div>
              <span className="text-[9.5px] opacity-60 block mt-1 truncate">Firmware v4.2.1-AGI</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. File Explorer & Action Center */}
      <div
        className={`rounded-xl border p-4 sm:p-5 shadow-xl transition-colors ${
          isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0b1320] border-[#1e2e46] text-white'
        }`}
      >
        {/* Filter Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/40 pb-3 mb-4">
          <div className="flex items-center gap-1.5 bg-[#060c16] p-1 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({files.length})
            </button>
            <button
              onClick={() => setActiveCategory('survey')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'survey'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Perfiles Medidos ({files.filter((f) => f.type === 'survey').length})</span>
            </button>
            <button
              onClick={() => setActiveCategory('cmd')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'cmd'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Comandos .CMD ({files.filter((f) => f.type === 'cmd').length})</span>
            </button>
          </div>

          <span className="text-[10px] font-mono opacity-65">
            Nomenclatura: PROYECTO_LINEA_ARREGLO_aXX_AAAAMMDD_HHMM
          </span>
        </div>

        {/* Files Table */}
        {filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-xs font-mono opacity-70">
            No se encontraron archivos en esta categoría.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFiles.map((file) => {
              const isSurvey = file.type === 'survey';
              return (
                <div
                  key={file.name}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSunlightMode
                      ? 'bg-slate-50 border-slate-300 hover:border-black'
                      : 'bg-[#070e17] border-[#152338] hover:border-[#213a5e]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2.5">
                    {/* Filename & Type Indicator */}
                    <div className="flex items-center gap-2 min-w-0">
                      {isSurvey ? (
                        <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shrink-0">
                          <Layers className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 shrink-0">
                          <FileCode className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs sm:text-sm text-slate-100 truncate">
                            {file.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${
                              isSurvey
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                            }`}
                          >
                            {isSurvey ? 'DATOS MEDIDOS' : 'SCRIPT COMANDOS'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-mono opacity-75 mt-0.5">
                          <span>Fin Adquisición: <strong className="text-slate-300">{file.createdAt}</strong></span>
                          <span>•</span>
                          <span>{file.pointsCount} {isSurvey ? 'cuadripolos' : 'comandos'}</span>
                          <span>•</span>
                          <span>{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                          {file.metadata?.hashSha256 && (
                            <>
                              <span>•</span>
                              <span className="text-cyan-400/80 truncate max-w-[140px]" title={file.metadata.hashSha256}>
                                SHA-256: {file.metadata.hashSha256.slice(0, 10)}...
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Metadata & Rename/Delete Utility Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {file.metadata && (
                        <button
                          type="button"
                          onClick={() => setInspectingFile(file)}
                          className="px-2 py-1 rounded text-[11px] font-mono font-bold bg-[#142338] hover:bg-[#1f3757] text-cyan-300 border border-cyan-500/30 flex items-center gap-1 cursor-pointer"
                          title="Inspeccionar Metadatos, GPS, Calibración y Hash Criptográfico"
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Metadatos</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingFile(file);
                          setNewNameInput(file.name);
                        }}
                        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Renombrar archivo"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(file.name)}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="Eliminar archivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Actions by Type: Distinct actions for Measured Surveys vs Command Sequences */}
                  <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2">
                    {isSurvey ? (
                      /* Measured Data Survey Actions: .stg, .crs, .dat, .z2d, .csv, and complete ZIP package */
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePreview(file, 'stg')}
                          className="px-2 py-1 rounded text-[10.5px] font-mono font-bold bg-[#111c2e] hover:bg-[#1a2c48] border border-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
                          title="Vista previa del archivo"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Ver</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(file.name, 'stg')}
                          className="px-2 py-1 rounded text-[10.5px] font-mono font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 flex items-center gap-1 cursor-pointer"
                          title="Descargar en formato nativo SuperSting (.stg)"
                        >
                          <Download className="w-3 h-3" />
                          <span>.stg</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(file.name, 'crs')}
                          className="px-2 py-1 rounded text-[10.5px] font-mono font-bold bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 flex items-center gap-1 cursor-pointer"
                          title="Descargar archivo AGI Contact Resistance Survey (.crs)"
                        >
                          <Download className="w-3 h-3" />
                          <span>.crs</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(file.name, 'dat')}
                          className="px-2 py-1 rounded text-[10.5px] font-mono font-bold bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 flex items-center gap-1 cursor-pointer"
                          title="Descargar formato Res2DInv (.dat) con bloque de topografía de M.H. Loke"
                        >
                          <Download className="w-3 h-3" />
                          <span>.dat (Res2DInv)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(file.name, 'z2d')}
                          className="px-2 py-1 rounded text-[10.5px] font-mono font-bold bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 flex items-center gap-1 cursor-pointer"
                          title="Descargar formato ZondRes2D / EarthImager 2D (.z2d) con topografía real"
                        >
                          <Download className="w-3 h-3" />
                          <span>.z2d (ZondRes2D)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(file.name, 'csv')}
                          className="px-2 py-1 rounded text-[10.5px] font-mono font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 flex items-center gap-1 cursor-pointer"
                          title="Descargar tabla completa en CSV"
                        >
                          <Download className="w-3 h-3" />
                          <span>.csv</span>
                        </button>
                      </div>
                    ) : (
                      /* Command Sequence Script (.cmd) Actions: No .stg/.z2d because .cmd has no measured data! */
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePreview(file, 'cmd')}
                          className="px-2.5 py-1 rounded text-[10.5px] font-mono font-bold bg-[#111c2e] hover:bg-[#1a2c48] border border-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Ver Script .CMD</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(file.name, 'cmd')}
                          className="px-2.5 py-1 rounded text-[10.5px] font-mono font-bold bg-cyan-600/20 hover:bg-cyan-600/35 border border-cyan-500/40 text-cyan-300 flex items-center gap-1 cursor-pointer"
                          title="Descargar script AGI .CMD multicanal"
                        >
                          <Download className="w-3 h-3" />
                          <span>Descargar .CMD</span>
                        </button>
                      </div>
                    )}

                    {/* Complete ZIP Package Export for Survey Profiles */}
                    {isSurvey && (
                      <button
                        type="button"
                        onClick={() => handleDownloadZip(file.name)}
                        className={`px-3 py-1 rounded text-[10.5px] font-mono font-bold flex items-center gap-1.5 border transition-all cursor-pointer shadow-sm ${
                          isSunlightMode
                            ? 'bg-amber-600 hover:bg-amber-700 text-white border-black'
                            : 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white border-amber-400/60 shadow-amber-950/40'
                        }`}
                        title="Descargar paquete ZIP completo del levantamiento (.stg, .crs, .dat, .z2d, .csv, .cmd y reporte de certificación)"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Paquete Completo (.ZIP)</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Metadata & Cryptographic QA/QC Inspector Modal */}
      {inspectingFile && inspectingFile.metadata && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0a121e] border-[#1e3350] text-white'
            }`}
          >
            <div className="px-5 py-3.5 border-b border-slate-700/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold uppercase tracking-tight">
                  Certificado de Calibración & Metadatos QA/QC
                </h3>
              </div>
              <button
                onClick={() => setInspectingFile(null)}
                className="text-xs px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 cursor-pointer"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
              {/* File Identity */}
              <div className="p-3 rounded-lg border bg-[#060b13] border-[#132237] space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Archivo Registrado</span>
                <span className="font-bold text-sm text-cyan-300 block">{inspectingFile.name}</span>
                <span className="text-[11px] opacity-75 block">Fin de Adquisición: {inspectingFile.createdAt}</span>
              </div>

              {/* Hardware & Calibration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-[#060b13] border-[#132237]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Equipo & Firmware</span>
                  <div className="space-y-1 text-[11px]">
                    <div>Modelo: <strong>SuperSting R8/IP (8-CH)</strong></div>
                    <div>N° Serie: <strong>{inspectingFile.metadata.serialNumber}</strong></div>
                    <div>Firmware: <strong>{inspectingFile.metadata.firmware}</strong></div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-[#060b13] border-[#132237]">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Ajustes de Adquisición</span>
                  <div className="space-y-1 text-[11px]">
                    <div>Inyección: <strong>{inspectingFile.metadata.maxCurrentMa} mA @ {inspectingFile.metadata.maxVoltageVp} Vp-p</strong></div>
                    <div>Stacks: <strong>{inspectingFile.metadata.minStacks}-{inspectingFile.metadata.maxStacks} (RMS &lt; {inspectingFile.metadata.stackErrorThresholdPct}%)</strong></div>
                    <div>Modo: <strong>{inspectingFile.metadata.isIP ? `TDIP (${inspectingFile.metadata.ipCycleSec}s ciclo)` : 'DC Pura'}</strong></div>
                  </div>
                </div>
              </div>

              {/* GPS Positioning WGS84 */}
              <div className="p-3 rounded-lg border bg-[#060b13] border-[#132237] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-purple-400" />
                    Posicionamiento Geodésico (WGS84)
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold">{inspectingFile.metadata.gpsFix} ({inspectingFile.metadata.gpsSatellites} Sats)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div>Pica Inicial (1): <strong>{inspectingFile.metadata.gpsVertexA.lat}°, {inspectingFile.metadata.gpsVertexA.lon}° ({inspectingFile.metadata.gpsVertexA.elevM} msnm)</strong></div>
                  <div>Pica Final (56): <strong>{inspectingFile.metadata.gpsVertexB.lat}°, {inspectingFile.metadata.gpsVertexB.lon}° ({inspectingFile.metadata.gpsVertexB.elevM} msnm)</strong></div>
                </div>
              </div>

              {/* Operator */}
              <div className="p-3 rounded-lg border bg-[#060b13] border-[#132237]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Operador / Responsable Técnico</span>
                <span className="text-slate-200 font-bold">{inspectingFile.metadata.operator}</span>
              </div>

              {/* Cryptographic SHA-256 Hash */}
              <div className="p-3 rounded-lg border bg-[#060b13] border-[#132237] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-amber-400">Hash Criptográfico de Integridad (SHA-256)</span>
                  <button
                    onClick={() => handleCopyHash(inspectingFile.metadata!.hashSha256)}
                    className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {isHashCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{isHashCopied ? '¡Copiado!' : 'Copiar Hash'}</span>
                  </button>
                </div>
                <div className="p-2 rounded bg-black/50 border border-slate-800 font-mono text-[10.5px] text-amber-300 break-all select-all">
                  {inspectingFile.metadata.hashSha256}
                </div>
                <span className="text-[9.5px] opacity-70 block">
                  Garantiza inmutabilidad y no-repudio de los datos medidos en auditorías técnicas y bancos.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Rename File Modal */}
      {renamingFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#0a121e] border-[#1e3350] text-white'
            }`}
          >
            <h3 className="text-sm font-bold uppercase tracking-tight mb-2">
              Renombrar Perfil Geofísico
            </h3>
            <p className="text-xs font-mono opacity-75 mb-3 leading-snug">
              Se recomienda mantener la nomenclatura estándar: PROYECTO_LINEA_ARREGLO_aXX_AAAAMMDD_HHMM
            </p>
            <input
              type="text"
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border font-mono text-xs font-bold bg-[#060b13] border-slate-700 text-white focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex items-center justify-end gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => setRenamingFile(null)}
                className="px-3 py-1.5 rounded border border-slate-700 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRename}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
              >
                Guardar Nombre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Raw Cabinet Preview Modal */}
      {previewContent && activePreviewFile && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
          <div
            className={`w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isSunlightMode ? 'bg-white border-black text-black' : 'bg-[#08101a] border-[#1b2f4a] text-white'
            }`}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold font-mono">
                  Vista Previa de Gabinete: <strong className="text-cyan-300">{previewFilename}</strong>
                </span>
              </div>

              {/* Format Switcher within Preview for Survey Profiles */}
              {activePreviewFile.type === 'survey' && (
                <div className="flex items-center gap-1 bg-[#050911] p-1 rounded-lg border border-slate-800 text-[10px] font-mono">
                  {['stg', 'crs', 'dat', 'z2d', 'csv'].map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => handlePreview(activePreviewFile, fmt)}
                      className={`px-2 py-0.5 rounded uppercase font-bold cursor-pointer transition-colors ${
                        previewFormat === fmt
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      .{fmt}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-[#142338] hover:bg-[#1f3757] text-slate-200 border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(activePreviewFile.name, previewFormat)}
                  className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewContent(null)}
                  className="text-xs px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 cursor-pointer"
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {/* Code Body */}
            <pre
              className={`p-4 text-xs font-mono overflow-auto flex-1 ${
                isSunlightMode ? 'bg-slate-50 text-black' : 'bg-[#03060a] text-slate-300'
              }`}
            >
              {previewContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
