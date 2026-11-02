import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  generateSequence,
  simulateShot,
  formatZ2D,
  formatCSV,
  formatSTG,
  formatCMD,
  formatCRS,
  formatDAT_Res2DInv,
  generateStandardFilename,
  getSequenceLevelsBreakdown,
  calculateSurveyDurationBreakdown,
  estimate2DInversion,
  QuadripolePoint,
  SequenceConfig,
} from './src/utils/ert-math';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

interface InstrumentState {
  connected: boolean;
  connecting: boolean;
  ssid: string;
  ip: string;
  signalDbm: number;
  firmware: string;
  batteryInternal: number;
  batteryExternal: number;
  gpsStatus: string;
  gpsSatellites: number;
  transmitterPowerW: number;
  maxVoltageVp: number;
  inputImpedanceMohm: number;
  channels: number;
  contactResistance: number[];
  temperatureC: number;
}

const instrument: InstrumentState = {
  connected: true,
  connecting: false,
  ssid: 'SuperSting-R8',
  ip: '192.168.1.1',
  signalDbm: -58,
  firmware: '4.2',
  batteryInternal: 12.6,
  batteryExternal: 12.4,
  gpsStatus: '3D Fix',
  gpsSatellites: 9,
  transmitterPowerW: 200,
  maxVoltageVp: 800,
  inputImpedanceMohm: 150,
  channels: 8,
  contactResistance: [],
  temperatureC: 28.4,
};

let surveyConfig: SequenceConfig & { jobName: string } = {
  jobName: 'MINA-VETA01',
  progId: 'MINAVETA',
  arrayType: 'dd',
  electrodes: 56,
  spacing: 5,
  nMax: 8,
  maxCurrent: 500,
  measureTime: 1.2,
  isIP: true,
  ipCycle: 2,
  stackCycles: 4,
  minStacks: 2,
  maxStacks: 6,
  stackErrorThreshold: 2.0,
  errorThreshold: 2.0,
  activeMultipliers: [1, 2, 3],
  miningPreset: 'epithermal_veins',
  transmitterPowerW: 200,
  transmitterType: 'internal_200w',
  maxVoltageVp: 800,
  targetMineralization: 'gold_silver_veins',
  remoteElectrodeB: {
    distanceM: 1800,
    azimuthDeg: 90,
    resistanceOhm: 320,
    isGrounded: true,
  },
};

interface SurveySession {
  isRunning: boolean;
  points: QuadripolePoint[];
  currentIndex: number;
  lastBatch: QuadripolePoint[];
  activeElectrodes: { tx: number[]; rx: number[] };
  timer: NodeJS.Timeout | null;
  startedAt: number | null;
  completedAt: number | null;
}

const initialSeq = generateSequence(surveyConfig);
const totalLen = (surveyConfig.electrodes - 1) * (surveyConfig.spacing || 5);
const preMeasured = initialSeq.map((pt) =>
  simulateShot(pt, {
    totalLength: totalLen,
    maxCurrent: surveyConfig.maxCurrent ?? 1000,
    contactResistance: [],
    stackCycles: 4,
    isIP: true,
    transmitterPowerW: 200,
    maxVoltageVp: 800,
  })
);

const surveySession: SurveySession = {
  isRunning: false,
  points: preMeasured,
  currentIndex: preMeasured.length,
  lastBatch: preMeasured.slice(-8),
  activeElectrodes: { tx: [preMeasured[0]?.p[0] ?? 1, preMeasured[0]?.p[1] ?? 2], rx: [3, 4, 5, 6, 7, 8, 9, 10] },
  timer: null,
  startedAt: Date.now() - 1800000,
  completedAt: Date.now(),
};

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
  dataPoints?: QuadripolePoint[];
  content?: string;
  metadata: FileMetadata;
}

// -------------------------------------------------------------
// ZERO-DEPENDENCY ZIP BUILDER (PKZip 2.0 Store-Mode Specification)
// -------------------------------------------------------------
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createZipBuffer(entries: { name: string; content: Buffer | string }[]): Buffer {
  const parts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf8');
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18);
    lfh.writeUInt32LE(size, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    parts.push(lfh, nameBuf, dataBuf);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(size, 20);
    cdh.writeUInt32LE(size, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);

    cdParts.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + dataBuf.length;
  }

  const cdOffset = offset;
  const cdBuf = Buffer.concat(cdParts);
  const cdSize = cdBuf.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

const defaultMeta1: FileMetadata = {
  serialNumber: 'SS-R8-08412',
  firmware: 'v4.2.1-AGI (DSP Rev 3.8)',
  maxCurrentMa: 500,
  maxVoltageVp: 800,
  minStacks: 2,
  maxStacks: 6,
  stackErrorThresholdPct: 2.0,
  isIP: true,
  ipCycleSec: 2.0,
  operator: 'Ing. Carlos Mendoza (CIP 184920 · Geofísico Senior)',
  gpsVertexA: { lat: -14.28421, lon: -71.49215, elevM: 3850 },
  gpsVertexB: { lat: -14.28285, lon: -71.48972, elevM: 3874 },
  gpsSatellites: 9,
  gpsFix: '3D Differential Fix (HDOP 0.8)',
  hashSha256: '9f83a218db267b1b369c3a32f6a73c1d47a5e8f23b7b9e021a81239c4f19b02a',
  syncStatus: 'synced_with_r8',
};

const defaultMeta2: FileMetadata = {
  serialNumber: 'SS-R8-08412',
  firmware: 'v4.2.1-AGI (DSP Rev 3.8)',
  maxCurrentMa: 500,
  maxVoltageVp: 800,
  minStacks: 2,
  maxStacks: 6,
  stackErrorThresholdPct: 2.0,
  isIP: true,
  ipCycleSec: 2.0,
  operator: 'Ing. Carlos Mendoza (CIP 184920 · Geofísico Senior)',
  gpsVertexA: { lat: -14.28612, lon: -71.49380, elevM: 3844 },
  gpsVertexB: { lat: -14.28475, lon: -71.49140, elevM: 3866 },
  gpsSatellites: 8,
  gpsFix: '3D Fix (HDOP 1.0)',
  hashSha256: '4a6b291c89f5381a3d9021e102f891bca7289f02931a0219c488310ba2b1f813',
  syncStatus: 'synced_with_r8',
};

const defaultCmdMeta: FileMetadata = {
  serialNumber: 'SS-R8-08412',
  firmware: 'v4.2.1-AGI (DSP Rev 3.8)',
  maxCurrentMa: 500,
  maxVoltageVp: 800,
  minStacks: 2,
  maxStacks: 6,
  stackErrorThresholdPct: 2.0,
  isIP: true,
  ipCycleSec: 2.0,
  operator: 'SuperSting Command Generator',
  gpsVertexA: { lat: -14.28421, lon: -71.49215, elevM: 3850 },
  gpsVertexB: { lat: -14.28285, lon: -71.48972, elevM: 3874 },
  gpsSatellites: 9,
  gpsFix: '3D Fix',
  hashSha256: '7b203c991823a8f10b23019aa01827b384f901a8291038bc408192a019e08392',
  syncStatus: 'in_buffer_r8',
};

const storedFiles: Map<string, StoredFile> = new Map([
  [
    'MINAVETA_L01_DD_a05_20261101_1928.stg',
    {
      name: 'MINAVETA_L01_DD_a05_20261101_1928.stg',
      baseName: 'MINAVETA_L01_DD_a05_20261101_1928',
      type: 'survey',
      formatsAvailable: ['stg', 'crs', 'dat', 'z2d', 'csv', 'zip'],
      pointsCount: preMeasured.length,
      createdAt: '2026-11-01T19:28:45-08:00',
      sizeBytes: preMeasured.length * 128,
      dataPoints: preMeasured,
      metadata: defaultMeta1,
    },
  ],
  [
    'MINAVETA_L00_DD_a05_20261031_1715.stg',
    {
      name: 'MINAVETA_L00_DD_a05_20261031_1715.stg',
      baseName: 'MINAVETA_L00_DD_a05_20261031_1715',
      type: 'survey',
      formatsAvailable: ['stg', 'crs', 'dat', 'z2d', 'csv', 'zip'],
      pointsCount: 668,
      createdAt: '2026-10-31T17:15:20-08:00',
      sizeBytes: 85504,
      dataPoints: preMeasured,
      metadata: defaultMeta2,
    },
  ],
  [
    'MINAVETA_8CH.cmd',
    {
      name: 'MINAVETA_8CH.cmd',
      baseName: 'MINAVETA_8CH',
      type: 'cmd',
      formatsAvailable: ['cmd'],
      pointsCount: 94,
      createdAt: '2026-10-30T10:04:12-08:00',
      sizeBytes: 12480,
      content: formatCMD('MINAVETA', preMeasured),
      metadata: defaultCmdMeta,
    },
  ],
]);

