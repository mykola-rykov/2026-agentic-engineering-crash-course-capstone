import { z } from 'zod';
import { assetSchema, coordinateSchema, identifier, nonnegative, parseContract, positive, text, verticalDatumSchema } from './common';

const boundsSchema = z.strictObject({
  westDeg: z.number().finite().min(-180).max(180),
  eastDeg: z.number().finite().min(-180).max(180),
  southDeg: z.number().finite().min(-90).max(90),
  northDeg: z.number().finite().min(-90).max(90),
  crossesAntimeridian: z.boolean(),
}).refine((b) => b.southDeg < b.northDeg && (b.crossesAntimeridian ? b.westDeg > b.eastDeg : b.westDeg < b.eastDeg),
  'Bounds must have positive area and an explicit antimeridian convention.');
const projectedBoundsSchema = z.strictObject({
  minXM: z.number().finite(), maxXM: z.number().finite(),
  minYM: z.number().finite(), maxYM: z.number().finite(),
}).refine((b) => b.minXM < b.maxXM && b.minYM < b.maxYM, 'Projected bounds must have positive area.');
const sourceSchema = z.strictObject({
  id: identifier, dataset: text, release: text, sourceUrl: z.url(),
  nominalResolutionM: positive, verticalDatum: verticalDatumSchema,
  verticalAccuracyM: nonnegative.nullable(), accuracyDescription: text,
  attribution: text, licenseUrl: z.url(), isFallback: z.boolean(),
});
const tileSchema = z.strictObject({
  column: nonnegative.int(), row: nonnegative.int(),
  display: assetSchema, obstruction: assetSchema, validity: assetSchema,
  sourceIds: z.array(identifier).min(1),
});
const levelSchema = z.strictObject({
  level: nonnegative.int(), cellSizeM: positive,
  columns: positive.int(), rows: positive.int(),
  tiles: z.array(tileSchema).min(1),
});

export const terrainManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), id: identifier, packageVersion: text, name: text,
  center: coordinateSchema, bounds: boundsSchema, projectedBounds: projectedBoundsSchema,
  projection: z.strictObject({ definition: text, horizontalDatum: z.literal('WGS84'), units: z.literal('metres') }),
  verticalDatum: verticalDatumSchema,
  encoding: z.strictObject({
    elevation: z.literal('int16'), byteOrder: z.literal('little-endian'),
    elevationUnitM: z.literal(1), tileCells: z.literal(256),
    displayResampling: z.literal('average'), obstructionResampling: z.literal('maximum'),
    validity: z.literal('uint8-0-unknown-1-source-2-confirmed-ocean'),
  }),
  sources: z.array(sourceSchema).min(1),
  oceanMask: z.strictObject({ source: text, version: text, method: text, coastalUncertaintyM: nonnegative }),
  levels: z.array(levelSchema).min(1),
  contextAssets: z.array(assetSchema),
  uncompressedBytes: nonnegative.int().lt(500_000_000),
  attribution: z.array(text).min(1),
}).superRefine((manifest, ctx) => {
  const sourceIds = new Set(manifest.sources.map((s) => s.id));
  if (sourceIds.size !== manifest.sources.length) ctx.addIssue({ code: 'custom', message: 'Source ids must be unique.', path: ['sources'] });
  const paths = new Set<string>();
  let bytes = 0;
  const assets = manifest.levels.flatMap((level) => level.tiles.flatMap((tile) => [tile.display, tile.obstruction, tile.validity])).concat(manifest.contextAssets);
  for (const asset of assets) {
    if (paths.has(asset.path)) ctx.addIssue({ code: 'custom', message: `Duplicate asset path: ${asset.path}`, path: ['levels'] });
    paths.add(asset.path);
    bytes += asset.bytes;
  }
  if (bytes > manifest.uncompressedBytes) ctx.addIssue({ code: 'custom', message: 'Total package size cannot be smaller than indexed assets.', path: ['uncompressedBytes'] });
  manifest.levels.forEach((level, index) => {
    const first = manifest.levels[0];
    if (level.level !== index || (first && level.cellSizeM !== first.cellSizeM * 2 ** index)) {
      ctx.addIssue({ code: 'custom', message: 'Levels must start at zero with doubled cell spacing.', path: ['levels', index] });
    }
    const locations = new Set<string>();
    level.tiles.forEach((tile, tileIndex) => {
      const path = ['levels', index, 'tiles', tileIndex];
      const key = `${tile.column}:${tile.row}`;
      if (tile.column >= level.columns || tile.row >= level.rows || locations.has(key)) ctx.addIssue({ code: 'custom', message: 'Invalid or duplicate tile location.', path });
      locations.add(key);
      if (tile.display.bytes !== 256 * 256 * 2 || tile.obstruction.bytes !== 256 * 256 * 2 || tile.validity.bytes !== 256 * 256) ctx.addIssue({ code: 'custom', message: 'Tile byte counts must match the declared fixed encoding.', path });
      if (tile.sourceIds.some((id) => !sourceIds.has(id))) ctx.addIssue({ code: 'custom', message: 'Tile references an unknown source.', path });
    });
  });
});

export type TerrainPackageManifest = z.infer<typeof terrainManifestSchema>;
export function parseTerrainManifest(value: unknown): TerrainPackageManifest {
  return parseContract(terrainManifestSchema, value, 'terrain manifest');
}
