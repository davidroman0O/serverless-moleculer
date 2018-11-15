![Moleculer logo](http://moleculer.services/images/banner.png)

# Serverless-Moleculer

Serverless Framework & Moleculer !

Note : available for the impatients :smile: ! I'll add a better documentation and a start kit for beginner (with serverless-fuck-you-4kb too).

# Install

You already know it : `npm install --save serverless-moleculer`

# How to use it

On your `serverless.yml` file, create a new function :

```yaml
HelloWorld:
    name: "serverless-moleculer-hello-world"
    handler: handler.HelloWorld
    memorySize: 256
    timeout: 30
    events:
      - http:
          path: /
          method: any
          cors:
            origin: '*'
            headers:
              - Content-Type
              - X-Amz-Date
              - Authorization
              - X-Api-Key
              - X-Amz-Security-Token
              - X-Amz-User-Agent
            allowCredentials: false
```

On your function `handler.js` that contain your basic lambda handler, replace everything with :

```javascript
const Moleculer = require("serverless-moleculer");

module.exports = Moleculer({
    settings: {
        json: true, // Do you want the event.body to be parsed? By default, it's a string
        service: {
            log: false, // Do you want all logs of the the lib? Set false in prod plz
            listAll: false // Do you want to list all actions loaded? Set false in prod plz
        },
        response: {
            log: false, // Do you want to see the response log? Set false in prod plz
        }
    },
    // You got a plugin and you want to trigger it first? 
    plugins: [
        (event, context, callback) => {
            if (event.source === 'serverless-plugin-warmup') {
                context.callbackWaitsForEmptyEventLoop = false;
                callback(null, {
                    message: "Just warm"
                });
                return true;
            }
        }
    ],
    // Every global moleculer middlewares are loaded here
    middlewares: [
        require("./services/someMiddlware")
    ],
    services: [
        "services/global/health-to-sqs.js",
        require("./services/global/ping"),
    ],
    lambdas: {
        // Mandatory, we use it you create your function reference base on the "handler: handler.HelloWorld" line
        "HelloWorld": {
            services: [
                "services/math.service.js",
                require("./services/allo.service"),
            ],
            // Mandatory, we use the process.env.AWS_LAMBDA_FUNCTION_NAME to load quickly your lambda !!
            name: "serverless-moleculer-hello-world",
            // Optional : action or handler(ctx) -> NOT BOTH
            action: "service.someAction",
            // OR
            handler(ctx) {
                this.logger.info("Hello World");
                return "Response for the body";
            }
        },
    }
})

```

