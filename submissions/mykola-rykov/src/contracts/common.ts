import { z } from 'zod';

export const finite = z.number().finite();
export const positive = finite.positive();
export const nonnegative = finite.nonnegative();
export const fraction = finite.min(0).max(1);
export const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const text = z.string().trim().min(1);
export const degrees = finite.min(0).lt(360);
export const coordinateSchema = z.strictObject({
  latitudeDeg: finite.min(-90).max(90),
  longitudeDeg: finite.min(-180).max(180),
});
export const verticalDatumSchema = z.strictObject({ id: text, description: text });
export const altitudeSchema = z.strictObject({
  metres: finite,
  datumId: text,
  reference: z.enum(['datum', 'above-dsm']),
});
export const attitudeSchema = z.strictObject({
  headingDeg: degrees,
  pitchDeg: finite.min(-90).max(90),
  rollDeg: finite.min(-180).max(180),
});
export const modelIdentitySchema = z.strictObject({ id: identifier, version: text });

// Relative package paths only. The loader will additionally enforce resolved-path containment.
export const assetSchema = z.strictObject({
  path: z.string().regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/).refine(
    (value) => !value.split('/').some((part) => part === '..' || part === '.' || part === ''),
    'Use a package-relative path without traversal or empty components.',
  ),
  bytes: nonnegative.int(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export function parseContract<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || name}: ${issue.message}`);
    throw new Error(`Invalid ${name}. ${issues.join('; ')}`);
  }
  return result.data;
}
