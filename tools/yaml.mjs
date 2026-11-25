// Use Career-Ops' copy of js-yaml so ting_job_search needs no extra install for it.
import { createRequire } from 'node:module';
import path from 'node:path';
import { CAREER_OPS } from './lib.mjs';
const require = createRequire(path.join(CAREER_OPS, 'package.json'));
const yaml = require('js-yaml');
export const dump = (o) => yaml.dump(o, { lineWidth: 200, noRefs: true });
export const load = yaml.load;
