# A test on an order: the lab's orderable test code and its name.
#
# + code - the lab's orderable test code, e.g. `LIPID-ADV`
# + name - the test's display name
type OrderedTest record {|
    string code;
    string name;
|};

# Liveness and configuration of the simulator.
#
# + status - always `ok` while the service is up
# + lab - the lab's display name
# + autoReleaseSeconds - the auto-release delay, or 0 when results are released by hand
type HealthStatus record {|
    "ok" status;
    string lab;
    int autoReleaseSeconds;
|};

# Body of an error response.
#
# + message - what went wrong
type ErrorBody record {|
    string message;
|};

# Raised when an order that already has results is released again.
type AlreadyResulted distinct error;

# Raised when an order is released before its specimen has been collected, or collected twice.
type WrongOrderState distinct error;
