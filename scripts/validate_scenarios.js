const ScenarioService = require('../backend/services/scenario-service');

console.log('--- Pax Historia Scenario Validator ---');

try {
    // ScenarioService validates manifests, asset containment, map/nation/city
    // integrity, renderer availability, and starting unit definitions while it
    // loads. Keeping the validator on the same code path prevents a scenario
    // that passes CI from failing only when a game is started.
    const scenarios = new ScenarioService();
    const catalog = scenarios.listScenarios();

    catalog.forEach(scenario => {
        console.log(`✓ ${scenario.id}@${scenario.version}: ${scenario.name} (${scenario.startDates.length} start dates)`);
    });
    console.log(`✅ SCENARIO VALIDATION PASSED (${catalog.length} scenario${catalog.length === 1 ? '' : 's'})`);
} catch (error) {
    console.error(`❌ SCENARIO VALIDATION FAILED: ${error.message}`);
    process.exitCode = 1;
}
