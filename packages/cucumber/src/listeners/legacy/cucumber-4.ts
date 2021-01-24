import { cucumberEventProtocolAdapter } from './CucumberEventProtocolAdapter';
import { Dependencies } from './Dependencies';

export = function (dependencies: Dependencies) {
    const { BeforeAll, After, AfterAll } = dependencies.cucumber;

    BeforeAll(function () {
        dependencies.notifier.testRunStarts();
    });

    After(function () {
        dependencies.notifier.currentScenarioFinishes();

        return dependencies.serenity.waitForNextCue();
    });

    AfterAll(function () {
        dependencies.notifier.testRunFinishes();

        return dependencies.serenity.waitForNextCue()
            .then(() => {
                dependencies.notifier.testRunFinished();
            });
    });

    return cucumberEventProtocolAdapter(dependencies);
};