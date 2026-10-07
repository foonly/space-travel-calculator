import { describe, it, expect } from "vitest";
import {
	C,
	G,
	UNITS,
	calculateTravel,
	maxBurnTime,
	solveCoastTime,
	fuelUsage,
	planMission,
	missionProfile,
	formatDistance,
	formatDuration,
} from "./physics";

const YEAR = UNITS.TIME.Y.factor;
const AU = UNITS.DISTANCE.AU.factor;
const LY = UNITS.DISTANCE.LY.factor;

const baseParams = {
	distance: AU,
	acceleration: G,
	exhaustVelocity: 0.1 * C,
	dryMass: 1000,
	fuelCapacity: 2000,
	coastTime: 0,
	flipTime: 120,
	waitTime: 0,
	autoCoast: false,
	roundTrip: false,
	ignoreFuelMass: false,
};

describe("calculateTravel", () => {
	it("matches reference values for 4.3 ly at 1 g with no coasting", () => {
		const res = calculateTravel(4.3 * LY, G, 0, 0);
		expect(res.totalProperTime / YEAR).toBeCloseTo(3.56, 2);
		expect(res.totalCoordTime / YEAR).toBeCloseTo(5.93, 2);
		expect(res.maxSpeed).toBeLessThan(C);
	});

	it("approaches the classical result for short trips", () => {
		const D = 384400e3; // Moon
		const res = calculateTravel(D, G, 0, 0);
		const classical = 2 * Math.sqrt(D / G);
		expect(res.totalCoordTime / classical).toBeCloseTo(1, 6);
		expect(res.maxGamma).toBeCloseTo(1, 6);
	});

	it("covers exactly the requested distance with flip and coast phases", () => {
		const D = 10 * AU;
		const res = calculateTravel(D, G, 86400, 600);
		const covered =
			res.accelPhase.distance +
			res.flipPhase.distance +
			res.coastPhase.distance +
			res.decelPhase.distance;
		expect(covered / D).toBeCloseTo(1, 9);
	});

	it("handles zero distance", () => {
		const res = calculateTravel(0, G, 0, 120);
		expect(res.maxSpeed).toBe(0);
		expect(res.totalCoordTime).toBe(120);
	});
});

describe("maxBurnTime", () => {
	it("inverts the rocket equation", () => {
		const tau = maxBurnTime(baseParams);
		const { massRatio } = fuelUsage(baseParams, tau);
		expect(massRatio).toBeCloseTo(3, 9); // (1000 + 2000) / 1000
	});

	it("is zero with no fuel", () => {
		expect(maxBurnTime({ ...baseParams, fuelCapacity: 0 })).toBe(0);
		expect(
			maxBurnTime({ ...baseParams, fuelCapacity: 0, ignoreFuelMass: true }),
		).toBe(0);
	});
});

describe("solveCoastTime", () => {
	it("returns 0 when burning alone covers the distance", () => {
		expect(solveCoastTime(AU, G, 120, 1e7)).toBe(0);
	});

	it("returns null when the ship cannot accelerate", () => {
		expect(solveCoastTime(AU, G, 120, 0)).toBeNull();
	});

	it("produces a coast that keeps burns at the given length", () => {
		const tau1 = 3600;
		const coast = solveCoastTime(AU, G, 120, tau1);
		const res = calculateTravel(AU, G, coast, 120);
		expect(res.accelPhase.properTime).toBeCloseTo(tau1, 3);
	});
});

