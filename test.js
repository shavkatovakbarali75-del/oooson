const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
const hasStatsTab = content.includes('function StatsTab');
console.log("StatsTab found:", hasStatsTab);
