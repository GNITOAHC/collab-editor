import { writeFile } from 'fs/promises';
import { join } from 'path';

const OUT = join(import.meta.dir, '../packages/backend/src/frontend-assets.ts');

const STUB = `// Auto-generated stub — do not edit. Assets are embedded only during \`bun run build:binary\`.
export const assets: Map<string, { data: Buffer; mime: string }> = new Map();
`;

await writeFile(OUT, STUB, 'utf-8');
console.log('[reset-assets] Restored frontend-assets.ts stub.');