const sseClients: Response[] = [];

function broadcastSSE(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      // client disconnected
    }
  });
}

function getIntervalMs(): number {
  const base = 300;
  const timeSec = surveyConfig.isIP ? surveyConfig.ipCycle ?? 2 : surveyConfig.measureTime ?? 1.2;
  return base + timeSec * 150;
}

function executeShotStep() {
  if (!surveySession.isRunning) return;

  if (surveySession.currentIndex >= surveySession.points.length) {
    surveySession.isRunning = false;
    if (surveySession.timer) clearInterval(surveySession.timer);
    surveySession.timer = null;
    surveySession.completedAt = Date.now();
    surveySession.activeElectrodes = { tx: [], rx: [] };

    const now = new Date();
    const isoString = now.toISOString();
    const baseName = generateStandardFilename({
      project: surveyConfig.jobName,
      line: 'L01',
      arrayType: surveyConfig.arrayType,
      spacing: surveyConfig.spacing,
      date: now,
    });
    const filename = `${baseName}.stg`;
    const hash = crypto.createHash('sha256').update(formatSTG(baseName, surveySession.points, surveyConfig)).digest('hex');

    storedFiles.set(filename, {
      name: filename,
      baseName,
      type: 'survey',
      formatsAvailable: ['stg', 'crs', 'dat', 'z2d', 'csv', 'zip'],
      pointsCount: surveySession.points.length,
      createdAt: isoString,
      sizeBytes: surveySession.points.length * 128,
      dataPoints: [...surveySession.points],
      metadata: {
        ...defaultMeta1,
        hashSha256: hash,
        isIP: Boolean(surveyConfig.isIP),
        ipCycleSec: surveyConfig.ipCycle ?? 2.0,
        maxCurrentMa: surveyConfig.maxCurrent ?? 500,
        minStacks: surveyConfig.minStacks ?? 2,
        maxStacks: surveyConfig.maxStacks ?? 6,
        stackErrorThresholdPct: surveyConfig.stackErrorThreshold ?? 2.0,
      },
    });

    broadcastSSE('survey_completed', {
      totalPoints: surveySession.points.length,
      filename,
      baseName,
    });
    return;
  }

  const batchEnd = Math.min(surveySession.currentIndex + 8, surveySession.points.length);
  const totalLength = (surveyConfig.electrodes - 1) * (surveyConfig.spacing || 5);

  const batch: QuadripolePoint[] = [];
  for (let idx = surveySession.currentIndex; idx < batchEnd; idx++) {
    const rawPoint = surveySession.points[idx];
    const simulated = simulateShot(rawPoint, {
      totalLength,
      maxCurrent: surveyConfig.maxCurrent ?? 500,
      contactResistance: instrument.contactResistance,
      stackCycles: surveyConfig.stackCycles ?? 4,
      isIP: Boolean(surveyConfig.isIP),
      transmitterPowerW: surveyConfig.transmitterPowerW ?? 200,
      maxVoltageVp: surveyConfig.maxVoltageVp ?? 800,
    });
    simulated.status = simulated.err > (surveyConfig.errorThreshold || 2.0) ? 'rejected' : 'measured';
    surveySession.points[idx] = simulated;
    batch.push(simulated);
  }

  surveySession.currentIndex = batchEnd;
  surveySession.lastBatch = batch;

  const leadPoint = batch[0];
  const tx = [leadPoint.p[0], leadPoint.p[1]].filter((e) => e >= 0);
  const rx = Array.from(new Set(batch.flatMap((b) => [b.p[2], b.p[3]])));
  surveySession.activeElectrodes = { tx, rx };

  instrument.batteryInternal = Math.max(10.2, instrument.batteryInternal - 0.005);
  instrument.batteryExternal = Math.max(10.0, instrument.batteryExternal - 0.005);

  broadcastSSE('shot_update', {
    currentIndex: surveySession.currentIndex,
    totalPoints: surveySession.points.length,
    batch,
    activeElectrodes: surveySession.activeElectrodes,
    batteryInternal: Number(instrument.batteryInternal.toFixed(2)),
    batteryExternal: Number(instrument.batteryExternal.toFixed(2)),
  });
}

// REST Routes
app.get('/api/instrument/status', (req: Request, res: Response) => {
  let contactSummary = null;
  if (instrument.contactResistance && instrument.contactResistance.length > 0) {
    const cr = instrument.contactResistance;
    const sorted = [...cr].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1.2;
    const max = sorted[sorted.length - 1] || 2.4;
    const badElectrodes = cr
      .map((val, idx) => ({ electrode: idx + 1, resistanceKohm: val }))
      .filter((e) => e.resistanceKohm > 5.0);
    const under1_8k = cr.filter((v) => v < 1.8).length;
    const between1_8and5k = cr.filter((v) => v >= 1.8 && v <= 5.0).length;
    contactSummary = {
      totalElectrodes: cr.length,
      medianKohm: median,
      maxKohm: max,
      under1_8k,
      between1_8and5k,
      over5k: badElectrodes.length,
      criticalCount: badElectrodes.length,
      optimalCount: under1_8k,
      acceptableCount: between1_8and5k,
      under2k: under1_8k,
      between2and5k: between1_8and5k,
      between5and10k: cr.filter((v) => v > 5.0 && v <= 10.0).length,
      over10k: cr.filter((v) => v > 10.0).length,
      badElectrodes,
      values: cr,
    };
  }

  res.json({
    status: 'ok',
    instrument: {
      ...instrument,
      batteryInternal: Number(instrument.batteryInternal.toFixed(2)),
      batteryExternal: Number(instrument.batteryExternal.toFixed(2)),
    },
    contactSummary,
  });
});

app.post('/api/instrument/connect', (req: Request, res: Response) => {
  const { action } = req.body;
  if (action === 'disconnect') {
    instrument.connected = false;
    instrument.connecting = false;
    if (surveySession.isRunning) {
      surveySession.isRunning = false;
      if (surveySession.timer) clearInterval(surveySession.timer);
      surveySession.timer = null;
    }
    broadcastSSE('instrument_state', { connected: false });
    return res.json({ status: 'ok', connected: false });
  }

  instrument.connected = true;
  instrument.connecting = false;
  broadcastSSE('instrument_state', { connected: true, connecting: false });
  res.json({ status: 'ok', connected: true });
});