describe("fuelUsage", () => {
	it("uses the relativistic rocket equation for a photon rocket", () => {
		const params = { ...baseParams, exhaustVelocity: C };
		const { massRatio } = fuelUsage(params, YEAR);
		expect(massRatio).toBeCloseTo(Math.exp((G * YEAR) / C), 9);
	});

	it("leaves nothing when exactly the required fuel is loaded", () => {
		const burn = 1e6;
		const { fuelUsed } = fuelUsage(baseParams, burn);
		const exact = fuelUsage({ ...baseParams, fuelCapacity: fuelUsed }, burn);
		expect(exact.fuelRemaining).toBeCloseTo(0, 6);
		expect(exact.fuelWarning).toBe(false);
	});

	it("accounts for the extra mass of full tanks", () => {
		const { fuelUsed, fuelRemaining } = fuelUsage(baseParams, 1e6);
		expect(fuelRemaining).toBeLessThan(baseParams.fuelCapacity - fuelUsed);
	});

	it("is linear when fuel mass is ignored", () => {
		const params = { ...baseParams, ignoreFuelMass: true };
		const one = fuelUsage(params, 1e5);
		const two = fuelUsage(params, 2e5);
		expect(two.fuelUsed).toBeCloseTo(2 * one.fuelUsed, 9);
		expect(one.fuelRemaining).toBeCloseTo(2000 - one.fuelUsed, 9);
	});

	it("warns when the tanks are too small", () => {
		expect(fuelUsage({ ...baseParams, fuelCapacity: 1 }, 1e7).fuelWarning).toBe(
			true,
		);
	});
});

describe("planMission", () => {
	it("uses exactly all fuel when auto-coasting is needed", () => {
		const res = planMission({
			...baseParams,
			distance: 4.3 * LY,
			autoCoast: true,
		});
		expect(res.coastPhase.coordTime).toBeGreaterThan(0);
		expect(res.fuelUsed).toBeCloseTo(baseParams.fuelCapacity, 3);
		expect(res.fuelRemaining).toBeCloseTo(0, 3);
	});

	it("does not coast when fuel is plentiful", () => {
		const res = planMission({ ...baseParams, autoCoast: true });
		expect(res.coastPhase.coordTime).toBe(0);
		expect(res.fuelWarning).toBe(false);
	});

	it("returns null when auto-coasting with no fuel", () => {
		expect(
			planMission({ ...baseParams, fuelCapacity: 0, autoCoast: true }),
		).toBeNull();
	});

	it("doubles a round trip and adds the wait time", () => {
		const oneWay = planMission(baseParams);
		const round = planMission({
			...baseParams,
			roundTrip: true,
			waitTime: 86400,
		});
		expect(round.totalDistance).toBe(2 * AU);
		expect(round.totalCoordTime).toBeCloseTo(
			2 * oneWay.totalCoordTime + 86400,
			6,
		);
		expect(round.fuelUsed).toBeGreaterThan(oneWay.fuelUsed);
	});
});

describe("missionProfile", () => {
	it.each([
		["one way", {}],
		["round trip", { roundTrip: true, waitTime: 86400 }],
		["ignoring fuel mass", { ignoreFuelMass: true }],
	])("starts and ends at rest and matches the results (%s)", (_, extra) => {
		const params = { ...baseParams, ...extra };
		const res = planMission(params);
		const profile = missionProfile(res, params);
		const last = profile.time.length - 1;

		expect(profile.velocity[0]).toBe(0);
		expect(profile.velocity[last]).toBeCloseTo(0, 9);
		expect(profile.time[last]).toBeCloseTo(res.totalCoordTime, 3);
		expect(profile.fuel[0]).toBe(params.fuelCapacity);
		expect(profile.fuel[last]).toBeCloseTo(res.fuelRemaining, 6);
		expect(Math.max(...profile.velocity)).toBeCloseTo(res.maxSpeed / 1000, 6);
	});
});

describe("formatting", () => {
	it("picks distance units at their exact boundaries", () => {
		expect(formatDistance(999)).toBe("999m");
		expect(formatDistance(AU)).toBe("1 AU");
		expect(formatDistance(LY)).toBe("1 ly");
	});

	it("picks duration units", () => {
		expect(formatDuration(30)).toBe("30s");
		expect(formatDuration(90)).toBe("1.5m");
		expect(formatDuration(YEAR)).toBe("1y");
	});
});
