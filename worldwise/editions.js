import {generateGame as generateV1} from './editions/v1-engine.js';

// Published editions are immutable. Append a new entry when changing data or
// generation rules. Its dailyFrom must be a future UTC date at deployment time,
// so a daily that people have already started never changes underneath them.
export const EDITIONS = [{id: '1', dailyFrom: '2026-11-01', dataPath: 'editions/v1.json', generateGame: generateV1}];
export const CURRENT_EDITION = EDITIONS.at(-1);
export const findEdition = id => EDITIONS.find(e => e.id === id);
export const dailyEdition = (date, editions = EDITIONS) => [...editions].reverse().find(e => e.dailyFrom <= date);