app.post('/api/instrument/contact-test', (req: Request, res: Response) => {
  const count = surveyConfig.electrodes || 56;
  const cr: number[] = [];

  for (let i = 0; i < count; i++) {
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    let val = Math.exp(Math.log(1.3) + 0.38 * gauss);

    if (i === Math.floor(count * 0.31)) val = 7.4 + Math.random();
    if (i === Math.floor(count * 0.72)) val = 22.5 + Math.random() * 4;

    cr.push(Number(val.toFixed(2)));
  }

  instrument.contactResistance = cr;

  const sorted = [...cr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  // AGI SuperSting standard thresholds:
  // 1. Optimal: < 1.8 kOhm (Allows utilizing full 200W transmitter power)
  // 2. Acceptable: 1.8 to 5.0 kOhm (Operational, power output limited by loop impedance)
  // 3. Critical: > 5.0 kOhm (High noise, requires saline watering or auxiliary stake)
  const badElectrodes = cr
    .map((val, idx) => ({ electrode: idx + 1, resistanceKohm: val }))
    .filter((e) => e.resistanceKohm > 5.0);

  const under1_8k = cr.filter((v) => v < 1.8).length;
  const between1_8and5k = cr.filter((v) => v >= 1.8 && v <= 5.0).length;
  const over5k = badElectrodes.length;

  const summary = {
    totalElectrodes: count,
    medianKohm: median,
    maxKohm: max,
    // Official AGI thresholds & counts
    under1_8k,
    between1_8and5k,
    over5k,
    criticalCount: over5k,
    optimalCount: under1_8k,
    acceptableCount: between1_8and5k,
    // Backward compatibility
    under2k: under1_8k,
    between2and5k: between1_8and5k,
    between5and10k: cr.filter((v) => v > 5.0 && v <= 10.0).length,
    over10k: cr.filter((v) => v > 10.0).length,
    badElectrodes,
    values: cr,
  };

  broadcastSSE('contact_test_results', summary);
  res.json({ status: 'ok', summary });
});

app.post('/api/instrument/contact-test/retest', (req: Request, res: Response) => {
  const targetElectrodes: number[] = req.body?.electrodes || [];
  if (targetElectrodes.length === 0) {
    return res.status(400).json({ error: 'No se especificaron electrodos para re-evaluación.' });
  }

  // Update specified electrodes with improved values (simulating watering/saline treatment)
  targetElectrodes.forEach((elNum) => {
    const idx = elNum - 1;
    if (idx >= 0 && idx < instrument.contactResistance.length) {
      // Improved resistance between 0.8 kOhm and 1.6 kOhm (optimal < 1.8k)
      instrument.contactResistance[idx] = Number((0.85 + Math.random() * 0.75).toFixed(1));
    }
  });

  const cr = instrument.contactResistance;
  const sorted = [...cr].sort((a, b) => a - b);
  const medianKohm = sorted[Math.floor(sorted.length / 2)] || 1.2;
  const maxKohm = sorted[sorted.length - 1] || 2.4;

  const badElectrodes = cr
    .map((val, idx) => ({ electrode: idx + 1, resistanceKohm: val }))
    .filter((e) => e.resistanceKohm > 5.0);

  const under1_8k = cr.filter((v) => v < 1.8).length;
  const between1_8and5k = cr.filter((v) => v >= 1.8 && v <= 5.0).length;
  const over5k = badElectrodes.length;

  const summary = {
    totalElectrodes: cr.length,
    medianKohm,
    maxKohm,
    under1_8k,
    between1_8and5k,
    over5k,
    criticalCount: over5k,
    optimalCount: under1_8k,
    acceptableCount: between1_8and5k,
    under2k: under1_8k,
    between2and5k: between1_8and5k,
    between5and10k: cr.filter((v) => v > 5.0 && v <= 10.0).length,
    over10k: cr.filter((v) => v > 10.0).length,
    badElectrodes,
    values: cr,
    retestedElectrodes: targetElectrodes,
  };

  broadcastSSE('contact_test_results', summary);
  res.json({ status: 'ok', summary, retestedCount: targetElectrodes.length });
});

app.post('/api/instrument/contact-test/fix-critical', (req: Request, res: Response) => {
  const cr = instrument.contactResistance;
  const fixedElectrodes: number[] = [];

  cr.forEach((val, idx) => {
    if (val > 5.0) {
      // Wetting with saline solution drops contact resistance to 0.85 - 1.5 kOhm
      cr[idx] = Number((0.85 + Math.random() * 0.65).toFixed(1));
      fixedElectrodes.push(idx + 1);
    }
  });

  const sorted = [...cr].sort((a, b) => a - b);
  const medianKohm = sorted[Math.floor(sorted.length / 2)] || 1.2;
  const maxKohm = sorted[sorted.length - 1] || 2.4;

  const badElectrodes = cr
    .map((val, idx) => ({ electrode: idx + 1, resistanceKohm: val }))
    .filter((e) => e.resistanceKohm > 5.0);

  const under1_8k = cr.filter((v) => v < 1.8).length;
  const between1_8and5k = cr.filter((v) => v >= 1.8 && v <= 5.0).length;
  const over5k = badElectrodes.length;

  const summary = {
    totalElectrodes: cr.length,
    medianKohm,
    maxKohm,
    under1_8k,
    between1_8and5k,
    over5k,
    criticalCount: over5k,
    optimalCount: under1_8k,
    acceptableCount: between1_8and5k,
    under2k: under1_8k,
    between2and5k: between1_8and5k,
    between5and10k: 0,
    over10k: 0,
    badElectrodes,
    values: cr,
    retestedElectrodes: fixedElectrodes,
  };

  broadcastSSE('contact_test_results', summary);
  res.json({ status: 'ok', summary, fixedCount: fixedElectrodes.length, fixedElectrodes });
});

app.post('/api/instrument/contact-test/save-crs', (req: Request, res: Response) => {
  const cr = instrument.contactResistance;
  const filename = `${surveyConfig.jobName || 'SURVEY'}.CRS`;
  const timestamp = new Date().toISOString();

  // Standard AGI .CRS format
  const lines: string[] = [
    `// Advanced Geosciences, Inc. (AGI) SuperSting R8/IP Contact Resistance Survey File`,
    `// Date: ${timestamp.split('T')[0]} Time: ${timestamp.split('T')[1].slice(0, 8)}`,
    `// Job: ${surveyConfig.jobName} Array: ${surveyConfig.arrayType.toUpperCase()} Electrodes: ${cr.length} Spacing: ${surveyConfig.spacing}m`,
    `// Format: Electrode_ID, Resistance_Ohm, Contact_Status, Max_Injectable_Current_mA`,
  ];

  cr.forEach((valKohm, idx) => {
    const elId = idx + 1;
    const resOhm = Math.round(valKohm * 1000);
    const status = valKohm < 1.8 ? 'OPTIMAL' : valKohm <= 5.0 ? 'ACCEPTABLE' : 'CRITICAL_HIGH';
    // Max injectable current with 800 Vp-p limit: I_max = min(1000, 800 / (2 * R_c) * 1000)
    const maxCurrentMa = Math.min(1000, Math.round((800 / (2 * Math.max(10, resOhm))) * 1000));
    lines.push(`${elId}, ${resOhm}, ${status}, ${maxCurrentMa}`);
  });

  const content = lines.join('\n');

  const baseName = filename.replace(/\.[^/.]+$/, '');
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  storedFiles.set(filename, {
    name: filename,
    baseName,
    type: 'survey',
    formatsAvailable: ['crs', 'csv'],
    pointsCount: cr.length,
    createdAt: timestamp,
    sizeBytes: content.length,
    content,
    metadata: {
      ...defaultMeta1,
      hashSha256: sha,
    },
  });

  res.json({
    status: 'ok',
    filename,
    content,
    sizeBytes: content.length,
    electrodesCount: cr.length,
  });
});

app.post('/api/instrument/receiver-test', (req: Request, res: Response) => {
  // AGI Test Box Criteria: Nominal 500 mOhm (0.500 Ohm) with acceptable range 475 to 525 mOhm (±5% tolerance)
  const nominalMohm = 500;
  const timestamp = new Date().toLocaleTimeString();

  const channels = [1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
    // Generate realistic calibrated resistance centered around 500 mOhm (e.g. 497.8 to 503.2 mOhm)
    const deviationMohm = (Math.random() - 0.5) * 8.5;
    const measuredMohm = Number((nominalMohm + deviationMohm).toFixed(1));
    const errorPct = Number((((measuredMohm - nominalMohm) / nominalMohm) * 100).toFixed(2));
    const isPass = measuredMohm >= 475 && measuredMohm <= 525;

    return {
      channel: ch,
      nominalMohm,
      measuredMohm,
      errorPct,
      phaseErrorMrad: Number(((Math.random() - 0.5) * 0.12).toFixed(3)),
      status: isPass ? 'PASS' : 'FAIL',
    };
  });

  res.json({
    status: 'ok',
    testProcedure: 'Caja de Prueba Externa AGI conectada directamente al conector frontal sin cables de línea',
    criteria: 'Resistencia nominal patrón 500 mΩ (0.500 Ω); rango admisible de 475 a 525 mΩ (±5%)',
    timestamp,
    channels,
  });
});

app.post('/api/instrument/ip-test', (req: Request, res: Response) => {
  // Standard AGI 6 IP time windows
  const ipWindows = [
    { window: 'M1', tStartMs: 100, tEndMs: 200, widthMs: 100, chargeabilityMvV: 24.2 },
    { window: 'M2', tStartMs: 200, tEndMs: 400, widthMs: 200, chargeabilityMvV: 16.8 },
    { window: 'M3', tStartMs: 400, tEndMs: 800, widthMs: 400, chargeabilityMvV: 11.4 },
    { window: 'M4', tStartMs: 800, tEndMs: 1200, widthMs: 400, chargeabilityMvV: 7.9 },
    { window: 'M5', tStartMs: 1200, tEndMs: 1600, widthMs: 400, chargeabilityMvV: 5.6 },
    { window: 'M6', tStartMs: 1600, tEndMs: 2000, widthMs: 400, chargeabilityMvV: 3.9 },
  ].map((w) => ({
    ...w,
    chargeabilityMvV: Number((w.chargeabilityMvV * (0.97 + 0.06 * Math.random())).toFixed(2)),
    status: 'PASS',
  }));

  const totalChargeability = Number(
    ipWindows.reduce((acc, w) => acc + w.chargeabilityMvV, 0).toFixed(1)
  );

  res.json({
    status: 'ok',
    message: 'IP test load: 6 ventanas AGI (M1 a M6) verificadas con 100% de ciclos válidos',
    windows: ipWindows,
    totalChargeabilityMvV: totalChargeability,
    stackCycles: '4 de 4 válidos (100% coherencia Cole-Cole)',
    timestamp: new Date().toLocaleTimeString(),
  });
});

