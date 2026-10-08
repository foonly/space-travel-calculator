# Changelog

### 1.3.1 (2026-10-08)

#### Bug Fixes

- ui: improve labels, charts, favicon and destination presets (277cf26)
- app: validate number inputs and correct fuel and round-trip results (413020c)

#### Refactor

- app: move mission physics into physics.js and add tests (f977ff5)

#### Build System

- deps: upgrade to Tailwind CSS 4 (612ca69)
- deps: upgrade Vite, Vitest and switch to @lucide/vue (45e0b75)

#### Continuous Integration

- github: update actions and Node, serialize releases (84a0e3f)
- github: run tests before releasing (47932d1)

## v1.3.0 (2026-07-02)

#### Features

- app: add engine thrust chart and improve number formatting (2bbb46d)

### v1.2.1 (2026-07-01)

#### Styles

- ui: update result grid layout to two columns (98a1e15)

## v1.2.0 (2026-07-01)

#### Features

- ship: add new ship presets and fix coasting calculation bug (2f2a7b9)
- calculator: add fuel mass exclusion option and update UI/presets (b985ce9)
- app: add cargo mass and wait time parameters (a531f07)
- app: add round-trip support and fuel consumption chart (2511c92)

### v1.1.1 (2026-07-01)

#### Continuous Integration

- github: add build step and update deployment path (1ceea0c)

## v1.1.0 (2026-07-01)

#### Features

- app: initialize relativistic travel calculator (a938b12)

#### Refactor

- main: rename main.js to main.ts (073f194)

#### Continuous Integration

- github: add automated release and deployment workflow (c5cdf89)

