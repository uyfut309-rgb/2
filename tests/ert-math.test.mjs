import test from 'node:test';
import assert from 'node:assert/strict';

// Test Edwards 1977 median depth calculations
function getEdwardsDepthDD(n, a) {
  const EdwardsCoeffs = {
    1: 0.416,
    2: 0.697,
    3: 0.962,
    4: 1.220,
    5: 1.476,
    6: 1.730,
    7: 1.983,
    8: 2.236,
  };
  const coeff = EdwardsCoeffs[n] ?? (0.416 + (n - 1) * 0.26);
  return Number((coeff * a).toFixed(2));
}

function getMidpointX(p, spacing = 5) {
  const xA = (p[0] - 1) * spacing;
  const xB = (p[1] - 1) * spacing;
  const xM = (p[2] - 1) * spacing;
  const xN = (p[3] - 1) * spacing;
  return Number(((Math.min(xA, xB) + Math.max(xM, xN)) / 2).toFixed(2));
}

test('Edwards 1977: n=1, a=5m should yield ze = 2.08m (not 4.16m)', () => {
  const z = getEdwardsDepthDD(1, 5);
  assert.equal(z, 2.08);
});

test('Edwards 1977: deep level a=15m, n=8 should yield ze ≈ 33.54m (not 56.2m)', () => {
  const z = getEdwardsDepthDD(8, 15);
  assert.equal(z, 33.54);
});

test('Midpoint X offset: Picas 35-36 / 37-38 with 5m spacing (el 1 at 0m) is 177.5m (not 182.5m)', () => {
  // Picas 35 (170m), 36 (175m), 37 (180m), 38 (185m)
  // Center between Tx dipole (170-175) and Rx dipole (180-185): (170 + 185) / 2 = 177.5m
  const p = [35, 36, 37, 38];
  const midX = getMidpointX(p, 5);
  assert.equal(midX, 177.5);
});

test('AGI Contact Resistance thresholds', () => {
  const getQuality = (r) => {
    if (r < 1800) return 'optimal';
    if (r <= 5000) return 'acceptable';
    return 'critical';
  };

  assert.equal(getQuality(1200), 'optimal');
  assert.equal(getQuality(1800), 'acceptable');
  assert.equal(getQuality(3500), 'acceptable');
  assert.equal(getQuality(5200), 'critical');
});

test('SuperSting Prog ID sanitization: max 8 alphanumeric characters', () => {
  const sanitizeProgId = (id) => (id || 'SURVEY').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  assert.equal(sanitizeProgId('MINA-VETA01'), 'MINAVETA');
  assert.equal(sanitizeProgId('PERFIL_02_IP'), 'PERFIL02');
  assert.equal(sanitizeProgId('R8_TEST'), 'R8TEST');
});

test('Physical Survey Timing: 92 Tx dipoles duration calculation', () => {
  const txDipoles = 92;
  const stacks = 4;
  const measureTime = 1.2;
  const ipCycle = 2.0;

  // DC Resistivity
  const dcSec = txDipoles * (stacks * measureTime + 0.8);
  const dcMin = Number((dcSec / 60).toFixed(1));
  assert.equal(dcMin, 8.6); // 8.6 minutes (not 0.8 min)

  // TDIP (4 pulses per stack: Ton+, Toff, Ton-, Toff)
  const ipSec = txDipoles * (stacks * (4 * ipCycle) + 1.0);
  const ipMin = Number((ipSec / 60).toFixed(1));
  assert.equal(ipMin, 50.6); // 50.6 minutes
});

test('Transmitter Ohm & Joule Law: 200W loop resistance limits', () => {
  const maxLoopResistance = (powerW, currentA) => powerW / (currentA * currentA);
  assert.equal(maxLoopResistance(200, 1.0), 200); // 1A requires <= 200 Ohm
  assert.equal(maxLoopResistance(200, 2.0), 50);  // 2A requires <= 50 Ohm
  assert.equal(maxLoopResistance(200, 0.5), 800); // 500mA allows up to 800 Ohm (or 1600 Ohm at 800Vp-p)
});

test('Pole-Dipole remote electrode condition: minimum 5x line length', () => {
  const lineLengthM = (56 - 1) * 5; // 275m
  const minRemoteDistM = 5 * lineLengthM;
  assert.equal(minRemoteDistM, 1375);
  assert.ok(1800 >= minRemoteDistM);
});

test('Unified Petrophysical Classification: Massive sulfide vs Disseminated halo', () => {
  const classify = (rho, ip) => {
    if (rho <= 15 && ip >= 45) return 'massive_sulfide';
    if (rho >= 15 && rho <= 150 && ip >= 15 && ip <= 45) return 'disseminated_halo';
    if (rho >= 15 && rho <= 60 && ip <= 14) return 'argillic_alteration';
    if (rho >= 2500) return 'siliceous_vein';
    return 'host_rock';
  };

  assert.equal(classify(8.5, 52), 'massive_sulfide');
  assert.equal(classify(95, 32), 'disseminated_halo');
  assert.equal(classify(35, 8), 'argillic_alteration');
  assert.equal(classify(3200, 4), 'siliceous_vein');
});

test('Suggested Drillhole Geometry: Collar offset and trajectory intersection', () => {
  const centroidX = 110;
  const centroidZ = 20;
  const dipDeg = -60;
  const rad = Math.abs(dipDeg) * (Math.PI / 180);

  const horizOffset = centroidZ / Math.tan(rad);
  const collarX = Math.round(centroidX - horizOffset);
  const targetDepthM = Math.round(centroidZ / Math.sin(rad) + 10);

  assert.equal(collarX, 98); // 110 - 11.55 rounded
  assert.equal(targetDepthM, 33); // 23.09 + 10 rounded
});