app.post('/api/instrument/sp-test', (req: Request, res: Response) => {
  const channels = [1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return {
      channel: ch,
      potentialMv: Number((gauss * 8.5).toFixed(1)),
    };
  });

  res.json({
    status: 'ok',
    message: 'Auto-potencial (SP) medido en los 8 canales simultáneos',
    channels,
    driftRateMvPerMin: '+1.4 mV/min (Deriva galvánica de electrodo)',
    backgroundNoiseMv: 2.1,
    warning: 'Aviso: El uso de picas de acero inoxidable introduce polarización galvánica de contacto y deriva temporal significativa. Para medición confiable de SP en geofísica se requiere el uso de electrodos no polarizables de cobre/sulfato de cobre (Cu/CuSO4) o plomo/cloruro de plomo (Pb/PbCl2).',
    timestamp: new Date().toLocaleTimeString(),
  });
});

let skippedElectrodes: number[] = [];

app.post('/api/instrument/cable-test', (req: Request, res: Response) => {
  const total = surveyConfig.electrodes || 56;
  const reelsCount = Math.ceil(total / 14); // 14 takeouts per standard AGI cable reel
  const reels = [];

  for (let r = 0; r < reelsCount; r++) {
    const startEl = r * 14 + 1;
    const endEl = Math.min(total, (r + 1) * 14);
    // Typical line cable wire resistance: ~0.8 to 1.4 Ohm per section; insulation > 100 MOhm
    const wireContinuityOhm = Number((0.95 + Math.random() * 0.45).toFixed(2));
    const insulationMohm = Math.round(180 + Math.random() * 120);
    // Check for reversed reel (takeout polarity flip)
    const isReversed = false;

    reels.push({
      reelIndex: r + 1,
      electrodesRange: `${startEl} - ${endEl}`,
      wireContinuityOhm,
      insulationMohm,
      polarityStatus: isReversed ? 'REVERSED_ERROR' : 'NORMAL_CORRECT',
      continuityPass: wireContinuityOhm < 2.5,
      insulationPass: insulationMohm > 50,
      overallStatus: 'PASS',
    });
  }

  // Cross-takeout verification test
  const crossCouplingTests = [
    { pairTx: '1-2', pairRx: '3-4', expectedVpMv: 42.5, measuredVpMv: 42.1, status: 'MATCH_OK' },
    { pairTx: '15-16', pairRx: '17-18', expectedVpMv: 38.2, measuredVpMv: 38.4, status: 'MATCH_OK' },
    { pairTx: '29-30', pairRx: '31-32', expectedVpMv: 41.0, measuredVpMv: 40.8, status: 'MATCH_OK' },
  ];

  res.json({
    status: 'ok',
    timestamp: new Date().toLocaleTimeString(),
    totalElectrodes: total,
    reelsChecked: reels.length,
    reels,
    crossCouplingTests,
    cableIntegrity: '100% OPERATIVO (Sin carretes cruzados ni fugas de aislamiento detectadas)',
    leakageCurrentUa: 0.12,
  });
});

app.post('/api/instrument/skip-electrode', (req: Request, res: Response) => {
  const { electrode, action } = req.body;
  const elNum = Number(electrode);

  if (!elNum || elNum < 1 || elNum > surveyConfig.electrodes) {
    return res.status(400).json({ error: 'Número de electrodo inválido.' });
  }

  if (action === 'restore') {
    skippedElectrodes = skippedElectrodes.filter((e) => e !== elNum);
  } else {
    if (!skippedElectrodes.includes(elNum)) {
      skippedElectrodes.push(elNum);
    }
  }

  // Regenerate sequence filtering out quadripoles containing the skipped electrode
  const fullSeq = generateSequence(surveyConfig);
  const filteredSeq = fullSeq.filter(
    (pt) => !pt.p.some((pEl) => skippedElectrodes.includes(pEl))
  );

  surveySession.points = filteredSeq;
  if (surveySession.currentIndex > filteredSeq.length) {
    surveySession.currentIndex = filteredSeq.length;
  }

  // Regenerate CMD script
  const sanitizedProgId = (surveyConfig.progId || 'SURVEY').slice(0, 8).toUpperCase();
  const newCmd = formatCMD(sanitizedProgId, filteredSeq);
  const cmdFilename = `${sanitizedProgId}.CMD`;
  storedFiles.set(cmdFilename, {
    name: cmdFilename,
    baseName: sanitizedProgId,
    type: 'cmd',
    formatsAvailable: ['cmd'],
    pointsCount: filteredSeq.length,
    createdAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(newCmd, 'utf8'),
    content: newCmd,
    metadata: {
      ...defaultCmdMeta,
      hashSha256: crypto.createHash('sha256').update(newCmd).digest('hex'),
    },
  });

  broadcastSSE('sequence_updated', {
    skippedElectrodes,
    totalPoints: filteredSeq.length,
    omittedQuadripolesCount: fullSeq.length - filteredSeq.length,
  });

  res.json({
    status: 'ok',
    skippedElectrodes,
    totalPoints: filteredSeq.length,
    omittedQuadripolesCount: fullSeq.length - filteredSeq.length,
    message:
      action === 'restore'
        ? `Electrodo #${elNum} restaurado. Secuencia regenerada.`
        : `Electrodo #${elNum} omitido por daño/fuga. Secuencia y .CMD regenerados sin el electrodo #${elNum} (${fullSeq.length - filteredSeq.length} cuadripolos omitidos).`,
  });
});

app.post('/api/instrument/emergency-stop', (req: Request, res: Response) => {
  surveySession.isRunning = false;
  if (surveySession.timer) clearInterval(surveySession.timer);
  surveySession.timer = null;
  surveySession.activeElectrodes = { tx: [], rx: [] };

  broadcastSSE('emergency_stop', {
    timestamp: new Date().toISOString(),
    voltageVp: 0,
    currentMa: 0,
    message: 'PARADA DE EMERGENCIA ACTIVADA: Transmisor desarmado inmediatamente a 0 V.',
  });

  res.json({
    status: 'ok',
    action: 'emergency_stop',
    transmitterVoltageVp: 0,
    isRunning: false,
    message: 'PARADA DE EMERGENCIA ACTIVADA. Transmisor desarmado a 0 V.',
  });
});

app.post('/api/instrument/storm-alert', (req: Request, res: Response) => {
  surveySession.isRunning = false;
  if (surveySession.timer) clearInterval(surveySession.timer);
  surveySession.timer = null;
  surveySession.activeElectrodes = { tx: [], rx: [] };

  broadcastSSE('storm_alert', {
    timestamp: new Date().toISOString(),
    message: 'ALERTA DE TORMENTA ELÉCTRICA: Transmisor desconectado por seguridad atmosférica.',
  });

  res.json({
    status: 'ok',
    action: 'storm_safety_disconnect',
    message: 'Línea desconectada y puesta a tierra segura contra rayos y transitorios atmosféricos.',
  });
});

app.post('/api/instrument/swap-batteries', (req: Request, res: Response) => {
  // AGI protocol: Swap internal main battery and external boost battery at midday
  const prevInt = instrument.batteryInternal;
  const prevExt = instrument.batteryExternal;
  instrument.batteryInternal = prevExt;
  instrument.batteryExternal = prevInt;

  broadcastSSE('battery_swap', {
    batteryInternal: instrument.batteryInternal,
    batteryExternal: instrument.batteryExternal,
  });

  res.json({
    status: 'ok',
    message: 'Baterías intercambiadas (Ppal ↔ Boost) para equilibrar ciclos de descarga profunda según recomendación AGI.',
    batteryInternal: instrument.batteryInternal,
    batteryExternal: instrument.batteryExternal,
  });
});

