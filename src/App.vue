<script setup>
import { ref, watch, onMounted } from "vue";
import {
	planMission,
	missionProfile,
	UNITS,
	formatDuration,
	formatDistance,
	C,
} from "./logic/physics";
import { isValid, requiredNumber, optionalNumber } from "./logic/inputs";
import { PRESETS, SHIP_PRESETS } from "./logic/presets";
import {
	Rocket,
	Clock,
	Gauge,
	MoveRight,
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
const ignoreFuelMass = ref(false);

const results = ref(null);
const errorMessage = ref("");
const chartCanvas = ref(null);
const fuelChartCanvas = ref(null);
const thrustChartCanvas = ref(null);
let chart = null;
let fuelChart = null;
let thrustChart = null;

const destroyCharts = () => {
	chart?.destroy();
	fuelChart?.destroy();
	thrustChart?.destroy();
	chart = null;
	fuelChart = null;
	thrustChart = null;
};

const clearResults = (message) => {
	results.value = null;
	errorMessage.value = message;
	destroyCharts();
};

// Show an auto-calculated coasting time in the largest unit it exceeds
const showCoastingTime = (seconds) => {
	const unit =
		["Y", "D", "H", "M"].find((k) => seconds > UNITS.TIME[k].factor) ?? "S";
	coastingTimeUnit.value = unit;
	coastingTime.value = seconds / UNITS.TIME[unit].factor;
};

const calculate = () => {
	const d = requiredNumber(distance.value);
	const a = requiredNumber(acceleration.value);
	const eff = requiredNumber(efficiency.value);
	const mDry = requiredNumber(dryMass.value);
	const mCargo = optionalNumber(cargoMass.value);
	const fuel = optionalNumber(fuelCapacity.value);
	const tCoast = optionalNumber(coastingTime.value);
	const tWait = optionalNumber(waitTime.value);
	const tFlip = optionalNumber(flipTime.value);

	// Written as positive checks so NaN fails them
	if (
		!(d >= 0) ||
		!(a > 0) ||
		!(eff > 0) ||
		!(mDry > 0) ||
		!(mCargo >= 0) ||
		!(fuel >= 0) ||
		!(tCoast >= 0) ||
		!(tWait >= 0) ||
		!(tFlip >= 0)
	) {
		clearResults(
			"Enter valid values: acceleration, efficiency and dry mass must be greater than zero, and nothing can be negative.",
		);
		return;
	}

	const params = {
		distance: d * UNITS.DISTANCE[distanceUnit.value].factor,
		acceleration: a * UNITS.ACCELERATION[accelerationUnit.value].factor,
		exhaustVelocity: (eff / 100) * C,
		dryMass: mDry + mCargo,
		fuelCapacity: fuel,
		coastTime: tCoast * UNITS.TIME[coastingTimeUnit.value].factor,
		flipTime: tFlip,
		waitTime: tWait * UNITS.TIME[waitTimeUnit.value].factor,
		autoCoast: autoCoast.value,
		roundTrip: roundTrip.value,
		ignoreFuelMass: ignoreFuelMass.value,
	};

	try {
		const res = planMission(params);
		if (!res) {
			clearResults(
				"Not enough fuel to accelerate. Add fuel or turn off auto-coasting.",
			);
			return;
		}

		if (autoCoast.value) {
			if (res.coastPhase.coordTime > 0)
				showCoastingTime(res.coastPhase.coordTime);
			else coastingTime.value = 0;
		}

		errorMessage.value = "";
		results.value = res;
		updateCharts(missionProfile(res, params), fuel);
	} catch (e) {
		console.error(e);
	}
};

const setPreset = (preset) => {
	distance.value = preset.distance;
	distanceUnit.value = preset.unit;
};

const setShipPreset = (ship) => {
	efficiency.value = ship.efficiency;
	dryMass.value = ship.dryMass;
	fuelCapacity.value = ship.fuelCapacity;
	acceleration.value = ship.accel;
	accelerationUnit.value = "G";
	flipTime.value = ship.flip;
	autoCoast.value = true;
};

const formatValue = (n) =>
	n.toLocaleString(undefined, { maximumSignificantDigits: 3 });

const makeLineChart = (
	canvas,
	{ label, unit, color, fill, data },
	time,
	timeAxis,
	yOptions = {},
) =>
	new Chart(canvas, {
		type: "line",
		data: {
			labels: time,
			datasets: [
				{
					label: `${label} (${unit})`,
					data,
					borderColor: color,
					backgroundColor: fill,
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
						text: `Time (${timeAxis.unit})`,
						color: "#94a3b8",
					},
					ticks: {
						color: "#64748b",
						callback: (val) => (val / timeAxis.divisor).toFixed(1),
					},
					grid: { color: "rgba(255,255,255,0.05)" },
				},
				y: {
					display: true,
					title: {
						display: true,
						text: `${label} (${unit})`,
						color: "#94a3b8",
					},
					ticks: { color: "#64748b" },
					grid: { color: "rgba(255,255,255,0.05)" },
					...yOptions,
				},
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (context) =>
							`${label}: ${formatValue(context.parsed.y)} ${unit}`,
						title: (items) =>
							`Time: ${(items[0].parsed.x / timeAxis.divisor).toFixed(2)} ${timeAxis.unit}`,
					},
				},
			},
		},
	});

