<script setup>
import { ref, computed, watch, onMounted } from "vue";
import {
	calculateTravel,
	UNITS,
	formatDuration,
	formatDistance,
	C,
	G,
} from "./logic/physics";
import { PRESETS, SHIP_PRESETS } from "./logic/presets";
import {
	Rocket,
	Clock,
	Gauge,
	MoveRight,
	Info,
	Zap,
	Database,
	Fuel,
} from "lucide-vue-next";
import Chart from "chart.js/auto";

const distance = ref(1);
const distanceUnit = ref("AU");
const acceleration = ref(1);
const accelerationUnit = ref("G");
const coastingTime = ref(0);
const coastingTimeUnit = ref("D");
const flipTime = ref(120);
const efficiency = ref(10); // % of c
const dryMass = ref(1000);
const fuelCapacity = ref(2000);
const cargoMass = ref(0);
const waitTime = ref(0);
const waitTimeUnit = ref("D");
const autoCoast = ref(false);
const roundTrip = ref(false);

const results = ref(null);
const chartCanvas = ref(null);
const fuelChartCanvas = ref(null);
let chart = null;
let fuelChart = null;

const calculate = () => {
	const dValue = distance.value || 0;
	const dMeters = dValue * UNITS.DISTANCE[distanceUnit.value].factor;
	const aMs2 =
		acceleration.value * UNITS.ACCELERATION[accelerationUnit.value].factor;
	const effFraction = efficiency.value / 100;
	const vExhaust = effFraction * C;
	const totalDryMass = dryMass.value + cargoMass.value;

	let tCoastSeconds =
		(coastingTime.value || 0) * UNITS.TIME[coastingTimeUnit.value].factor;

	if (autoCoast.value) {
		const segments = roundTrip.value ? 4 : 2;
		const maxTotalProperAccelTime =
			(vExhaust / aMs2) *
			Math.log((totalDryMass + fuelCapacity.value) / totalDryMass);
		const tau1 = maxTotalProperAccelTime / segments;

		const maxDistAccelOnly =
			2 * (C ** 2 / aMs2) * (Math.cosh((aMs2 * tau1) / C) - 1) +
			C * Math.tanh((aMs2 * tau1) / C) * flipTime.value;

		if (maxDistAccelOnly > dMeters) {
			tCoastSeconds = 0;
		} else {
			const xRemainder = dMeters - maxDistAccelOnly;
			const v1 = C * Math.tanh((aMs2 * tau1) / C);
			tCoastSeconds = xRemainder / v1;

			// Switch unit automatically based on magnitude
			if (tCoastSeconds > 31557600) coastingTimeUnit.value = "Y";
			else if (tCoastSeconds > 86400) coastingTimeUnit.value = "D";
			else if (tCoastSeconds > 3600) coastingTimeUnit.value = "H";
			else if (tCoastSeconds > 60) coastingTimeUnit.value = "M";
			else coastingTimeUnit.value = "S";

			coastingTime.value =
				tCoastSeconds / UNITS.TIME[coastingTimeUnit.value].factor;
		}
	}

	try {
		results.value = calculateTravel(
			dMeters,
			aMs2,
			tCoastSeconds,
			flipTime.value,
		);

		// Override mass ratio with user efficiency and segments
		const segments = roundTrip.value ? 4 : 2;
		results.value.massRatio = Math.exp(
			(aMs2 * (segments * results.value.accelPhase.properTime)) / vExhaust,
		);
		results.value.fuelUsed = totalDryMass * (results.value.massRatio - 1);
		results.value.fuelWarning =
			results.value.fuelUsed > fuelCapacity.value + 0.01;

		if (roundTrip.value) {
			const tWaitSeconds =
				(waitTime.value || 0) * UNITS.TIME[waitTimeUnit.value].factor;
			results.value.totalProperTime =
				results.value.totalProperTime * 2 + tWaitSeconds;
			results.value.totalCoordTime =
				results.value.totalCoordTime * 2 + tWaitSeconds;
			results.value.waitTimeSeconds = tWaitSeconds;
		}

		updateChart();
	} catch (e) {
		console.error(e);
	}
};

const setPreset = (preset) => {
	distance.value = preset.distance;
	distanceUnit.value = preset.unit;
	calculate();
};

const setShipPreset = (ship) => {
	efficiency.value = ship.efficiency;
	dryMass.value = ship.dryMass;
	fuelCapacity.value = ship.fuelCapacity;
	acceleration.value = ship.accel;
	accelerationUnit.value = "G";
	flipTime.value = ship.flip;
	autoCoast.value = true;
	calculate();
};

