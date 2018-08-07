import { JSONObject, match } from 'tiny-types';

import {
    ActivityDetails,
    BrowserTag,
    CapabilityTag,
    ContextTag,
    Description,
    ExecutionCompromised,
    ExecutionFailedWithAssertionError,
    ExecutionFailedWithError,
    ExecutionIgnored,
    ExecutionSkipped,
    FeatureTag,
    ImplementationPending,
    IssueTag,
    ManualTag,
    Name,
    Outcome,
    ScenarioDetails,
    Tag,
    ThemeTag,
    Timestamp,
} from '../../../model';
import { ErrorParser } from './ErrorParser';
import { IDGenerator } from './IDGenerator';
import { ErrorDetails, SerenityBDDReport, TestStep } from './SerenityBDDJsonSchema';

export class ScenarioReport {
    private static errorParser = new ErrorParser();
    private static idGenerator = new IDGenerator();

    private readonly report: Partial<SerenityBDDReport> & { children?: Array<Partial<TestStep>> };
    private readonly activities = new Stack<Partial<TestStep>>();

    constructor(public readonly scenarioDetails: ScenarioDetails) {

        this.report = {
            name:   this.scenarioDetails.name.value,
            title:  this.scenarioDetails.name.value,
            id:     ScenarioReport.idGenerator.generateFrom(this.scenarioDetails.category, this.scenarioDetails.name),
            manual: false,
            testSteps: [],
            get children() {
                // fake reference to make the report and the test step interfaces compatible
                // removed in 'toJSON'
                return this.testSteps;
            },
            userStory: {
                id:         ScenarioReport.idGenerator.generateFrom(this.scenarioDetails.category),
                storyName:  this.scenarioDetails.category.value,
                path:       this.scenarioDetails.location.path.value,
                type:       'feature',
            },
        };

        this.activities.push(this.report);
    }

    sceneStartedAt(time: Timestamp): ScenarioReport {
        return this.withMutated(report => {
            report.startTime = time.toMillisecondTimestamp();
        });
    }

    executedBy(testRunner: Name): ScenarioReport {
        return this.withMutated(report => {
            report.testSource = testRunner.value;
        });
    }

    sceneTaggedWith(tag: Tag) {
        return this.withMutated(report => {
            const nameOfRecorded = (typeOfTag: { Type: string }) => (report.tags.find(t => t.type === typeOfTag.Type) || { name: void 0 }).name;
            const concatenated = (...names: string[]): string => names.filter(name => !! name).join('/');

            const serialisedTag = tag.toJSON();

            if (! report.tags) {
                report.tags = [];
            }

            match<Tag, void>(tag)
                .when(ManualTag,     _ => report.manual = true)
                .when(CapabilityTag, _ => serialisedTag.name = concatenated(nameOfRecorded(ThemeTag), tag.name))
                .when(FeatureTag,    _ => {
                    serialisedTag.name = concatenated(nameOfRecorded(CapabilityTag), tag.name);
                    report.featureTag = tag.toJSON();
                })
                .when(IssueTag,      _ => (report.issues    = report.issues   || []).push(tag.name))
                .when(BrowserTag,    _ => (report.context   = report.context  || tag.name))
                .when(ContextTag,    _ => (report.context   = tag.name))
                .else(_ => void 0);

            report.tags.push(serialisedTag);
        });
    }

    sceneFinishedAt(time: Timestamp): ScenarioReport {
        return this.withMutated(report => {
            report.duration = Timestamp.fromMillisecondTimestamp(report.startTime).diff(time).milliseconds;
        });
    }

    activityStarted(activity: ActivityDetails, time: Timestamp) {
        return this.withMutated(report => {
            const activityReport: Partial<TestStep> = {
                description: activity.name.value,
                startTime: time.toMillisecondTimestamp(),
                children: [],
                screenshots: [],
            };

            this.activities.last().children.push(activityReport as any);
            this.activities.push(activityReport);
        });
    }

    activityFinished(value: ActivityDetails, outcome: Outcome, time: Timestamp) {
        return this.withMutated(report => this.mapOutcome(outcome, (result: string, error?: ErrorDetails) => {

            const activityReport = this.activities.pop();

            activityReport.result    = result;
            activityReport.exception = error;
            activityReport.duration  = Timestamp.fromMillisecondTimestamp(activityReport.startTime).diff(time).milliseconds;
        }));
    }

    backgroundDetected(name: Name, description: Description) {
        return this.withMutated(report => {
            report.backgroundTitle       = name.value;
            report.backgroundDescription = description.value;
        });
    }

    descriptionDetected(description: Description) {
        return this.withMutated(report => {
            report.description = description.value;
        });
    }

    photoTaken(name: Name) {
        return this.withMutated(report => {
            this.activities.mostRecentlyAccessedItem().screenshots.push({ screenshot: name.value });
        });
    }

    executionFinishedWith(outcome: Outcome): ScenarioReport {
        return this.withMutated(report => this.mapOutcome(outcome, (result: string, error: ErrorDetails = undefined) => {
            report.result = result;
            report.testFailureCause = error;
        }));
    }

    toJSON(): Partial<SerenityBDDReport> {
        const report = this.copyOf(this.report);

        delete report.children; // remove the fake reference

        // todo: optimise the report, remove empty arrays
        return report;
    }

    private mapOutcome(outcome: Outcome, mapAs: (result: string, error?: ErrorDetails) => void) {
        const parse = ScenarioReport.errorParser.parse;

        return match<Outcome, void>(outcome).
            when(ExecutionCompromised,  ({ error }: ExecutionCompromised)  => mapAs('COMPROMISED', parse(error))).
            when(ExecutionFailedWithError,         ({ error }: ExecutionFailedWithError)         => mapAs('ERROR', parse(error))).
            when(ExecutionFailedWithAssertionError,        ({ error }: ExecutionFailedWithAssertionError)       => mapAs('FAILURE', parse(error))).
            when(ExecutionSkipped,      _ => mapAs('SKIPPED')).
            when(ExecutionIgnored,      _ => mapAs('IGNORED')).
            when(ImplementationPending, _ => mapAs('PENDING')).
            else(/* ExecutionSuccessful */ _ => /* ignore */ mapAs('SUCCESS'));
    }

    private withMutated(mutate: (copied: Partial<SerenityBDDReport>) => void): ScenarioReport {
        mutate(this.report);

        return this;
    }

    private copyOf<T extends JSONObject>(json: T): T {
        return JSON.parse(JSON.stringify(json));
    }
}

class Stack<T> {
    private readonly items: T[] = [];
    private mostRecent: T = undefined;

    push(item: T): T {
        this.items.push(item);
        this.mostRecent = item;

        return this.mostRecent;
    }

    pop() {
        const item = this.items.pop();
        this.mostRecent = item;

        return this.mostRecent;
    }

    last() {
        return this.items[this.items.length - 1];
    }

    mostRecentlyAccessedItem() {
        return this.mostRecent;
    }
}