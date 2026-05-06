import { HttpError } from "./http.ts";

export function requiredText(value: unknown, field: string, maxLength = 100) {
  if (typeof value !== "string") {
    throw new HttpError(`${field} is required`, 400);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new HttpError(`${field} is required`, 400);
  }

  if (trimmed.length > maxLength) {
    throw new HttpError(`${field} is too long`, 400);
  }

  return trimmed;
}

export function optionalText(value: unknown, field: string, maxLength = 100) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requiredText(value, field, maxLength);
}

export function requiredPositiveInteger(value: unknown, field: string) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new HttpError(`${field} must be a positive integer`, 400);
  }

  return numberValue;
}

export function optionalIsoDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(`${field} must be an ISO date string`, 400);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(`${field} must be a valid ISO date string`, 400);
  }

  return date;
}

export function requiredIsoDate(value: unknown, field: string) {
  const date = optionalIsoDate(value, field);

  if (!date) {
    throw new HttpError(`${field} is required`, 400);
  }

  return date;
}
