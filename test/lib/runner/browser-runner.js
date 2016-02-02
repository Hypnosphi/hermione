'use strict';

var _ = require('lodash'),
    q = require('q'),
    EventEmitter = require('events').EventEmitter,
    BrowserPool = require('../../../lib/browser-pool'),
    BrowserRunner = require('../../../lib/runner/browser-runner'),
    BrowserAgent = require('../../../lib/browser-agent'),
    SuiteRunner = require('../../../lib/runner/suite-runner'),

    makeConfigStub = require('../../utils').makeConfigStub,

    RunnerEvents = require('../../../lib/constants/runner-events');

describe('Browser runner', function() {
    var sandbox = sinon.sandbox.create();

    function mkRunner_(opts) {
        opts = _.defaults(opts || {}, {
            browserId: 'default-browser',
            suites: ['default-suite'],
            browserPool: sinon.createStubInstance(BrowserPool)
        });

        return new BrowserRunner(
            makeConfigStub({browsers: [opts.browserId]}),
            opts.browserId,
            opts.browserPool
        );
    }

    function run_(runner) {
        return runner.run(['some/test']);
    }

    beforeEach(function() {
        sandbox.stub(SuiteRunner.prototype);
        SuiteRunner.prototype.run.returns(q());

        sandbox.stub(BrowserAgent.prototype);
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('constructor', function() {
        it('should create BrowserAgent associated with passed browser', function() {
            mkRunner_({
                browserId: 'browser',
                browserPool: 'some-browser-pool'
            });

            assert.calledWith(BrowserAgent.prototype.__constructor, 'browser', 'some-browser-pool');
        });
    });

    describe('run', function() {
        it('should run all suite runners', function() {
            var filterFn = sinon.spy().named('filterFn');

            return mkRunner_()
                .run(['path/to/suite', 'path/to/another/suite'], filterFn)
                .then(function() {
                    assert.calledTwice(SuiteRunner.prototype.run);
                    assert.calledWith(SuiteRunner.prototype.run, 'path/to/suite', filterFn);
                    assert.calledWith(SuiteRunner.prototype.run, 'path/to/another/suite', filterFn);
                });
        });

        it('should pass browserAgent to suite runner', function() {
            var browserAgent = sinon.stub().named('browserAgent');
            BrowserAgent.prototype.__constructor.returns(browserAgent);

            return mkRunner_()
                .run(['path/to/suite'])
                .then(function() {
                    assert.calledWith(SuiteRunner.prototype.__constructor, sinon.match.any, browserAgent);
                });
        });

        it('should wait until all suite runners will finish', function() {
            var firstResolveMarker = sandbox.stub().named('First resolve marker'),
                secondResolveMarker = sandbox.stub().named('Second resolve marker');

            SuiteRunner.prototype.run.onFirstCall().returns(q().then(firstResolveMarker));
            SuiteRunner.prototype.run.onSecondCall().returns(q.delay(1).then(secondResolveMarker));

            return mkRunner_()
                .run(['path/to/suite', 'path/to/another/suite'])
                .then(function() {
                    assert.called(firstResolveMarker);
                    assert.called(secondResolveMarker);
                });
        });

        it('should be rejected if one of browser runners rejected', function() {
            SuiteRunner.prototype.run.returns(q.reject('Error'));

            var runner = mkRunner_();

            return assert.isRejected(run_(runner), /Error/);
        });
    });

    it('should passthrough events from browser runners', function() {
        var emitter = new EventEmitter();

        emitter.run = sandbox.stub().returns(q());
        SuiteRunner.prototype.__constructor.returns(emitter);

        var runner = mkRunner_({browserId: 'browser'}),
            onTestPass = sandbox.spy().named('onTestPass');

        runner.on(RunnerEvents.TEST_PASS, onTestPass);

        return run_(runner).then(function() {
            emitter.emit(RunnerEvents.TEST_PASS);
            assert.called(onTestPass);
        });
    });
});
