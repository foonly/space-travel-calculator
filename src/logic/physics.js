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

	// Mass ratio calculation (assuming constant proper acceleration)
	// m0/m1 = exp(a * delta_tau / v_e)
	// delta_tau is the total proper time of acceleration + deceleration
	const deltaTauAccelDecel = 2 * tau1;
	const efficiency = 0.1; // Default 10% of c for advanced fusion
	const vExhaust = efficiency * C;
	const massRatio = Math.exp((a * deltaTauAccelDecel) / vExhaust);

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
		massRatio,
	};
}

export function formatDuration(seconds) {
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
	if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
	if (seconds < 31557600) return `${(seconds / 86400).toFixed(1)}d`;
	return `${(seconds / 31557600).toFixed(2)}y`;
}

export function formatDistance(meters) {
	if (meters < 1000) return `${meters.toFixed(1)}m`;
	if (meters < 1.5e11) return `${(meters / 1000).toLocaleString()}km`;
	if (meters < 9.46e15) return `${(meters / 1.496e11).toFixed(3)} AU`;
	return `${(meters / 9.461e15).toFixed(3)} ly`;
}
