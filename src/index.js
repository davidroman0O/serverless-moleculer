const {
    ServiceBroker
} = require("moleculer");
const {
    MoleculerError
} = require("moleculer").Errors;
const Promise = require("bluebird");
const has = require("lodash/has");

const Moleculer = (gateway, lambda) => {

	let brokerParams = gateway.settings || {};

	brokerParams.middlewares = [];

	/*
		@description: we MUST desactivate those 'cause they are useless in the lambda env
	*/
	if (!gateway.settings.internalMiddlewares) {
		brokerParams.internalMiddlewares = false; // tracking and stuffs... don't need that
	} else {
		brokerParams.internalMiddlewares = gateway.settings.internalMiddlewares;
	}

	if (!gateway.settings.internalServices) {
		brokerParams.internalServices = false; // node.* don't need that
	} else {
		brokerParams.internalServices = gateway.settings.internalServices;
	}

	/*
		@description: if we got global middlewares, just add them
	*/
	if (gateway.middlewares) {
		brokerParams.middlewares = gateway.middlewares;
	}

	/*
		@description: if the lambda have a local middlewares, just add them
	*/
	if (lambda.middlewares) {
		lambda.middlewares.forEach(m => {
			brokerParams.middlewares.push(m)
		});
	}

	const broker = new ServiceBroker(brokerParams);

	if (gateway.services) {
		if (typeof gateway.services == "function") {
			gateway.services = gateway.services();
		}
		gateway.services.forEach(s => {
			broker.createService(require(s));
			if (has(gateway, "settings.service.log") && gateway.settings.service.log) {
				console.log(`𝛌 - global - '${s}' is created`);
			}
		});
	}

	/*
		@description: if the lambda have some specific services to load, load them
	*/
	if (lambda.services) {
		if (typeof lambda.services == "function") {
			lambda.services = lambda.services();
		}
		lambda.services.forEach(s => {
			broker.createService(require(s));
			if (has(gateway, "settings.service.log") && gateway.settings.service.log) {
				console.log(`𝛌 - '${s}' is created`);
			}
		});
	}

	if (has(gateway, "settings.service.listAll") && gateway.settings.service.listAll) {
		broker.services.forEach(s => {
			Object.keys(s.actions).forEach(a => {
				console.log(`𝛌 - ${s.fullName}.${a} is registred`);
			});
		});
	}

	return broker;
}

module.exports = function(gateway) {
	try {
		if (has(gateway, "settings.service.executionTime") && gateway.settings.service.executionTime) {
			console.time("Execution");
		}

		const formatResponse = (code, headers, body) => {
			let localHeaders = {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Credentials': true,
			};
			if (headers) {
				Object.keys(headers).forEach((k) => {
					localHeaders[k] = headers[k];
				});
			}
			if (has(gateway, "settings.response.log") && gateway.settings.response.log) {
				console.log(`𝛌 - response : `, code, headers, body);
			}
			return {
				headers: localHeaders,
				statusCode: code,
				body: JSON.stringify(body)
			};
		};

		const formatSuccess = (response) => {
			let body = undefined;
			let code = 200;
			let headers = {};

			if (!has(response, "body")) {
				body = response;
				code = 200;
			} else {
				body = response.body;
				code = response.code;
				headers = response.headers || {};
			}
			return formatResponse(
				code,
				headers,
				body
			);
		};

		const formatError = (error) => {
			console.error(error);
			return formatResponse(
				error.code || 500,
				null,
				{
					type: error.type || "Critical",
					data: error.data || error.toString()
				}
			);
		};
		// console.log("𝛌 - Welcome to 𝛌", process.env.AWS_LAMBDA_FUNCTION_NAME);
		// console.log("𝛌 - ", gateway);
		/*
			@description: will filter the correct lambda depending of the SLS env var
		*/
		const lambda = Object.keys(gateway.lambdas).map(o => {
			if (gateway.lambdas[o].name == process.env.AWS_LAMBDA_FUNCTION_NAME) {
				gateway.lambdas[o].rawName = o;
				return gateway.lambdas[o];
			}
			return undefined;
		}).filter(Boolean)[0];

		// console.log("𝛌 - SLS call ", lambda);

		let handler = {};

		handler[lambda.rawName] = (event, context, callback) => {
			/*
				@description: parse into json
			*/
			if (has(gateway, "settings.json") && gateway.settings.json) {
				if (typeof event.body == "string") {
					event.body = JSON.parse(event.body);
				}
			}

			let interrupt = false;
			if (has(gateway, "plugins")) {
				gateway.plugins.forEach(plugin => {
					if (typeof plugin == "function") {
						interrupt = plugin(event, context, callback);
					}
				});
			}

			if (interrupt) {
				return;
			}

			const broker = Moleculer(gateway, lambda);

			let params = {
				event: event,
				context: context
			};

			let brokerPromise = Promise.resolve();

			if (lambda.action && !lambda.handler) {
				/*
					@description: this action will recieve the
				*/
				brokerPromise = () => broker.call(lambda.action, params);
			} else if (!lambda.action && lambda.handler) {
				/*
					@description: will handle the handler
				*/
				lambda.handler = lambda.handler.bind(broker);
				brokerPromise = () => lambda.handler(Object.assign(broker, { params: params }));
			} else {
				throw new Error("You have neither handler or action to handle");
			}

			broker.start()
			.then(brokerPromise)
			.then((response) => {
				if (!response) {
					throw new Error("Please return something from your lambda");
				}
				return broker.stop()
				.then(() => {
					if (has(gateway, "settings.service.executionTime") && gateway.settings.service.executionTime) {
						try {
							console.timeEnd("Execution");
						} catch(e) {
							console.log("𝛌 - Can't get execution time but that's ok");
						}
					}
					callback(null, formatSuccess(response));
				})
			})
			.catch((error) => {
				return broker.stop()
				.then(() => {
					if (has(gateway, "settings.service.executionTime") && gateway.settings.service.executionTime) {
						try {
							console.timeEnd("Execution");
						} catch(e) {
							console.log("𝛌 - Can't get execution time but that's ok");
						}
					}
					callback(null, formatError(error));
				})
			});
		}

		return handler;
	} catch(e) {
		// If something happen here, you're basiclly fucked.
		console.error("𝛌 - Error", e);
	}
}
