export const PRESETS = [
	{ name: "Moon", distance: 384400, unit: "KM" },
	{ name: "Mars (Closest)", distance: 0.37, unit: "AU" },
	{ name: "Mars (Avg)", distance: 1.52, unit: "AU" },
	{ name: "Ceres", distance: 2.77, unit: "AU" },
	{ name: "Jupiter (Avg)", distance: 5.2, unit: "AU" },
	{ name: "Saturn (Avg)", distance: 9.54, unit: "AU" },
	{ name: "Neptune (Avg)", distance: 30.07, unit: "AU" },
	{ name: "Pluto (Avg)", distance: 39.48, unit: "AU" },
	{ name: "Voyager 1 (Current)", distance: 163, unit: "AU" },
	{ name: "Alpha Centauri", distance: 4.37, unit: "LY" },
	{ name: "Galactic Center", distance: 26000, unit: "LY" },
	{ name: "Andromeda Galaxy", distance: 2.537e6, unit: "LY" },
];

export const SHIP_PRESETS = [
	{
		name: "Interceptor",
		efficiency: 5,
		dryMass: 150,
		fuelCapacity: 300,
		accel: 5,
		flip: 10,
	},
	{
		name: "Freighter",
		efficiency: 12,
		dryMass: 5000,
		fuelCapacity: 2000,
		accel: 0.3,
		flip: 600,
	},
	{
		name: "Torchship",
		efficiency: 25,
		dryMass: 800,
		fuelCapacity: 4000,
		accel: 1.5,
		flip: 120,
	},
	{
		name: "Relativistic Probe",
		efficiency: 95,
		dryMass: 10,
		fuelCapacity: 100,
		accel: 10,
		flip: 120,
	},
];
