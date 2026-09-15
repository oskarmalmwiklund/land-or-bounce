import { migrateScience } from '../src/server/science-db';

await migrateScience();
console.log('Science database schema is ready.');
