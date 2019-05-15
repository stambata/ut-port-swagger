const definitions = require('./definitions');
const generateSchema = require('generate-schema');
const interpolationRegex = /^\$\{[\w]+(\.[\w]+)*\}$/g;
const interpolate = (schema, context) => {
    switch (typeof schema) {
        case 'string':
            if (interpolationRegex.test(schema)) {
                const tokens = schema.slice(2, -1).split('.');
                while (tokens.length) {
                    context = context[tokens.shift()];
                    if (!context) {
                        return schema;
                    }
                }
                return context;
            }
            return schema;
        case 'object':
            if (Array.isArray(schema)) {
                return schema.map(item => interpolate(item, context));
            } else {
                return Object.keys(schema).reduce((all, key) => {
                    all[key] = interpolate(schema[key], context);
                    return all;
                }, {});
            }
        default:
            return schema;
    }
};

module.exports = (port, {
    document,
    staticRoutesPrefix,
    namespace,
    schemas,
    context
}) => {
    const paths = {};
    const handlers = {};

    function getPath(path) {
        return staticRoutesPrefix ? `${staticRoutesPrefix}${path}` : path;
    }

    function contextRoutes(data = context, path = '/context') {
        const tokens = [namespace].concat(path.split('/').filter(x => x));
        const method = tokens.join('.');
        const schema = generateSchema.json(tokens.join(' '), data);
        // delete $schema property as it is in conflict with swagger 2 specification
        delete schema.$schema;

        handlers[method] = () => ({response: data});
        paths[getPath(path)] = {
            get: {
                operationId: method,
                tags: ['metadata'],
                description: method,
                'x-bus-method': method,
                responses: {
                    default: {
                        description: 'Invalid request.',
                        schema: definitions.error
                    },
                    200: {
                        description: 'Record successfully obtained',
                        schema
                    }
                }
            }
        };
        if (typeof data === 'object' && !Array.isArray(data)) {
            Object.keys(data).forEach(key => contextRoutes(data[key], `${path}/${key}`));
        }
    };

    function schemasInventoryRoute() {
        const method = `${namespace}.schemas`;
        handlers[method] = () => ({
            response: Object.keys(schemas).reduce((all, key) => {
                all[key] = getPath(`/schemas/${key}`);
                return all;
            }, {})
        });
        paths[getPath('/schemas')] = {
            get: {
                operationId: method,
                tags: ['metadata'],
                description: method,
                'x-bus-method': method,
                responses: {
                    default: {
                        description: 'Invalid request.',
                        schema: definitions.error
                    },
                    200: {
                        description: 'schemas definitions',
                        schema: {
                            type: 'object',
                            properties: {},
                            additionalProperties: true
                        }
                    }
                }
            }
        };
    }

    function schemasRoutes() {
        Object.entries(schemas).forEach(([key, schema]) => {
            const method = `${namespace}.schemas.${key}`;
            const schemaSchema = generateSchema.json(`schema ${key}`, schema);
            // delete $schema property as it is in conflict with swagger 2 specification
            delete schemaSchema.$schema;
            handlers[method] = () => ({response: schema});
            paths[getPath(`/schemas/${key}`)] = {
                get: {
                    operationId: method,
                    tags: ['metadata'],
                    description: method,
                    'x-bus-method': method,
                    responses: {
                        default: {
                            description: 'Invalid request.',
                            schema: definitions.error
                        },
                        200: {
                            description: `${key} schema`,
                            schema: schemaSchema
                        }
                    }
                }
            };
        });
    }

    function healthRoute() {
        const method = `${namespace}.health`;
        handlers[method] = () => ({
            status: port.isReady ? 200 : 503,
            response: {
                state: port.state
            }
        });
        paths[getPath('/healthz')] = {
            get: {
                operationId: method,
                tags: ['metadata'],
                description: method,
                'x-bus-method': method,
                responses: {
                    default: {
                        description: 'Invalid request.',
                        schema: definitions.error
                    },
                    200: {
                        description: 'Service is ready',
                        schema: {
                            type: 'object',
                            properties: {
                                state: {
                                    type: 'string'
                                }
                            },
                            additionalProperties: false
                        }
                    },
                    503: {
                        description: 'Service is started but it is not ready yet',
                        schema: {
                            type: 'object',
                            properties: {
                                state: {
                                    type: 'string'
                                }
                            },
                            additionalProperties: false
                        }
                    }
                }
            }
        };
    }

    contextRoutes();
    schemasInventoryRoute();
    schemasRoutes();
    healthRoute();

    const swaggerDocument = interpolate(document, context);
    Object.assign(swaggerDocument.paths, paths);

    return {swaggerDocument, handlers};
};