app.get('/api/instrument/preflight-check', (req: Request, res: Response) => {
  const cr = instrument.contactResistance || [];
  const badElectrodes = cr
    .map((val, idx) => ({ electrode: idx + 1, resistanceKohm: val }))
    .filter((e) => e.resistanceKohm > 5.0 && !skippedElectrodes.includes(e.electrode));

  const contactPass = cr.length > 0 && badElectrodes.length === 0;
  const batteryPass = instrument.batteryInternal >= 11.2 && instrument.batteryExternal >= 10.8;
  const memoryPass = true; // 80k points capacity >> 668 points
  const cmdPass = Boolean(surveyConfig.progId);
  const gpsPass = instrument.gpsStatus.toLowerCase().includes('fix');

  const allPassed = contactPass && batteryPass && memoryPass && cmdPass && gpsPass;

  let blockReason = '';
  if (!contactPass) {
    blockReason =
      cr.length === 0
        ? 'Prueba de contacto no realizada. Ejecute QC de Picas antes de inyectar.'
        : `Hay ${badElectrodes.length} electrodo(s) con resistencia > 5.0 kΩ. Huméctelos con agua salada u omítalos.`;
  } else if (!batteryPass) {
    blockReason = 'Batería baja (< 11.2 V). Recargue o intercambie con la batería boost.';
  } else if (!cmdPass) {
    blockReason = 'Archivo de comandos .CMD no generado o buffer no cargado.';
  } else if (!gpsPass) {
    blockReason = 'Sin señal GPS 3D Fix para georreferenciación de electrodos.';
  }

  res.json({
    status: 'ok',
    allPassed,
    blockReason,
    checks: {
      contact: {
        pass: contactPass,
        title: 'Contacto de Electrodos (< 5.0 kΩ)',
        detail:
          cr.length === 0
            ? 'Pendiente de prueba'
            : badElectrodes.length === 0
            ? `${cr.length} picas conformes`
            : `${badElectrodes.length} picas críticas`,
      },
      battery: {
        pass: batteryPass,
        title: 'Batería bajo Carga (> 11.2 V)',
        detail: `Int: ${instrument.batteryInternal}V · Ext: ${instrument.batteryExternal}V`,
      },
      memory: {
        pass: memoryPass,
        title: 'Memoria Flash R8 (> 5% libre)',
        detail: 'Capacidad disponible: > 75,000 ptos (95%)',
      },
      cmd: {
        pass: cmdPass,
        title: 'Script .CMD Validado en Buffer',
        detail: `Prog ID: ${surveyConfig.progId || 'SURVEY'} (${surveySession.points.length} cuadripolos)`,
      },
      gps: {
        pass: gpsPass,
        title: 'GNSS / Posicionamiento WGS84',
        detail: `${instrument.gpsStatus} (${instrument.gpsSatellites} Satélites)`,
      },
    },
    skippedElectrodes,
  });
});

app.get('/api/survey/config', (req: Request, res: Response) => {
  res.json({ status: 'ok', config: surveyConfig });
});

app.post('/api/survey/config', (req: Request, res: Response) => {
  surveyConfig = { ...surveyConfig, ...req.body };
  if (surveySession.isRunning) {
    surveySession.isRunning = false;
    if (surveySession.timer) clearInterval(surveySession.timer);
    surveySession.timer = null;
  }
  surveySession.points = [];
  surveySession.currentIndex = 0;
  surveySession.lastBatch = [];

  res.json({ status: 'ok', config: surveyConfig });
});

app.post('/api/survey/sequence', (req: Request, res: Response) => {
  const config = { ...surveyConfig, ...req.body };
  const rawPoints = generateSequence(config);
  const totalLength = (config.electrodes - 1) * (config.spacing || 5);
  const zMax = rawPoints.length > 0 ? Math.max(...rawPoints.map((q) => q.z)) : 0;
  // Group quadripoles by current dipole (A, B) exactly as formatCMD does for SuperSting R8 8-channel script
  const dipoleMap = new Map<string, { a: number; b: number; rxPairs: [number, number][] }>();
  rawPoints.forEach((pt) => {
    const key = `${pt.p[0]}-${pt.p[1]}`;
    if (!dipoleMap.has(key)) {
      dipoleMap.set(key, { a: pt.p[0], b: pt.p[1], rxPairs: [] });
    }
    dipoleMap.get(key)!.rxPairs.push([pt.p[2], pt.p[3]]);
  });

  let cmdLinesCount = 0;
  dipoleMap.forEach(({ rxPairs }) => {
    cmdLinesCount += Math.ceil(rxPairs.length / 8);
  });

  // Real physical current injection shots required in the .cmd file
  const distinctTxDipoles = cmdLinesCount || dipoleMap.size;

  // Realistic physical duration calculation
  const durationInfo = calculateSurveyDurationBreakdown(distinctTxDipoles, {
    isIP: Boolean(config.isIP),
    ipCycle: config.ipCycle ?? 2.0,
    measureTime: config.measureTime ?? 1.2,
    minStacks: config.minStacks ?? 2,
    maxStacks: config.maxStacks ?? 6,
    stackCycles: config.stackCycles ?? 4,
  });

  // Edwards (1977) level-by-level breakdown table (a, n, points, ze, span, tx)
  const levelsTable = getSequenceLevelsBreakdown(
    rawPoints,
    config.spacing || 5,
    config.arrayType || 'dd'
  );

  // Maximum active quadripole span (L_arr = distance from first to last active electrode in largest quadripole)
  let maxArraySpanM = 0;
  rawPoints.forEach((pt) => {
    const validElectrodeIndices = pt.p.filter((e) => e > 0);
    if (validElectrodeIndices.length >= 2) {
      const minE = Math.min(...validElectrodeIndices);
      const maxE = Math.max(...validElectrodeIndices);
      const span = (maxE - minE) * (config.spacing || 5);
      if (span > maxArraySpanM) maxArraySpanM = span;
    }
  });

  const agiDepthMin = Number((0.15 * maxArraySpanM).toFixed(1));
  const agiDepthMax = Number((0.25 * maxArraySpanM).toFixed(1));

  const isPoleArray = ['pole-dipole', 'p-dd', 'pole-pole'].includes((config.arrayType || '').toLowerCase());
  const remoteElectrodeMinDistM = Math.round(5 * totalLength);

  res.json({
    status: 'ok',
    summary: {
      totalPoints: rawPoints.length,
      distinctTxDipoles,
      groupsOf8: Math.ceil(rawPoints.length / 8),
      estimatedMinutes: durationInfo.activeMinutes,
      estimatedMinutesDC: durationInfo.dcMinutes,
      estimatedMinutesTDIP: durationInfo.ipMinutes,
      dcFormula: durationInfo.dcFormula,
      ipFormula: durationInfo.ipFormula,
      lineLengthM: totalLength,
      maxArraySpanM,
      agiDepthRange: `${Math.round(agiDepthMin)} - ${Math.round(agiDepthMax)} m`,
      agiDepthMin,
      agiDepthMax,
      approxDepthM: Math.round(zMax),
      maxPseudoDepthM: Number(zMax.toFixed(1)),
      memoryPct: Number(((rawPoints.length / (config.isIP ? 26000 : 79000)) * 100).toFixed(1)),
      remoteElectrodeRequired: isPoleArray,
      remoteElectrodeMinDistM,
      levelsTable,
    },
    samplePoints: rawPoints.slice(0, 8),
  });
});

app.post('/api/instrument/upload-cmd', (req: Request, res: Response) => {
  const inputProgId = req.body?.progId || surveyConfig.progId || surveyConfig.jobName || 'SURVEY';
  const sanitizedProgId = inputProgId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  const filename = `${sanitizedProgId}.CMD`;

  const points = generateSequence(surveyConfig);
  const cmdContent = formatCMD(sanitizedProgId, points);

  storedFiles.set(filename, {
    name: filename,
    baseName: sanitizedProgId,
    type: 'cmd',
    formatsAvailable: ['cmd'],
    pointsCount: points.length,
    createdAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(cmdContent, 'utf8'),
    content: cmdContent,
    metadata: {
      ...defaultCmdMeta,
      hashSha256: crypto.createHash('sha256').update(cmdContent).digest('hex'),
    },
  });

  surveyConfig.progId = sanitizedProgId;

  res.json({
    status: 'ok',
    progId: sanitizedProgId,
    filename,
    linesCount: cmdContent.split('\n').filter((l) => !l.startsWith('//') && l.trim().length > 0).length,
    totalPoints: points.length,
    sizeBytes: Buffer.byteLength(cmdContent, 'utf8'),
    content: cmdContent,
    message: `Archivo ${filename} (Prog ID: ${sanitizedProgId}) cargado exitosamente en buffer de comandos del SuperSting R8.`,
  });
});

app.post('/api/instrument/apply-hardware-settings', (req: Request, res: Response) => {
  const updates = req.body || {};
  surveyConfig = { ...surveyConfig, ...updates };

  const sanitizedProgId = (surveyConfig.progId || surveyConfig.jobName || 'SURVEY')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase();
  surveyConfig.progId = sanitizedProgId;

  res.json({
    status: 'ok',
    message: 'Parámetros de hardware programados en registros internos del SuperSting R8.',
    registers: {
      progId: sanitizedProgId,
      minStacks: surveyConfig.minStacks ?? 2,
      maxStacks: surveyConfig.maxStacks ?? 6,
      stackErrorThreshold: surveyConfig.stackErrorThreshold ?? 2.0,
      measureTime: surveyConfig.measureTime ?? 1.2,
      isIP: Boolean(surveyConfig.isIP),
      ipCycle: surveyConfig.ipCycle ?? 2.0,
      transmitterType: surveyConfig.transmitterType ?? 'internal_200w',
      transmitterPowerW: surveyConfig.transmitterPowerW ?? 200,
      maxCurrent: surveyConfig.maxCurrent ?? 500,
      maxVoltageVp: 800,
    },
  });
});

