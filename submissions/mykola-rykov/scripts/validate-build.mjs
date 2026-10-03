import { validateBuild } from './build-validation.mjs';

const count = await validateBuild('dist');
console.log(`Static entry verified: ${count} bundled local assets.`);
