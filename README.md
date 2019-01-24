# foreman-nvoc-ci

foreman-nvoc-ci provides a node test bed for validating the integration of Foreman and nvOC.  This serves as a framework for dynamically adding and testing miners as they're added to nvOC, guaranteeing that future releases of nvOC will seamlessly work with the Foreman dashboard.

For each test that's defined, the following actions are performed:

1. Configure `1bash` for the miner based on the criteria defined in the test suite.
2. Start nvOC.
3. Verify that a miner is created in Foreman (this implies that the miner is successfully running in nvOC).
4. Verify that the miner shows metrics in Foreman.
5. Stop nvOC.
5. Revert `1bash` to the state it was in before the test was started.
6. Print a test result (PASS or FAIL).

## Running ##

At some point in the near future, this test bed will be containerized (following the completion of an nvOC container, first).  For now, the following dependencies are required:

```
npm 6.7.0
node 11.7.0
```

To test:

1. Clone this repository onto an nvOC rig.
2. Perform an `npm install` to install testing dependencies.
3. Set your FOREMAN_CLIENT_ID via `export FOREMAN_CLIENT_ID=<value here>`.
4. Set your FOREMAN_API_KEY via `export FOREMAN_API_KEY=<value here>`.
5. Set your FOREMAN_PICKAXE_KEY via `export FOREMAN_PICKAXE_KEY=<value here>`.  **Note:** you this pickaxe key should point to a pickaxe with no miners on it - during testing, miners will be added and removed, so if you don't chose an empty pickaxe, you will lose miners.
6. Run `node run.js`.

Test results will be printed to the screen.

## Adding Tests ##

All of the test cases are defined in `test-cases.json`.  Follow the JSON structure there to add new miner tests.

## License ##

Copyright © 2018, [OBM LLC](https://obm.mn/).  Released under the [GPL-3.0 License](LICENSE).
