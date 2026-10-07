export const C = 299792458; // m/s
export const G = 9.80665; // m/s^2

export const UNITS = {
	DISTANCE: {
		KM: { label: "km", factor: 1000 },
		AU: { label: "AU", factor: 149597870700 },
		LY: { label: "ly", factor: 9460730472580800 },
		PC: { label: "pc", factor: 30856775814913673 },
	},
	ACCELERATION: {
		MS2: { label: "m/s²", factor: 1 },
		G: { label: "G", factor: G },
	},
	TIME: {
		S: { label: "seconds", factor: 1 },
		M: { label: "minutes", factor: 60 },
		H: { label: "hours", factor: 3600 },
		D: { label: "days", factor: 86400 },
		Y: { label: "years", factor: 31557600 }, // Julian year
	},
};

export function calculateTravel(D, a, tCoastCoord = 0, tFlip = 120) {
	// We need to find tau1 (proper time of acceleration) such that
	// 2 * x1(tau1) + v1(tau1) * (tCoastCoord + tFlip) = D
	// x1 = (c^2/a) * (cosh(a*tau1/c) - 1)
	// v1 = c * tanh(a*tau1/c)

	let tau1;
	const tTotalNonAccel = tCoastCoord + tFlip;

	if (tTotalNonAccel === 0) {
		// Exact solution for zero coasting/flip
		// cosh(a*tau1/c) = a*D/(2*c^2) + 1
		tau1 = (C / a) * Math.acosh((a * D) / (2 * C ** 2) + 1);
	} else {
		// Numerical solution for tau1
		// f(tau) = 2*(C^2/a)*(cosh(a*tau/C)-1) + C*tanh(a*tau/C)*tTotalNonAccel - D
		let low = 0;
		// Upper bound: the tau1 when tTotalNonAccel is 0
		let high = (C / a) * Math.acosh((a * D) / (2 * C ** 2) + 1);

		for (let i = 0; i < 100; i++) {
			let mid = (low + high) / 2;
			let x1 = (C ** 2 / a) * (Math.cosh((a * mid) / C) - 1);
			let v1 = C * Math.tanh((a * mid) / C);
			let val = 2 * x1 + v1 * tTotalNonAccel - D;

			if (Math.abs(val) < 1e-3 || high - low < 1e-9) {
				tau1 = mid;
				break;
			}
			if (val > 0) high = mid;
			else low = mid;
			tau1 = mid;
		}
	}

	const x1 = (C ** 2 / a) * (Math.cosh((a * tau1) / C) - 1);
	const t1 = (C / a) * Math.sinh((a * tau1) / C);
	const v1 = C * Math.tanh((a * tau1) / C);

	// Time dilation factor at max speed: gamma = cosh(a*tau1/c)
	const gamma = Math.cosh((a * tau1) / C);
	// Coasting proper time: tau_coast = t_coast / gamma
	const tauCoast = tCoastCoord / gamma;

	const totalProperTime = 2 * tau1 + tauCoast + tFlip;
	const totalCoordTime = 2 * t1 + tCoastCoord + tFlip;

	return {
		accelPhase: {
			properTime: tau1,
			coordTime: t1,
			distance: x1,
		},
		coastPhase: {
			properTime: tauCoast,
			coordTime: tCoastCoord,
			distance: v1 * tCoastCoord,
		},
		decelPhase: {
			properTime: tau1,
			coordTime: t1,
			distance: x1,
		},
		flipPhase: {
			properTime: tFlip,
			coordTime: tFlip,
			distance: v1 * tFlip,
		},
		maxSpeed: v1,
		maxSpeedPct: (v1 / C) * 100,
		totalProperTime,
		totalCoordTime,
		totalDistance: D,
		maxGamma: gamma,
	};
}

// Mission parameters shared by the functions below. SI units, masses in tonnes:
// { distance, acceleration, exhaustVelocity, dryMass (ship + cargo), fuelCapacity,
//   coastTime, flipTime, waitTime, autoCoast, roundTrip, ignoreFuelMass }

// Total proper time the engine can burn before the tanks run dry
export function maxBurnTime({
	acceleration: a,
	exhaustVelocity: vE,
	dryMass,
	fuelCapacity,
	ignoreFuelMass,
}) {
	if (ignoreFuelMass) {
		// Linear fuel consumption: m_fuel = (m_dry * a * tau) / v_e
		return (fuelCapacity * vE) / (dryMass * a);
	}
	// Relativistic rocket equation: tau = (v_e / a) * ln(m0 / m1)
	return (vE / a) * Math.log((dryMass + fuelCapacity) / dryMass);
}

// Coasting time needed when each burn segment is limited to tau1.
// Returns null when the ship cannot accelerate at all.
export function solveCoastTime(distance, a, flipTime, tau1) {
	const v1 = C * Math.tanh((a * tau1) / C);
	const maxDistAccelOnly =
		2 * (C ** 2 / a) * (Math.cosh((a * tau1) / C) - 1) + v1 * flipTime;

	if (maxDistAccelOnly >= distance) return 0;
	if (v1 <= 0) return null;
	return (distance - maxDistAccelOnly) / v1;
}