const updateChart = () => {
	if (!chartCanvas.value || !fuelChartCanvas.value || !results.value) return;

	const res = results.value;
	const vData = [];
	const fData = [];
	const labels = [];
	const a =
		acceleration.value * UNITS.ACCELERATION[accelerationUnit.value].factor;
	const effFraction = efficiency.value / 100;
	const vExhaust = effFraction * C;

	const startFuel = fuelCapacity.value;
	const totalBurnTimeProper =
		(roundTrip.value ? 4 : 2) * res.accelPhase.properTime;
	const totalDryMassValue = dryMass.value + cargoMass.value;
	const massAtStart =
		totalDryMassValue * Math.exp((a * totalBurnTimeProper) / vExhaust);

	let currentMass = massAtStart;
	let currentTimeCoord = 0;

	const addPoint = (tCoord, v, m) => {
		labels.push(tCoord);
		vData.push(v / 1000);
		// Fuel remaining in tank (accounting for initial fuel used)
		const fuelUsedSoFar = massAtStart - m;
		fData.push(startFuel - fuelUsedSoFar);
	};

	const generateLeg = (startTimeCoord, startMass) => {
		let m = startMass;
		let tBase = startTimeCoord;

		// Accel
		const steps = 50;
		for (let i = 0; i <= steps; i++) {
			const stepFraction = i / steps;
			const tCoord = stepFraction * res.accelPhase.coordTime;
			const tProper = stepFraction * res.accelPhase.properTime;
			const v = (a * tCoord) / Math.sqrt(1 + ((a * tCoord) / C) ** 2);
			const mNow = startMass * Math.exp((-a * tProper) / vExhaust);
			addPoint(tBase + tCoord, v, mNow);
			m = mNow;
		}

		tBase += res.accelPhase.coordTime;
		const massAfterAccel = m;

		// Flip
		if (res.flipPhase.coordTime > 0) {
			tBase += res.flipPhase.coordTime;
			addPoint(tBase, res.maxSpeed, massAfterAccel);
		}

		// Coast
		if (res.coastPhase.coordTime > 0) {
			tBase += res.coastPhase.coordTime;
			addPoint(tBase, res.maxSpeed, massAfterAccel);
		}

		// Decel
		for (let i = 1; i <= steps; i++) {
			const stepFraction = i / steps;
			const tCoord = stepFraction * res.decelPhase.coordTime;
			const tProper = stepFraction * res.decelPhase.properTime;
			const tReverse = res.decelPhase.coordTime - tCoord;
			const v = (a * tReverse) / Math.sqrt(1 + ((a * tReverse) / C) ** 2);
			const mNow = massAfterAccel * Math.exp((-a * tProper) / vExhaust);
			addPoint(tBase + tCoord, v, mNow);
			m = mNow;
		}

		return { endCoord: tBase + res.decelPhase.coordTime, endMass: m };
	};

	// Outbound
	const leg1 = generateLeg(0, massAtStart);

	// Wait Time
	let currentT = leg1.endCoord;
	let currentM = leg1.endMass;
	if (roundTrip.value && res.waitTimeSeconds > 0) {
		currentT += res.waitTimeSeconds;
		addPoint(currentT, 0, currentM);
	}

	// Return
	if (roundTrip.value) {
		generateLeg(currentT, currentM);
	}

	if (chart) chart.destroy();
	if (fuelChart) fuelChart.destroy();

	const maxT = labels[labels.length - 1];
	let timeUnit = "s";
	let divisor = 1;
	if (maxT > 31557600) {
		timeUnit = "y";
		divisor = 31557600;
	} else if (maxT > 86400) {
		timeUnit = "d";
		divisor = 86400;
	} else if (maxT > 3600) {
		timeUnit = "h";
		divisor = 3600;
	}

	// Velocity Chart
	chart = new Chart(chartCanvas.value, {
		type: "line",
		data: {
			labels: labels,
			datasets: [
				{
					label: "Velocity (km/s)",
					data: vData,
					borderColor: "#38bdf8",
					backgroundColor: "rgba(56, 189, 248, 0.1)",
					fill: true,
					pointRadius: 0,
					borderWidth: 2,
					tension: 0.1,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: {
					type: "linear",
					display: true,
					title: {
						display: true,
						text: `Time (${timeUnit})`,
						color: "#94a3b8",
					},
					ticks: {
						color: "#64748b",
						callback: (val) => (val / divisor).toFixed(1),
					},
					grid: { color: "rgba(255,255,255,0.05)" },
				},
				y: {
					display: true,
					title: { display: true, text: "Velocity (km/s)", color: "#94a3b8" },
					ticks: { color: "#64748b" },
					grid: { color: "rgba(255,255,255,0.05)" },
				},
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) =>
							`Velocity: ${context.parsed.y.toLocaleString()} km/s`,
						title: (items) =>
							`Time: ${(items[0].parsed.x / divisor).toFixed(2)} ${timeUnit}`,
					},
				},
			},
		},
	});

	// Fuel Chart
	fuelChart = new Chart(fuelChartCanvas.value, {
		type: "line",
		data: {
			labels: labels,
			datasets: [
				{
					label: "Fuel Remaining (t)",
					data: fData,
					borderColor: "#f87171",
					backgroundColor: "rgba(248, 113, 113, 0.1)",
					fill: true,
					pointRadius: 0,
					borderWidth: 2,
					tension: 0.1,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: {
					type: "linear",
					display: true,
					title: {
						display: true,
						text: `Time (${timeUnit})`,
						color: "#94a3b8",
					},
					ticks: {
						color: "#64748b",
						callback: (val) => (val / divisor).toFixed(1),
					},
					grid: { color: "rgba(255,255,255,0.05)" },
				},
				y: {
					display: true,
					title: { display: true, text: "Fuel (t)", color: "#94a3b8" },
					ticks: { color: "#64748b" },
					grid: { color: "rgba(255,255,255,0.05)" },
					beginAtZero: true,
					max: fuelCapacity.value,
				},
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) => `Fuel: ${context.parsed.y.toLocaleString()} t`,
						title: (items) =>
							`Time: ${(items[0].parsed.x / divisor).toFixed(2)} ${timeUnit}`,
					},
				},
			},
		},
	});
};

