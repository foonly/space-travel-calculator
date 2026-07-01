# Space Travel Calculator

A relativistic mission profile planner for sci-fi settings.

## Features

- **Relativistic Physics:** Uses constant proper acceleration formulas to account for time dilation and the light-speed limit.
- **Mission Profiles:** Supports acceleration, coasting, and deceleration phases with a distance-covering flip maneuver.
- **Ship Specifications:** Define custom ships with dry mass, fuel capacity, and engine efficiency (% of _c_).
- **Auto-Coast Solver:** Automatically calculates the necessary coasting phase when fuel is insufficient for a full-burn mission.
- **Fuel Monitoring:** Real-time tracking of fuel consumption and mass ratios ($m_0/m_1$).
- **Ship Presets:** Includes templates for Interceptors, Freighters, Torchships, and Relativistic Probes.
- **Visualizations:** Interactive velocity-over-time graph showing all mission phases.
- **Presets:** Quick selection for solar system and interstellar targets.

## Physics & Math

The calculator uses constant proper acceleration formulas from special relativity:

- **Distance:** $d = \frac{c^2}{a} (\cosh(\frac{a\tau}{c}) - 1)$
- **Coordinate Time:** $t = \frac{c}{a} \sinh(\frac{a\tau}{c})$
- **Velocity:** $v = c \tanh(\frac{a\tau}{c})$
- **Relativistic Rocket Equation:** $\Delta v = v_e \ln(\frac{m_0}{m_1})$ (where $v_e$ is exhaust velocity)

## Development

```bash
npm install
npm run dev
```