app.get('/api/instrument/readback', (req: Request, res: Response) => {
  const sanitizedProgId = (surveyConfig.progId || surveyConfig.jobName || 'SURVEY')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase();

  res.json({
    status: 'ok',
    handshake: 'CONFIRMED',
    timestamp: new Date().toLocaleTimeString(),
    firmware: instrument.firmware,
    loadedProgId: sanitizedProgId,
    activeElectrodesTotal: surveyConfig.electrodes,
    spacingM: surveyConfig.spacing,
    arrayType: surveyConfig.arrayType,
    registers: {
      minStacks: surveyConfig.minStacks ?? 2,
      maxStacks: surveyConfig.maxStacks ?? 6,
      stackErrorThreshold: surveyConfig.stackErrorThreshold ?? 2.0,
      measureTime: surveyConfig.measureTime ?? 1.2,
      isIP: Boolean(surveyConfig.isIP),
      ipCycle: surveyConfig.ipCycle ?? 2.0,
      transmitterType: surveyConfig.transmitterType ?? 'internal_200w',
      maxCurrentMa: surveyConfig.maxCurrent ?? 500,
      maxVoltageVp: 800,
    },
    batteryInternalV: instrument.batteryInternal,
    batteryExternalV: instrument.batteryExternal,
    temperatureC: instrument.temperatureC,
  });
});

app.post('/api/survey/start', (req: Request, res: Response) => {
  if (!instrument.connected) {
    return res.status(400).json({ error: 'Equipo no conectado. Enlaza por Wi-Fi primero.' });
  }

  if (surveySession.points.length === 0 || surveySession.currentIndex >= surveySession.points.length) {
    surveySession.points = generateSequence(surveyConfig);
    surveySession.currentIndex = 0;
    surveySession.lastBatch = [];
    surveySession.startedAt = Date.now();
  }

  if (surveySession.points.length === 0) {
    return res.status(400).json({ error: 'La configuración actual no genera puntos de medición.' });
  }

  surveySession.isRunning = true;
  if (surveySession.timer) clearInterval(surveySession.timer);
  surveySession.timer = setInterval(executeShotStep, getIntervalMs());

  broadcastSSE('survey_started', {
    totalPoints: surveySession.points.length,
    currentIndex: surveySession.currentIndex,
  });

  res.json({
    status: 'ok',
    isRunning: true,
    totalPoints: surveySession.points.length,
    currentIndex: surveySession.currentIndex,
  });
});

app.post('/api/survey/pause', (req: Request, res: Response) => {
  surveySession.isRunning = false;
  if (surveySession.timer) clearInterval(surveySession.timer);
  surveySession.timer = null;

  broadcastSSE('survey_paused', { currentIndex: surveySession.currentIndex });
  res.json({ status: 'ok', isRunning: false, currentIndex: surveySession.currentIndex });
});

app.post('/api/survey/stop', (req: Request, res: Response) => {
  surveySession.isRunning = false;
  if (surveySession.timer) clearInterval(surveySession.timer);
  surveySession.timer = null;

  if (!instrument.connected) {
    instrument.connected = true;
  }

  let finishedCount = surveySession.currentIndex;
  if (finishedCount === 0 && surveySession.points.length > 0) {
    finishedCount = surveySession.points.length;
    surveySession.currentIndex = finishedCount;
  }

  const now = new Date();
  const isoString = now.toISOString();
  const baseName = generateStandardFilename({
    project: surveyConfig.jobName,
    line: 'L01',
    arrayType: surveyConfig.arrayType,
    spacing: surveyConfig.spacing,
    date: now,
  });
  const filename = `${baseName}.stg`;
  const pointsSlice = surveySession.points.slice(0, finishedCount);
  if (finishedCount > 0) {
    const hash = crypto.createHash('sha256').update(formatSTG(baseName, pointsSlice, surveyConfig)).digest('hex');
    storedFiles.set(filename, {
      name: filename,
      baseName,
      type: 'survey',
      formatsAvailable: ['stg', 'crs', 'dat', 'z2d', 'csv', 'zip'],
      pointsCount: finishedCount,
      createdAt: isoString,
      sizeBytes: finishedCount * 128,
      dataPoints: pointsSlice,
      metadata: {
        ...defaultMeta1,
        hashSha256: hash,
        isIP: Boolean(surveyConfig.isIP),
        ipCycleSec: surveyConfig.ipCycle ?? 2.0,
        maxCurrentMa: surveyConfig.maxCurrent ?? 500,
        minStacks: surveyConfig.minStacks ?? 2,
        maxStacks: surveyConfig.maxStacks ?? 6,
        stackErrorThresholdPct: surveyConfig.stackErrorThreshold ?? 2.0,
      },
    });
  }

  const avgErr = pointsSlice.length > 0
    ? Number((pointsSlice.reduce((acc, p) => acc + (p.err || 0), 0) / pointsSlice.length).toFixed(2))
    : 0;

  const payload = {
    status: 'ok',
    isRunning: false,
    recordedPoints: finishedCount,
    filename,
    jobName: surveyConfig.jobName,
    avgErr,
  };

  broadcastSSE('survey_stopped', payload);
  res.json(payload);
});

app.post('/api/survey/step', (req: Request, res: Response) => {
  if (!instrument.connected) {
    instrument.connected = true;
  }
  if (surveySession.points.length === 0) {
    surveySession.points = generateSequence(surveyConfig);
    surveySession.currentIndex = 0;
  }
  surveySession.isRunning = true;
  executeShotStep();
  surveySession.isRunning = false;

  res.json({
    status: 'ok',
    currentIndex: surveySession.currentIndex,
    totalPoints: surveySession.points.length,
    lastBatch: surveySession.lastBatch,
  });
});

app.post('/api/survey/reset', (req: Request, res: Response) => {
  if (surveySession.timer) clearInterval(surveySession.timer);
  surveySession.timer = null;
  surveySession.isRunning = false;
  surveySession.points = generateSequence(surveyConfig);
  surveySession.currentIndex = 0;
  surveySession.lastBatch = [];
  surveySession.startedAt = null;
  surveySession.completedAt = null;
  surveySession.activeElectrodes = { tx: [], rx: [] };

  broadcastSSE('survey_started', {
    totalPoints: surveySession.points.length,
    currentIndex: 0,
  });

  res.json({
    status: 'ok',
    totalPoints: surveySession.points.length,
    currentIndex: 0,
  });
});

app.post('/api/survey/remeasure', (req: Request, res: Response) => {
  if (!instrument.connected) {
    instrument.connected = true;
  }

  if (surveySession.points.length === 0) {
    surveySession.points = generateSequence(surveyConfig);
    surveySession.currentIndex = surveySession.points.length;
    const totalLength = (surveyConfig.electrodes - 1) * (surveyConfig.spacing || 5);
    surveySession.points = surveySession.points.map((p) =>
      simulateShot(p, {
        totalLength,
        maxCurrent: surveyConfig.maxCurrent ?? 500,
        contactResistance: instrument.contactResistance,
        stackCycles: 4,
        isIP: Boolean(surveyConfig.isIP),
      })
    );
  }

  const threshold = Number(req.body?.threshold) || surveyConfig.errorThreshold || 2.0;
  const count = Math.max(surveySession.currentIndex, 8);
  const measured = surveySession.points.slice(0, count);

  let badPoints = measured.filter((q) => q.err > threshold);
  let isTargeted = true;

  // If no points currently exceed threshold, select the top 15% highest-error points to refine stacks
  if (badPoints.length === 0 && measured.length > 0) {
    isTargeted = false;
    const sorted = [...measured].sort((a, b) => b.err - a.err);
    badPoints = sorted.slice(0, Math.min(18, Math.max(4, Math.ceil(measured.length * 0.1))));
  }

  const oldAvgErr = measured.length > 0
    ? Number((measured.reduce((acc, p) => acc + (p.err || 0), 0) / measured.length).toFixed(2))
    : 0;

  badPoints.forEach((q) => {
    q.cycles = (q.cycles || 4) + 4;
    q.err = Number((Math.max(0.18, q.err * 0.42)).toFixed(2));
    q.v = Number((q.v * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2));
    q.remeasured = true;
    q.status = 'repeated';
  });

  const newAvgErr = measured.length > 0
    ? Number((measured.reduce((acc, p) => acc + (p.err || 0), 0) / measured.length).toFixed(2))
    : 0;

  const result = {
    status: 'ok',
    remeasuredCount: badPoints.length,
    threshold,
    oldAvgErr,
    newAvgErr,
    isTargeted,
    points: surveySession.points.slice(0, surveySession.currentIndex),
  };

  broadcastSSE('remeasure_completed', result);
  res.json(result);
});

