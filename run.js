var colors = require('colors');
var exec = require('child_process');
var fs = require('fs');
var replace = require('replace-in-file');
var request = require('request');
var sleep = require('sleep');
var waterfall = require('async-waterfall');

var testSuite = require('./test-cases.json');
var foreman = require('./foreman.json');

// Setup test variables
var nvocHome = '/home/m1/NVOC/mining';

function callForeman(url, method, callback) {
    const options = {
        url: url,
        method: method,
        timeout: 30000,
        headers: {
            'Authorization': `Token ${foreman.api_key}`
        }
    };
    request(options, callback);
}

function runTest(testCase) {
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
            original1Bash = fs.readFileSync(nvocHome);
            callback(null);
        },
        function(callback) {
            console.log('- Configuring 1bash');
            testCase.config.forEach(function(property) {
                console.log(`-- Setting '${property.key}' to '${property.value}'`);
                try {
                    replace.sync({
                        files: './1bash',
                        from: new RegExp('^' + property.key + '.*', 'i'),
                        to: property.key + '=' + property.value
                    });
                } catch (error) {
                    callback(error);
                }
            });
            callback(null);
        },
        function(callback) {
            console.log('- Purging any miners in Foreman on this pickaxe');
            callForeman(
                `${foreman.api_url}/miners/${foreman.client_id}/${foreman.pickaxe_key}`,
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
                                    `${foreman.api_url}/miners/${foreman.client_id}/${foreman.pickaxe_key}/${miner.id}`,
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
                `${foreman.api_url}/miners/${foreman.client_id}/${foreman.pickaxe_key}`,
                'GET',
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        const miners = JSON.parse(body);
                        if ((miners.length == 1) && 
                            (miners[0].minerType == fmMinerName) && 
                            (miners[0].apiIp == fmMinerApiIp) && 
                            (miners[0].apiPort == fmMinerApiPort)) {
                            callback(null, miners[0].id);
                        }
                    }
                    callback(new Error('Miner never appeared in Foreman'));
                }
            );
        },
        function(minerId, callback) {
            console.log('- Waiting for miner to be seen in Foreman');
            // Lazy - give it 2 minutes
            sleep.sleep(60 * 2);
            callForeman(
                `${fmApiUrl}/miners/${fmClientId}/${fmPickaxe}/${minerId}`,
                'GET',
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        const miner = JSON.parse(body);
                        if (miner.seen) {
                            callback(null);
                        }
                    }
                    callback(new Error('Miner was never marked as seen'));
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
            fs.writeFileSync('./1bash', original1Bash);
            callback(null);
        }
    ], function (err, result) {
        if (err) {
            console.log(colors.red(`FAIL ${testCase.name}: ${err}`));
            if (original1Bash != null) {
                fs.writeFileSync('./1bash', original1Bash);
            }
        } else {
            console.log(colors.green(`- PASSED`));
        }
    });
}

// Run all of the tests
testSuite.forEach(function(test) {
    runTest(test);
});
