// Installs loader.mjs. Used via `node --import ./scripts/rag_test/register.mjs`.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./loader.mjs', pathToFileURL(import.meta.filename));
