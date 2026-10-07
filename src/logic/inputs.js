export const isValid = (val) =>
	val !== null && val !== undefined && !isNaN(val) && val !== "";

// v-model.number yields "" for an empty field, which would turn `+` into string concatenation
export const requiredNumber = (val) => (isValid(val) ? Number(val) : NaN);
export const optionalNumber = (val) => (isValid(val) ? Number(val) : 0);