export function fuelUsage(
	{
		acceleration: a,
		exhaustVelocity: vE,
		dryMass,
		fuelCapacity,
		ignoreFuelMass,
	},
	burnTime,
) {
	let fuelUsed, massRatio, fuelRemaining;

	if (ignoreFuelMass) {
		// Linear consumption: mass is constant, so fuel is proportional to work/impulse
		fuelUsed = (dryMass * a * burnTime) / vE;
		massRatio = 1 + fuelUsed / dryMass;
		fuelRemaining = Math.max(0, fuelCapacity - fuelUsed);
	} else {
		// Exponential consumption (Rocket Equation)
		massRatio = Math.exp((a * burnTime) / vE);
		// Minimum fuel needed if only that much were loaded
		fuelUsed = dryMass * (massRatio - 1);
		// What is left when flying with full tanks, whose extra mass costs fuel too
		fuelRemaining = Math.max(0, (dryMass + fuelCapacity) / massRatio - dryMass);
	}

	return {
		fuelUsed,
		massRatio,
		fuelRemaining,
		fuelWarning: fuelUsed > fuelCapacity + 0.01,
	};
}

// Full mission results. Returns null when auto-coasting cannot reach the destination.
export function planMission(params) {
	const { distance, acceleration, flipTime, roundTrip, autoCoast } = params;
	const segments = roundTrip ? 4 : 2;

	let coastTime = params.coastTime ?? 0;
	if (autoCoast) {
		coastTime = solveCoastTime(
			distance,
			acceleration,
			flipTime,
			maxBurnTime(params) / segments,
		);
		if (coastTime === null) return null;
	}

	const res = calculateTravel(distance, acceleration, coastTime, flipTime);
	Object.assign(res, fuelUsage(params, segments * res.accelPhase.properTime));

	if (roundTrip) {
		const waitTime = params.waitTime ?? 0;
		res.totalProperTime = res.totalProperTime * 2 + waitTime;
		res.totalCoordTime = res.totalCoordTime * 2 + waitTime;
		res.totalDistance = distance * 2;
		res.waitTimeSeconds = waitTime;
	}

	return res;
}

// Time series for the charts: time (s), velocity (km/s), fuel (t) and thrust (MN)
export function missionProfile(res, params, steps = 50) {
	const {
		acceleration: a,
		exhaustVelocity: vE,
		dryMass,
		fuelCapacity,
		roundTrip,
		ignoreFuelMass,
	} = params;
	const { accelPhase, flipPhase, coastPhase, decelPhase, maxSpeed } = res;

	// Ship mass is constant when fuel mass is ignored, otherwise it starts with full tanks
	const m0 = ignoreFuelMass ? dryMass : dryMass + fuelCapacity;
	const massAfter = (tauBurned) =>
		ignoreFuelMass ? dryMass : m0 * Math.exp((-a * tauBurned) / vE);
	const fuelUsedAfter = (tauBurned) =>
		ignoreFuelMass ? (dryMass * a * tauBurned) / vE : m0 - massAfter(tauBurned);
	// Speed at coordinate time t into a burn from rest
	const speedAt = (t) => (a * t) / Math.sqrt(1 + ((a * t) / C) ** 2);

	const profile = { time: [], velocity: [], fuel: [], thrust: [] };
	const addPoint = (t, v, tauBurned, burning) => {
		profile.time.push(t);
		profile.velocity.push(v / 1000);
		profile.fuel.push(fuelCapacity - fuelUsedAfter(tauBurned));
		profile.thrust.push(burning ? (massAfter(tauBurned) * a) / 1000 : 0);
	};

	let t = 0;
	let tau = 0;

	const addLeg = () => {
		for (let i = 0; i <= steps; i++) {
			const f = i / steps;
			addPoint(
				t + f * accelPhase.coordTime,
				speedAt(f * accelPhase.coordTime),
				tau + f * accelPhase.properTime,
				true,
			);
		}
		t += accelPhase.coordTime;
		tau += accelPhase.properTime;

		if (flipPhase.coordTime > 0) {
			t += flipPhase.coordTime;
			addPoint(t, maxSpeed, tau, false);
		}
		if (coastPhase.coordTime > 0) {
			t += coastPhase.coordTime;
			addPoint(t, maxSpeed, tau, false);
		}

		for (let i = 1; i <= steps; i++) {
			const f = i / steps;
			addPoint(
				t + f * decelPhase.coordTime,
				speedAt((1 - f) * decelPhase.coordTime),
				tau + f * decelPhase.properTime,
				true,
			);
		}
		t += decelPhase.coordTime;
		tau += decelPhase.properTime;
	};

	addLeg();
	if (roundTrip) {
		if (res.waitTimeSeconds > 0) {
			t += res.waitTimeSeconds;
			addPoint(t, 0, tau, false);
		}
		addLeg();
	}

	return profile;
}

const formatNumber = (n) =>
	n.toLocaleString(undefined, { maximumSignificantDigits: 3 });

export function formatDuration(seconds) {
	const { M, H, D, Y } = UNITS.TIME;
	if (seconds < M.factor) return `${formatNumber(seconds)}s`;
	if (seconds < H.factor) return `${formatNumber(seconds / M.factor)}m`;
	if (seconds < D.factor) return `${formatNumber(seconds / H.factor)}h`;
	if (seconds < Y.factor) return `${formatNumber(seconds / D.factor)}d`;
	return `${formatNumber(seconds / Y.factor)}y`;
}

export function formatDistance(meters) {
	const { KM, AU, LY } = UNITS.DISTANCE;
	if (meters < KM.factor) return `${formatNumber(meters)}m`;
	if (meters < AU.factor) return `${formatNumber(meters / KM.factor)}km`;
	if (meters < LY.factor) return `${formatNumber(meters / AU.factor)} AU`;
	return `${formatNumber(meters / LY.factor)} ly`;
}