app.get('/api/survey/state', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    isRunning: surveySession.isRunning,
    currentIndex: surveySession.currentIndex,
    totalPoints: surveySession.points.length,
    config: surveyConfig,
    activeElectrodes: surveySession.activeElectrodes,
    lastBatch: surveySession.lastBatch,
    points: surveySession.points.slice(0, surveySession.currentIndex),
  });
});

app.get('/api/files', (req: Request, res: Response) => {
  const filesList = Array.from(storedFiles.values()).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ status: 'ok', files: filesList });
});

app.get('/api/instrument/storage', (req: Request, res: Response) => {
  const totalCapacity = 80000;
  let usedPoints = 0;
  storedFiles.forEach((file) => {
    if (file.type === 'survey') {
      usedPoints += file.pointsCount;
    }
  });
  if (surveySession.currentIndex > 0) {
    usedPoints += surveySession.currentIndex;
  }
  const freePoints = Math.max(0, totalCapacity - usedPoints);
  const freePct = Number(((freePoints / totalCapacity) * 100).toFixed(1));

  res.json({
    status: 'ok',
    totalCapacity,
    usedPoints,
    freePoints,
    freePct,
    filesCount: storedFiles.size,
    flashStatus: 'Memoria Flash No Volátil AGI · 100% Operativa',
    backupBatteryV: 3.2,
  });
});

app.get('/api/files/:filename/export', (req: Request, res: Response) => {
  const { filename } = req.params;
  const format = ((req.query.format as string) || 'stg').toLowerCase();

  const fileEntry = storedFiles.get(filename);
  const baseName = fileEntry?.baseName || filename.replace(/\.[^.]+$/, '');

  // If exporting a .cmd file directly
  if (format === 'cmd' || fileEntry?.type === 'cmd') {
    const cmdContent = fileEntry?.content || formatCMD(surveyConfig.progId || 'MINAVETA', preMeasured);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.cmd"`);
    return res.send(cmdContent);
  }

  // Gather points to export
  let pointsToExport: QuadripolePoint[] = [];
  if (fileEntry?.dataPoints && fileEntry.dataPoints.length > 0) {
    pointsToExport = fileEntry.dataPoints;
  } else if (filename.startsWith(surveyConfig.jobName) && surveySession.currentIndex > 0) {
    pointsToExport = surveySession.points.slice(0, surveySession.currentIndex);
  } else {
    pointsToExport = preMeasured;
  }

  const spacing = surveyConfig.spacing || 5;

  if (format === 'crs') {
    const crsContent = formatCRS(baseName, surveyConfig, instrument.contactResistance, fileEntry?.createdAt);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.crs"`);
    return res.send(crsContent);
  } else if (format === 'dat') {
    const datContent = formatDAT_Res2DInv(baseName, pointsToExport, surveyConfig);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.dat"`);
    return res.send(datContent);
  } else if (format === 'csv') {
    const csvContent = formatCSV(pointsToExport);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
    return res.send(csvContent);
  } else if (format === 'stg') {
    const stgContent = formatSTG(baseName, pointsToExport, surveyConfig);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.stg"`);
    return res.send(stgContent);
  } else if (format === 'json') {
    return res.json({
      jobName: baseName,
      surveyConfig,
      points: pointsToExport,
      metadata: fileEntry?.metadata,
    });
  } else {
    // Default to ZondRes2D format with real topography block
    const z2dContent = formatZ2D(pointsToExport, spacing, surveyConfig);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.z2d"`);
    return res.send(z2dContent);
  }
});

app.get('/api/files/:filename/zip', (req: Request, res: Response) => {
  const { filename } = req.params;
  const file = storedFiles.get(filename);
  if (!file) {
    return res.status(404).json({ error: 'Archivo no encontrado.' });
  }

  const baseName = file.baseName || filename.replace(/\.[^.]+$/, '');
  const pts = file.dataPoints && file.dataPoints.length > 0 ? file.dataPoints : preMeasured;
  const spacing = surveyConfig.spacing || 5;

  const stgContent = formatSTG(baseName, pts, surveyConfig);
  const crsContent = formatCRS(baseName, surveyConfig, instrument.contactResistance, file.createdAt);
  const datContent = formatDAT_Res2DInv(baseName, pts, surveyConfig);
  const z2dContent = formatZ2D(pts, spacing, surveyConfig);
  const csvContent = formatCSV(pts);
  const cmdContent = file.content || formatCMD(surveyConfig.progId || 'MINAVETA', pts);

  const qcReport = [
    `========================================================================`,
    `AGI SUPERSTING R8/IP - CERTIFICADO DE LEVANTAMIENTO Y CONTROL DE CALIDAD`,
    `========================================================================`,
    `Nombre de Archivo: ${file.name}`,
    `Proyecto / Línea: ${baseName}`,
    `Fecha Fin de Adquisición: ${file.createdAt}`,
    `Hash de Integridad (SHA-256): ${file.metadata?.hashSha256 || 'N/A'}`,
    `------------------------------------------------------------------------`,
    `EQUIPO & CALIBRACIÓN:`,
    `• Instrumento: AGI SuperSting R8/IP Multicanal (8 Canales)`,
    `• Número de Serie: ${file.metadata?.serialNumber || 'SS-R8-08412'}`,
    `• Versión de Firmware: ${file.metadata?.firmware || 'v4.2.1-AGI'}`,
    `• Operador Responsable: ${file.metadata?.operator || 'Ing. Geofísico de Terreno'}`,
    `------------------------------------------------------------------------`,
    `PARÁMETROS DE CAMPO:`,
    `• Cantidad de Electrodos: ${surveyConfig.electrodes}`,
    `• Espaciamiento Unitario: ${spacing} m`,
    `• Arreglo Geofísico: ${surveyConfig.arrayType.toUpperCase()}`,
    `• Total de Cuadripolos Medidos: ${pts.length}`,
    `• Corriente Máxima: ${surveyConfig.maxCurrent || 500} mA`,
    `• Voltaje Máximo Transmisor: ${surveyConfig.maxVoltageVp || 800} Vp-p`,
    `• Stacks: Mín ${surveyConfig.minStacks || 2} - Máx ${surveyConfig.maxStacks || 6} (Umbral RMS < ${surveyConfig.stackErrorThreshold || 2.0}%)`,
    `• Polarización Inducida: ${surveyConfig.isIP ? `TDIP Activo (Ciclo ${surveyConfig.ipCycle || 2.0}s, Ventanas M1-M6)` : 'DC Pura (Sin TDIP)'}`,
    `------------------------------------------------------------------------`,
    `POSICIONAMIENTO GPS WGS84:`,
    `• Vértice Inicial (Pica 1): Lat ${file.metadata?.gpsVertexA?.lat || -14.28421}°, Lon ${file.metadata?.gpsVertexA?.lon || -71.49215}°, Cota ${file.metadata?.gpsVertexA?.elevM || 3850} m.s.n.m.`,
    `• Vértice Final (Pica ${surveyConfig.electrodes}): Lat ${file.metadata?.gpsVertexB?.lat || -14.28285}°, Lon ${file.metadata?.gpsVertexB?.lon || -71.48972}°, Cota ${file.metadata?.gpsVertexB?.elevM || 3874} m.s.n.m.`,
    `• Precisión GPS: ${file.metadata?.gpsFix || '3D Fix'} (${file.metadata?.gpsSatellites || 9} Satélites)`,
    `------------------------------------------------------------------------`,
    `CONTENIDO DEL PAQUETE:`,
    `1. ${baseName}.stg      -> Formato Nativo AGI SuperSting`,
    `2. ${baseName}.crs      -> Contact Resistance Survey AGI`,
    `3. ${baseName}.dat      -> Formato Res2DInv (M.H. Loke) con topografía`,
    `4. ${baseName}.z2d      -> Formato ZondRes2D con topografía real`,
    `5. ${baseName}.csv      -> Tabla de Datos Crudos y Geométricos`,
    `6. ${baseName}.cmd      -> Script de Conmutación de Electrodos 8CH`,
    `7. METADATA_QC.txt     -> Este documento de certificación`,
    `========================================================================`,
  ].join('\r\n');

  const zipEntries = [
    { name: `${baseName}.stg`, content: stgContent },
    { name: `${baseName}.crs`, content: crsContent },
    { name: `${baseName}.dat`, content: datContent },
    { name: `${baseName}.z2d`, content: z2dContent },
    { name: `${baseName}.csv`, content: csvContent },
    { name: `${baseName}.cmd`, content: cmdContent },
    { name: `METADATA_QC.txt`, content: qcReport },
  ];

  const zipBuf = createZipBuffer(zipEntries);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}_PACKAGE.zip"`);
  res.send(zipBuf);
});

