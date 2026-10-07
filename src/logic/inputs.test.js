import { describe, it, expect } from "vitest";
import { requiredNumber, optionalNumber } from "./inputs";

// v-model.number passes "" through for an empty field
describe("number inputs", () => {
	it("treats an empty optional field as zero so sums stay numeric", () => {
		expect(optionalNumber("")).toBe(0);
		expect(1000 + optionalNumber("")).toBe(1000);
	});

	it("rejects an empty required field", () => {
		expect(requiredNumber("")).toBeNaN();
		expect(requiredNumber(null)).toBeNaN();
	});

	it("passes numbers through", () => {
		expect(requiredNumber(2.5)).toBe(2.5);
		expect(optionalNumber(-3)).toBe(-3);
	});
});