const updateCharts = (profile, fuel) => {
	if (!chartCanvas.value || !fuelChartCanvas.value || !thrustChartCanvas.value)
		return;

	destroyCharts();

	const maxT = profile.time[profile.time.length - 1];
	const timeAxis =
		maxT > UNITS.TIME.Y.factor
			? { unit: "y", divisor: UNITS.TIME.Y.factor }
			: maxT > UNITS.TIME.D.factor
				? { unit: "d", divisor: UNITS.TIME.D.factor }
				: maxT > UNITS.TIME.H.factor
					? { unit: "h", divisor: UNITS.TIME.H.factor }
					: { unit: "s", divisor: 1 };

	chart = makeLineChart(
		chartCanvas.value,
		{
			label: "Velocity",
			unit: "km/s",
			color: "#38bdf8",
			fill: "rgba(56, 189, 248, 0.1)",
			data: profile.velocity,
		},
		profile.time,
		timeAxis,
	);
	fuelChart = makeLineChart(
		fuelChartCanvas.value,
		{
			label: "Fuel",
			unit: "t",
			color: "#f87171",
			fill: "rgba(248, 113, 113, 0.1)",
			data: profile.fuel,
		},
		profile.time,
		timeAxis,
		{ beginAtZero: true, max: fuel },
	);
	thrustChart = makeLineChart(
		thrustChartCanvas.value,
		{
			label: "Thrust",
			unit: "MN",
			color: "#fbbf24",
			fill: "rgba(251, 191, 36, 0.1)",
			data: profile.thrust,
		},
		profile.time,
		timeAxis,
		{ beginAtZero: true },
	);
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
		ignoreFuelMass,
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
							<div class="flex items-center gap-2">
								<input
									type="checkbox"
									v-model="ignoreFuelMass"
									id="ignoreFuelMass"
									class="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0"
								/>
								<label
									for="ignoreFuelMass"
									class="text-xs text-slate-400 cursor-pointer"
									>Exclude fuel mass from inertia</label
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
								{{
									isValid(results.totalCoordTime)
										? formatDuration(results.totalCoordTime)
										: "-"
								}}
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
								{{
									isValid(results.totalProperTime)
										? formatDuration(results.totalProperTime)
										: "-"
								}}
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
									isValid(results.fuelUsed)
										? results.fuelUsed.toLocaleString(undefined, {
												maximumSignificantDigits: 3,
											})
										: "-"
								}}
								<span
									v-if="isValid(results.fuelUsed)"
									class="text-lg font-normal opacity-60"
									>t</span
								>
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
									: isValid(results.massRatio)
										? `Mass ratio: ${results.massRatio.toFixed(2)}:1`
										: ""
							}}
						</p>
					</div>

					<div
						class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col justify-between"
					>
						<div>
							<p class="text-slate-400 text-sm mb-1 flex items-center gap-2">
								<Fuel class="w-4 h-4 text-emerald-400" />
								Fuel Remaining
							</p>
							<h2 class="text-3xl font-bold text-white">
								{{
									isValid(results.fuelRemaining)
										? results.fuelRemaining.toLocaleString(undefined, {
												maximumSignificantDigits: 3,
											})
										: "-"
								}}
								<span
									v-if="isValid(results.fuelRemaining)"
									class="text-lg font-normal opacity-60"
									>t</span
								>
							</h2>
						</div>
						<p class="text-xs text-slate-500 mt-4">
							Propellant remaining in the tanks after the mission.
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
								γ =
								{{
									isValid(results.maxGamma) ? results.maxGamma.toFixed(4) : "-"
								}}
							</span>
						</div>
						<div class="flex items-baseline gap-4">
							<h2 class="text-3xl font-bold text-white">
								{{
									isValid(results.maxSpeed)
										? (results.maxSpeed / 1000).toLocaleString(undefined, {
												maximumSignificantDigits: 3,
											})
										: "-"
								}}
								<span
									v-if="isValid(results.maxSpeed)"
									class="text-lg font-normal text-slate-400"
									>km/s</span
								>
							</h2>
							<h3
								v-if="isValid(results.maxSpeedPct)"
								class="text-xl text-indigo-400"
							>
								{{ results.maxSpeedPct.toFixed(2) }}%
								<span class="text-sm font-normal text-slate-500 italic">c</span>
							</h3>
						</div>
					</div>
				</div>

				<div
					v-else-if="errorMessage"
					class="bg-red-500/5 p-6 rounded-2xl border border-red-500/50 text-sm text-red-400"
				>
					{{ errorMessage }}
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
					<div
						class="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 h-64"
					>
						<div class="text-xs text-slate-500 mb-2 uppercase tracking-tighter">
							Engine Thrust
						</div>
						<canvas ref="thrustChartCanvas"></canvas>
					</div>
				</div>

				<div
					v-if="results"
					class="bg-slate-800/20 p-6 rounded-2xl border border-slate-800"
				>
					<h4
						class="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider"
					>
						Mission Phases{{ roundTrip ? " (per leg)" : "" }}
					</h4>
					<div class="space-y-3">
						<div class="flex justify-between text-sm">
							<span class="text-slate-500">Acceleration</span>
							<span class="text-slate-300"
								>{{
									isValid(results.accelPhase.distance)
										? formatDistance(results.accelPhase.distance)
										: "-"
								}}
								({{
									isValid(results.accelPhase.coordTime)
										? formatDuration(results.accelPhase.coordTime)
										: "-"
								}})</span
							>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-slate-500">Flip Maneuver</span>
							<span class="text-slate-300"
								>{{
									isValid(results.flipPhase.distance)
										? formatDistance(results.flipPhase.distance)
										: "-"
								}}
								({{
									isValid(results.flipPhase.coordTime)
										? formatDuration(results.flipPhase.coordTime)
										: "-"
								}})</span
							>
						</div>
						<div
							v-if="results.coastPhase.distance > 0"
							class="flex justify-between text-sm"
						>
							<span class="text-slate-500">Coasting</span>
							<span class="text-slate-300"
								>{{
									isValid(results.coastPhase.distance)
										? formatDistance(results.coastPhase.distance)
										: "-"
								}}
								({{
									isValid(results.coastPhase.coordTime)
										? formatDuration(results.coastPhase.coordTime)
										: "-"
								}})</span
							>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-slate-500">Deceleration</span>
							<span class="text-slate-300"
								>{{
									isValid(results.decelPhase.distance)
										? formatDistance(results.decelPhase.distance)
										: "-"
								}}
								({{
									isValid(results.decelPhase.coordTime)
										? formatDuration(results.decelPhase.coordTime)
										: "-"
								}})</span
							>
						</div>
						<div
							class="flex justify-between text-sm border-t border-slate-800 pt-3"
						>
							<span class="text-slate-400 font-medium">{{
								roundTrip ? "Total Distance (round trip)" : "Total Distance"
							}}</span>
							<span class="text-slate-200">{{
								isValid(results.totalDistance)
									? formatDistance(results.totalDistance)
									: "-"
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