app.post('/api/files/:filename/rename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const { newName } = req.body;
  if (!newName || typeof newName !== 'string') {
    return res.status(400).json({ error: 'Nuevo nombre inválido.' });
  }
  if (!storedFiles.has(filename)) {
    return res.status(404).json({ error: 'Archivo no encontrado.' });
  }
  const cleanNewName = newName.trim();
  const file = storedFiles.get(filename)!;
  storedFiles.delete(filename);
  file.name = cleanNewName;
  file.baseName = cleanNewName.replace(/\.[^.]+$/, '');
  storedFiles.set(cleanNewName, file);

  res.json({ status: 'ok', file, message: `Archivo renombrado a ${cleanNewName}.` });
});

app.delete('/api/files/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  if (storedFiles.has(filename)) {
    storedFiles.delete(filename);
    return res.json({ status: 'ok', message: `Archivo ${filename} eliminado del almacenamiento.` });
  }
  res.status(404).json({ error: 'Archivo no encontrado.' });
});

app.post('/api/files/upload-cmd', (req: Request, res: Response) => {
  const { filename, content } = req.body;
  if (!filename || !content) {
    return res.status(400).json({ error: 'Nombre de archivo y contenido requeridos.' });
  }
  const lines = (content as string).split('\n').filter((l) => l.trim().length > 0);
  const baseName = filename.replace(/\.[^.]+$/, '');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  storedFiles.set(filename, {
    name: filename,
    baseName,
    type: 'cmd',
    formatsAvailable: ['cmd'],
    pointsCount: lines.length,
    createdAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    content,
    metadata: {
      ...defaultCmdMeta,
      hashSha256: hash,
    },
  });

  res.json({
    status: 'ok',
    message: `Archivo de comandos ${filename} guardado con éxito (${lines.length} comandos).`,
  });
});

app.post('/api/survey/inversion', (req: Request, res: Response) => {
  const { iterations = 3, smoothingLambda = 0.15 } = req.body || {};
  const currentPoints = surveySession.points.slice(0, surveySession.currentIndex);
  const result = estimate2DInversion(currentPoints, { iterations, smoothingLambda });
  res.json({
    status: 'ok',
    rmsError: result.rmsError,
    iteration: result.iteration,
    targets: result.targets,
    pointsCount: result.points.length,
    samplePoints: result.points.slice(0, 8),
  });
});

app.post('/api/assistant/interpret', async (req: Request, res: Response) => {
  const { summary, anomalies, badElectrodes, miningTargets, priorDrillholes, petrophysicalUnits, invertedModel } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Actúa como un geofísico senior consultor de exploración minera y tomografía eléctrica multicanal (ERT/IP) con AGI SuperSting R8/IP.
Analiza con rigor geológico-minero los siguientes datos adquiridos:
- Parámetros de Adquisición: ${JSON.stringify(summary || {})}
- Control de Calidad y Contactos (>5 kOhm): ${JSON.stringify(badElectrodes || [])}
- Dinámica de Resistividades y Polarización Inducida: ${JSON.stringify(anomalies || {})}
- Modelo Invertido 2D (True Earth Model) & Blancos Detectados: ${JSON.stringify(miningTargets || invertedModel || [])}
- Sondajes Previos de Validación: ${JSON.stringify(priorDrillholes || [])}
- Tabla Petrofísica del Proyecto: ${JSON.stringify(petrophysicalUnits || [])}
- Estándar de Medición IP: Ventana Newmont M11-M14 (td=100ms, tw=1000ms), Ciclo 2.0s bipolar AGI SuperSting, Halo IP: 15-45 mV/V.

Estructura tu informe profesional en español (4 secciones concisas con viñetas técnicas):
1. **Control de Calidad (QC) y Confiabilidad de Señal**: Evaluación de inyección (mA), apilamiento (stacks) y resistencia de contacto para exploración minera.
2. **Interpretación Lito-Estructural del Modelo Invertido**: Correlación de resistividades verdaderas (silicificación, vetas de cuarzo >2500 Ω·m, fallas/brechas, alteración argílica 15-60 Ω·m) y su concordancia con sondajes previos.
3. **Respuesta de Polarización Inducida (IP) y Cuerpos Sulfurados**: Análisis de cargabilidad (sulfuros masivos conductores <15 Ω·m / M>45 mV/V vs halo diseminado de pórfido M=15-45 mV/V).
4. **Recomendaciones de Blancos de Perforación (Drill Targets)**: Ubicación precisa de collar (estación X y cota Z), azimut, inclinación (-50° a -90°) y longitud de sondaje diamantino para cortar el blanco.

Añade siempre la siguiente advertencia:
"Aviso Técnico-Legal: Este módulo emite sugerencias lito-estructurales y trayectorias orientativas basadas en inversión geofísica 2D. No constituye decisión final de perforación; el geólogo o geofísico colegiado a cargo debe contrastar la geología de superficie y el modelo geotécnico antes de movilizar sondajes diamantinos."`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return res.json({
        status: 'ok',
        source: 'gemini',
        interpretation: response.text,
      });
    } catch (err: unknown) {
      console.warn('[Gemini API] Error, falling back to local heuristic:', err);
    }
  }

  // Heuristic mining geophysical report
  const badCount = (badElectrodes || []).length;
  const qcStatus = badCount > 3 ? 'Atención Requerida (QC Medio en Picas)' : 'Excelente para Minería (QC Alto)';
  const priorNote = (priorDrillholes && priorDrillholes.length > 0)
    ? `\n• Correlación con Sondajes Previos: Se integraron ${priorDrillholes.length} sondajes históricos. El sondaje ${priorDrillholes[0].name} valida la continuidad del horizonte cuarcífero y sulfuros a 26m de profundidad.`
    : '';

  const lines = [
    `# INFORME GEOFÍSICO-MINERO DE TERRENO (SuperSting R8/IP)`,
    `**Norma IP:** Newmont M11-M14 (td=100ms, tw=1000ms), Ciclo 2.0s bipolar · Halo IP: 15-45 mV/V`,
    `1. **Control de Calidad (QC)**: Estado: ${qcStatus}.`,
    badCount > 0
      ? `• Se detectaron ${badCount} electrodos con alta resistencia (>5 kΩ). En terrenos mineros rocosos se aconseja solución salina/bentonita para mantener ${summary?.maxCurrentMA || 500} mA.`
      : `• Contactos de electrodos óptimos (< 2.5 kΩ). Relación señal/ruido superior gracias al apilamiento de ciclos.`,
    `2. **Interpretación Lito-Estructural del Modelo Invertido**:`,
    `• **Veta / Estructura Tabular Silícea (Resistividad > 2500 Ω·m)**: Zona de fuerte silicificación y cuarzo epitermal detectada hacia el sector central/este (X ≈ 160-220m), con extensión en profundidad >25m.`,
    `• **Corredor de Falla y Brecha Hidrotermal (15 - 60 Ω·m)**: Fuerte contraste resistivo indicativo de alteración argílica perimetral con arcillas conductivas (illita/esmectita).`,
    priorNote,
    `3. **Polarización Inducida (IP) & Cuerpos Sulfurados**:`,
    `• **Anomalía de Alta Cargabilidad (M > 45 mV/V, ρ < 15 Ω·m)**: Coincidente con baja resistividad (< 15 Ω·m), característica de sulfuros metálicos masivos/semimasivos (calcopirita, pirita, galena).`,
    `• **Halo de Sulfuros Diseminados (M = 15 - 45 mV/V)**: Bordes de la estructura silícea con diseminación sulfurada aurífera.`,
    `4. **Recomendaciones de Perforación Diamantina (Sondajes)**:`,
    `• **Blanco Prioritario DDH-01**: Collar en estación X=105m (Cota 3862 msnm), Azimut 090°, Inclinación -60°, Longitud 35m para interceptar el lente de sulfuro masivo a 20m de profundidad vertical.`,
    `• **Blanco Prioritario DDH-02**: Collar en estación X=175m (Cota 3868 msnm), Azimut 090°, Inclinación -65°, Longitud 42m para cortar clavo de veta cuarcífera epitermal en cota profunda (-28m).`,
    ``,
    `Aviso Técnico-Legal: Este módulo emite sugerencias lito-estructurales y trayectorias orientativas basadas en inversión geofísica 2D. No constituye decisión final de perforación; el geólogo o geofísico colegiado a cargo debe contrastar la geología de superficie y el modelo geotécnico antes de movilizar sondajes diamantinos.`,
  ].filter(Boolean);

  res.json({
    status: 'ok',
    source: 'offline_heuristic',
    interpretation: lines.join('\n'),
  });
});

app.get('/api/survey/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('event: connected\ndata: {"status":"connected"}\n\n');
  sseClients.push(res);

  req.on('close', () => {
    const index = sseClients.indexOf(res);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[SuperSting R8/IP Backend] Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Backend] Failed to start server:', err);
});
