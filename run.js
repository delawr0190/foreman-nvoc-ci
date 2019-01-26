var colors = require('colors');
var exec = require('child_process');
var fs = require('fs');
var request = require('request');
var shell = require('shelljs')
var sleep = require('sleep');
var waterfall = require('async-waterfall');

// Setup test variables
var nvocHome = process.env.NVOC_HOME || '/home/m1/NVOC/mining';
var foremanApiUrl = process.env.FOREMAN_API_URL || 'https://dashboard.foreman.mn/api';

function callForeman(url, method, callback) {
    const options = {
        url: url,
        method: method,
        timeout: 30000,
        headers: {
            'Authorization': `Token ${process.env.FOREMAN_API_KEY}`
        }
    };
    request(options, callback);
}

function update1Bash(property, value) {
    shell.sed('-i', '^' + property + '=.*$', `${property}="${value}"`, `${nvocHome}/1bash`);
}

function runTest(tests, index) {
    testCase = tests[index];

    var original1Bash = null;
    waterfall([
        function(callback) {
            console.log(colors.cyan(`Starting test: ${testCase.name}`));
            callback(null);
        },
        function(callback) {
            console.log('- Stopping nvOC');
            exec.exec(`${nvocHome}/nvOC stop`);
            callback(null);
        },
        function(callback) {
            console.log('- Backing up 1bash');
            original1Bash = fs.readFileSync(`${nvocHome}/1bash`);
            callback(null);
        },
        function(callback) {
            console.log('- Configuring 1bash');
            update1Bash('FOREMAN_MONITOR', 'YES');
            update1Bash('FOREMAN_CLIENT_ID', process.env.FOREMAN_CLIENT_ID);
            update1Bash('FOREMAN_API_KEY', process.env.FOREMAN_API_KEY);
            testCase.config.forEach(function(property) {
                console.log(`-- Setting '${property.key}' to '${property.value}'`);
                update1Bash(property.key, property.value);
            });
            callback(null);
        },
        function(callback) {
            console.log('- Purging any miners in Foreman on this pickaxe');
            callForeman(
                `${foremanApiUrl}/miners/${process.env.FOREMAN_CLIENT_ID}/${process.env.FOREMAN_PICKAXE_KEY}`,
                'GET',
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        const miners = JSON.parse(body);
                        if (miners.length > 0) {
                            var deleted = 0;
                            var toDelete = miners.length;
                            miners.forEach(function(miner) {
                                console.log(`-- Deleting ${miner.name}`);
                                callForeman(
                                    `${foremanApiUrl}/miners/${process.env.FOREMAN_CLIENT_ID}/${process.env.FOREMAN_PICKAXE_KEY}/${miner.id}`,
                                    'DELETE',
                                    function(error, response, body) {
                                        if (error) {
                                            callback(error);
                                        } else {
                                            if (++deleted == toDelete) {
                                                callback(null);
                                            }
                                        }
                                    }
                                );
                            });
                        } else {
                            callback(null);
                        }
                    } else {
                        callback(new Error('Failed to obtain a valid response from Foreman'));
                    }
                }
            );
        },
        function(callback) {
            console.log('- Starting nvOC');
            exec.exec(`${nvocHome}/nvOC start`);
            callback(null);
        },
        function(callback) {
            console.log('- Waiting for miner to appear in Foreman');
            // Lazy - give it 4 minutes
            sleep.sleep(60 * 4);
            callForeman(
                `${foremanApiUrl}/miners/${process.env.FOREMAN_CLIENT_ID}/${process.env.FOREMAN_PICKAXE_KEY}`,
                'GET',
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        const miners = JSON.parse(body);
                        if ((miners.length == 1) && 
                            (miners[0].minerType == testCase.foreman.name) && 
                            (miners[0].apiIp == testCase.foreman.api_ip) && 
                            (miners[0].apiPort == testCase.foreman.api_port)) {
                            callback(null, miners[0].id);
                        } else {
                            callback(new Error('Miner never appeared in Foreman'));
                        }
                    } else {
                        callback(new Error('Obtained an unexpected response from Foreman'));
                    }
                }
            );
        },
        function(minerId, callback) {
            console.log('- Waiting for miner to be seen in Foreman');
            // Lazy - give it 2 minutes
            sleep.sleep(60 * 2);
            callForeman(
                `${foremanApiUrl}/miners/${process.env.FOREMAN_CLIENT_ID}/${process.env.FOREMAN_PICKAXE_KEY}/${minerId}`,
                'GET',
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        const miner = JSON.parse(body);
                        if (miner.seen) {
                            callback(null);
                        } else {
                            callback(new Error('Miner was never marked as seen'));
                        }
                    } else {
                        callback(new Error('Obtained an unexpected response from Foreman'));
                    }
                }
            );
        },
        function(callback) {
            console.log('- Stopping nvOC');
            exec.exec(`${nvocHome}/nvOC stop`);
            callback(null);
        },
        function(callback) {
            console.log('- Restoring 1bash');
            fs.writeFileSync(`${nvocHome}/1bash`, original1Bash);
            callback(null);
        }
    ], function (err, result) {
        if (err) {
            console.log(colors.red(`FAIL ${testCase.name}: ${err}`));
            if (original1Bash != null) {
                fs.writeFileSync(`${nvocHome}/1bash`, original1Bash);
            }
        } else {
            console.log(colors.green(`- PASSED`));
            if (index + 1 < tests.length) {
                runTest(tests, index + 1);
            }
        }
    });
}

// Merge together the tests to be ran
var tests = [];
var testSuite = require('./tests.json');
testSuite.forEach(function(suite) {
    tests.push(...require(`./tests/${suite}`));
});

// Run all of the tests - recursive
console.log(tests.length + ' tests will be run!');
runTest(tests, 0);