watch(
	[
		distance,
		distanceUnit,
		acceleration,
		accelerationUnit,
		coastingTime,
		coastingTimeUnit,
		flipTime,
		efficiency,
		dryMass,
		fuelCapacity,
		cargoMass,
		waitTime,
		waitTimeUnit,
		autoCoast,
		roundTrip,
	],
	calculate,
);

onMounted(() => {
	calculate();
});
</script>

<template>
	<div class="max-w-6xl mx-auto p-4 md:p-8">
		<header class="mb-8 text-center">
			<h1
				class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500 mb-2"
			>
				Space Travel Calculator
			</h1>
			<p class="text-slate-400">Relativistic mission profile planner</p>
		</header>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<!-- Inputs -->
			<div
				class="lg:col-span-1 space-y-6 bg-slate-800/50 p-6 rounded-2xl border border-slate-700"
			>
				<div>
					<label
						class="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2"
					>
						<MoveRight class="w-4 h-4" /> Distance
					</label>
					<div class="flex gap-2">
						<input
							v-model.number="distance"
							type="number"
							class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 outline-none"
						/>
						<select
							v-model="distanceUnit"
							class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none"
						>
							<option v-for="(u, k) in UNITS.DISTANCE" :key="k" :value="k">
								{{ u.label }}
							</option>
						</select>
					</div>
				</div>

				<div>
					<label
						class="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2"
					>
						<Zap class="w-4 h-4" /> Acceleration
					</label>
					<div class="flex gap-2">
						<input
							v-model.number="acceleration"
							type="number"
							step="0.1"
							class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 outline-none"
						/>
						<select
							v-model="accelerationUnit"
							class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none"
						>
							<option v-for="(u, k) in UNITS.ACCELERATION" :key="k" :value="k">
								{{ u.label }}
							</option>
						</select>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="text-sm font-medium text-slate-400 mb-2"
							>Flip Time</label
						>
						<select
							v-model="flipTime"
							class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 w-full outline-none"
						>
							<option :value="10">Military (10s)</option>
							<option :value="120">Standard (2m)</option>
							<option :value="600">Long (10m)</option>
						</select>
					</div>
					<div>
						<label class="text-sm font-medium text-slate-400 mb-2"
							>Coasting Time</label
						>
						<div class="flex gap-2">
							<input
								v-model.number="coastingTime"
								type="number"
								:disabled="autoCoast"
								class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 w-full outline-none disabled:opacity-50"
							/>
							<select
								v-model="coastingTimeUnit"
								class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 outline-none text-xs"
							>
								<option v-for="(u, k) in UNITS.TIME" :key="k" :value="k">
									{{ u.label[0].toUpperCase() }}
								</option>
							</select>
						</div>
					</div>
				</div>

				<div>
					<label
						class="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2"
					>
						<Database class="w-4 h-4" /> Ship Specification
					</label>
					<div class="space-y-3">
						<div class="flex gap-2">
							<div class="w-1/2">
								<p class="text-[10px] text-slate-500 uppercase mb-1">
									Dry Mass (t)
								</p>
								<input
									v-model.number="dryMass"
									type="number"
									class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-full text-sm outline-none"
								/>
							</div>
							<div class="w-1/2">
								<p class="text-[10px] text-slate-500 uppercase mb-1">
									Fuel (t)
								</p>
								<input
									v-model.number="fuelCapacity"
									type="number"
									class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-full text-sm outline-none"
								/>
							</div>
						</div>
						<div class="flex gap-2">
							<div class="w-1/2">
								<p class="text-[10px] text-slate-500 uppercase mb-1">
									Cargo Mass (t)
								</p>
								<input
									v-model.number="cargoMass"
									type="number"
									class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-full text-sm outline-none"
								/>
							</div>
							<div class="w-1/2">
								<p class="text-[10px] text-slate-500 uppercase mb-1">
									Wait Time
								</p>
								<div class="flex gap-1">
									<input
										v-model.number="waitTime"
										type="number"
										:disabled="!roundTrip"
										class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-full text-sm outline-none disabled:opacity-30"
									/>
									<select
										v-model="waitTimeUnit"
										:disabled="!roundTrip"
										class="bg-slate-900 border border-slate-700 rounded-lg px-1 py-1 text-[10px] outline-none disabled:opacity-30"
									>
										<option v-for="(u, k) in UNITS.TIME" :key="k" :value="k">
											{{ u.label[0].toUpperCase() }}
										</option>
									</select>
								</div>
							</div>
						</div>
						<div class="flex flex-col gap-2">
							<div class="flex items-center gap-2">
								<input
									type="checkbox"
									v-model="autoCoast"
									id="autoCoast"
									class="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0"
								/>
								<label
									for="autoCoast"
									class="text-xs text-slate-400 cursor-pointer"
									>Auto-calculate coasting</label
								>
							</div>
							<div class="flex items-center gap-2">
								<input
									type="checkbox"
									v-model="roundTrip"
									id="roundTrip"
									class="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0"
								/>
								<label
									for="roundTrip"
									class="text-xs text-slate-400 cursor-pointer"
									>Round-trip (no refueling)</label
								>
							</div>
						</div>
					</div>
				</div>

				<div>
					<label
						class="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2"
					>
						<Gauge class="w-4 h-4" /> Engine Efficiency
					</label>
					<div class="space-y-2">
						<input
							v-model.number="efficiency"
							type="range"
							min="0.1"
							max="100"
							step="0.1"
							class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
						/>
						<div class="flex justify-between text-xs text-slate-500">
							<span>Fusion (10%)</span>
							<span class="text-blue-400 font-mono">{{ efficiency }}% c</span>
							<span>Photon (100%)</span>
						</div>
					</div>
				</div>

				<div>
					<label class="text-sm font-medium text-slate-400 mb-3"
						>Ship Presets</label
					>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="s in SHIP_PRESETS"
							:key="s.name"
							@click="setShipPreset(s)"
							class="text-xs bg-indigo-900/30 hover:bg-indigo-800/50 border border-indigo-500/30 px-2 py-1 rounded-md transition-colors text-indigo-200"
						>
							{{ s.name }}
						</button>
					</div>
				</div>

				<div>
					<label class="text-sm font-medium text-slate-400 mb-3"
						>Common Destinations</label
					>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="p in PRESETS"
							:key="p.name"
							@click="setPreset(p)"
							class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-md transition-colors"
						>
							{{ p.name }}
						</button>
					</div>
				</div>
			</div>

			<!-- Results -->
			<div class="lg:col-span-2 space-y-8">
				<div v-if="results" class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div
						class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col justify-between"
					>
						<div>
							<p class="text-slate-400 text-sm mb-1 flex items-center gap-2">
								<Clock class="w-4 h-4" />
								{{ roundTrip ? "Total Round-Trip" : "Outside Time" }}
							</p>
							<h2 class="text-3xl font-bold text-white">
								{{ formatDuration(results.totalCoordTime) }}
							</h2>
						</div>
						<p class="text-xs text-slate-500 mt-4">
							Time elapsed for a stationary observer at the destination.
						</p>
					</div>

					<div
						class="bg-blue-600/20 p-6 rounded-2xl border border-blue-500/30 flex flex-col justify-between"
					>
						<div>
							<p class="text-blue-400 text-sm mb-1 flex items-center gap-2">
								<Rocket class="w-4 h-4" />
								{{ roundTrip ? "Total Ship Time" : "Ship Time" }}
							</p>
							<h2 class="text-3xl font-bold text-blue-100">
								{{ formatDuration(results.totalProperTime) }}
							</h2>
						</div>
						<p class="text-xs text-blue-400/60 mt-4">
							Time elapsed for the crew due to time dilation.
						</p>
					</div>

					<div
						class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col justify-between"
						:class="{ 'border-red-500/50 bg-red-500/5': results.fuelWarning }"
					>
						<div>
							<p class="text-slate-400 text-sm mb-1 flex items-center gap-2">
								<Fuel
									class="w-4 h-4"
									:class="
										results.fuelWarning ? 'text-red-400' : 'text-slate-400'
									"
								/>
								Fuel Required
							</p>
							<h2
								class="text-3xl font-bold"
								:class="results.fuelWarning ? 'text-red-400' : 'text-white'"
							>
								{{
									results.fuelUsed.toLocaleString(undefined, {
										maximumFractionDigits: 1,
									})
								}}
								<span class="text-lg font-normal opacity-60">t</span>
							</h2>
						</div>
						<p
							class="text-xs mt-4"
							:class="
								results.fuelWarning ? 'text-red-400/80' : 'text-slate-500'
							"
						>
							{{
								results.fuelWarning
									? "WARNING: Exceeds fuel capacity!"
									: `Mass ratio: ${results.massRatio.toFixed(2)}:1`
							}}
						</p>
					</div>

					<div
						class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 col-span-1 md:col-span-2"
					>
						<div class="flex items-center justify-between mb-4">
							<p class="text-slate-400 text-sm flex items-center gap-2">
								<Gauge class="w-4 h-4" /> Max Velocity
							</p>
							<span
								class="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded"
							>
								γ = {{ results.maxGamma.toFixed(4) }}
							</span>
						</div>
						<div class="flex items-baseline gap-4">
							<h2 class="text-3xl font-bold text-white">
								{{ (results.maxSpeed / 1000).toLocaleString() }}
								<span class="text-lg font-normal text-slate-400">km/s</span>
							</h2>
							<h3 class="text-xl text-indigo-400">
								{{ results.maxSpeedPct.toFixed(2) }}%
								<span class="text-sm font-normal text-slate-500 italic">c</span>
							</h3>
						</div>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div
						class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 h-64"
					>
						<div class="text-xs text-slate-500 mb-2 uppercase tracking-tighter">
							Velocity Profile
						</div>
						<canvas ref="chartCanvas"></canvas>
					</div>
					<div
						class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 h-64"
					>
						<div class="text-xs text-slate-500 mb-2 uppercase tracking-tighter">
							Fuel Consumption
						</div>
						<canvas ref="fuelChartCanvas"></canvas>
					</div>
				</div>

				<div
					v-if="results"
					class="bg-slate-800/20 p-6 rounded-2xl border border-slate-800"
				>
					<h4
						class="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider"
					>
						Mission Phases
					</h4>
					<div class="space-y-3">
						<div class="flex justify-between text-sm">
							<span class="text-slate-500">Acceleration</span>
							<span class="text-slate-300"
								>{{ formatDistance(results.accelPhase.distance) }} ({{
									formatDuration(results.accelPhase.coordTime)
								}})</span
							>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-slate-500">Flip Maneuver</span>
							<span class="text-slate-300"
								>{{ formatDistance(results.flipPhase.distance) }} ({{
									formatDuration(results.flipPhase.coordTime)
								}})</span
							>
						</div>
						<div
							v-if="results.coastPhase.distance > 0"
							class="flex justify-between text-sm"
						>
							<span class="text-slate-500">Coasting</span>
							<span class="text-slate-300"
								>{{ formatDistance(results.coastPhase.distance) }} ({{
									formatDuration(results.coastPhase.coordTime)
								}})</span
							>
						</div>
						<div
							class="flex justify-between text-sm border-t border-slate-800 pt-3"
						>
							<span class="text-slate-400 font-medium">Total Distance</span>
							<span class="text-slate-200">{{
								formatDistance(results.totalDistance)
							}}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<footer class="mt-12 text-center text-slate-600 text-xs">
			<p>
				Calculated using constant proper acceleration and special relativity.
			</p>
		</footer>
	</div>
</template>

<style>
body {
	margin: 0;
	font-family:
		-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
		sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}
</style>
